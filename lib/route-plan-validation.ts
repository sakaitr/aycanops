import type { DbClient } from "./db";
import { RequestError } from "./request-error";

export type RoutePlan = Record<string, unknown> & {
  id: string; company_id: string | null; shift_id: string | null;
  status: string; direction: string; version_no: number;
};

const DAY_MINUTES = 1440;

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** expected_time ± tolerans, ham (normalize edilmemiş) dakika aralığı — gece yarısını
 * sarmalayan vardiyalarda start<0 veya end>1440 olabilir, bu kasıtlı (bkz. windowsOverlap). */
function toleranceWindow(expectedTime: string, toleranceEarly: number, toleranceLate: number) {
  const center = timeToMinutes(expectedTime);
  return { start: center - toleranceEarly, end: center + toleranceLate };
}

/** Her gün tekrar eden iki vardiya penceresi çakışıyor mu? Pencereler günden bağımsız
 * (sadece saat) olduğundan, biri diğerine göre ±1 gün kaydırılmış haliyle de
 * karşılaştırılır — aksi halde örn. 23:50–00:10 ile 00:05–00:15 çakışması kaçırılır. */
function windowsOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  for (const shift of [-DAY_MINUTES, 0, DAY_MINUTES]) {
    if (a.start < b.end + shift && b.start + shift < a.end) return true;
  }
  return false;
}

type ConflictRoute = { id: string; name: string; vehicle_id: string | null; driver_id: string | null };

/** Aynı araç/sürücü başka bir AKTİF planda çakışan saatte kullanılıyorsa yayını engeller.
 * direction'a bakılmaz: gerçek çakışma saat penceresiyle belirlenir (aynı araç sabah
 * bu planda, akşam başka planda olması normaldir — saatleri çakışmadığı için). */
export async function assertNoResourceConflict(db: Pick<DbClient, "prepare">, plan: RoutePlan, routes: ConflictRoute[]) {
  const shift = await db.prepare("SELECT expected_time, tolerance_early, tolerance_late FROM company_shifts WHERE id = ?")
    .get<{ expected_time: string; tolerance_early: number; tolerance_late: number }>(plan.shift_id);
  if (!shift) return;
  const thisWindow = toleranceWindow(shift.expected_time, shift.tolerance_early, shift.tolerance_late);

  for (const route of routes) {
    for (const [column, resourceId, label] of [
      ["vehicle_id", route.vehicle_id, "Araç"],
      ["driver_id", route.driver_id, "Sürücü"],
    ] as const) {
      if (!resourceId) continue;
      const conflicts = await db.prepare(
        `SELECT rp.id, rp.name, cs.expected_time, cs.tolerance_early, cs.tolerance_late
         FROM route_plan_routes rpr
         JOIN route_plans rp ON rp.id = rpr.route_plan_id
         JOIN company_shifts cs ON cs.id = rp.shift_id
         WHERE rpr.${column} = ? AND rp.status = 'active' AND rp.id <> ?`
      ).all<{ id: string; name: string; expected_time: string; tolerance_early: number; tolerance_late: number }>(resourceId, plan.id);
      for (const conflict of conflicts) {
        const otherWindow = toleranceWindow(conflict.expected_time, conflict.tolerance_early, conflict.tolerance_late);
        if (windowsOverlap(thisWindow, otherWindow))
          throw new RequestError(`${route.name}: ${label} başka aktif bir planla çakışan vardiya saatinde kullanılıyor ("${conflict.name}")`, 409);
      }
    }
  }
}

/** Validate saved plan facts; optimization is optional, suitability is not. */
export async function validatePlanForPublication(db: Pick<DbClient, "prepare">, plan: RoutePlan) {
  const shift = await db.prepare("SELECT expected_time FROM company_shifts WHERE id=? AND company_id=? AND active=1 FOR UPDATE")
    .get<{ expected_time: string }>(plan.shift_id, plan.company_id);
  if (!shift || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(shift.expected_time))
    throw new RequestError("Yayın için firmaya ait aktif vardiya ve geçerli saat gerekli", 409);
  const routes = await db.prepare("SELECT * FROM route_plan_routes WHERE route_plan_id=? ORDER BY id FOR UPDATE")
    .all<{ id: string; vehicle_id: string | null; driver_id: string | null; name: string }>(plan.id);
  if (!routes.length) throw new RequestError("Yayınlamak için en az bir plan rotası gerekli", 409);
  const evidence = [];
  for (const route of routes) {
    const vehicle = await db.prepare(`SELECT v.id, v.plate, v.capacity, v.status_code FROM vehicles v WHERE v.id=?
      AND EXISTS (SELECT 1 FROM company_vehicles cv WHERE cv.company_id=? AND cv.is_active=1
        AND (cv.vehicle_id=v.id OR (cv.vehicle_id IS NULL AND cv.plate=v.plate))) FOR UPDATE`)
      .get<{ id: string; plate: string; capacity: number; status_code: string }>(route.vehicle_id, plan.company_id);
    if (!vehicle || vehicle.status_code !== "active" || !Number.isInteger(Number(vehicle.capacity)) || Number(vehicle.capacity) <= 0)
      throw new RequestError(`${route.name}: firmaya bağlı aktif araç ve geçerli kapasite gerekli`, 409);
    if (route.driver_id) {
      const driver = await db.prepare("SELECT id, status FROM drivers WHERE id = ? FOR UPDATE")
        .get<{ id: string; status: string }>(route.driver_id);
      if (!driver || driver.status !== "aktif") throw new RequestError(`${route.name}: atanmış sürücü aktif değil`, 409);
    }
    const stops = await db.prepare("SELECT * FROM route_plan_stops WHERE route_plan_route_id=? ORDER BY stop_order,id FOR UPDATE")
      .all<{ id: string; lat: number | null; lng: number | null; assigned_passenger_count: number }>(route.id);
    if (!stops.length || stops.some(s => s.lat == null || s.lng == null || !Number.isFinite(Number(s.lat)) ||
      !Number.isFinite(Number(s.lng)) || Math.abs(Number(s.lat)) > 90 || Math.abs(Number(s.lng)) > 180))
      throw new RequestError(`${route.name}: koordinatları geçerli en az bir durak gerekli`, 409);
    let passengers = 0;
    for (const stop of stops) {
      const assignments = await db.prepare("SELECT passenger_id FROM route_plan_assignments WHERE route_plan_stop_id=? FOR UPDATE")
        .all<{ passenger_id: string }>(stop.id);
      const stored = Number(stop.assigned_passenger_count);
      if (!Number.isInteger(stored) || stored < 0) throw new RequestError(`${route.name}: yolcu sayısı geçersiz`, 409);
      passengers += Math.max(stored, assignments.length);
    }
    if (passengers > Number(vehicle.capacity))
      throw new RequestError(`${route.name}: planlanan kapasite aşıldı (${passengers}/${vehicle.capacity})`, 409);
    evidence.push({ route, vehicle, stops, passengers });
  }
  return { shift, routes: evidence };
}
