import type { DbClient } from "./db";
import { RequestError } from "./request-error";

export type RoutePlan = Record<string, unknown> & {
  id: string; company_id: string | null; shift_id: string | null;
  status: string; direction: string; version_no: number;
};

/** Validate saved plan facts; optimization is optional, suitability is not. */
export async function validatePlanForPublication(db: Pick<DbClient, "prepare">, plan: RoutePlan) {
  const shift = await db.prepare("SELECT expected_time FROM company_shifts WHERE id=? AND company_id=? AND active=1 FOR UPDATE")
    .get<{ expected_time: string }>(plan.shift_id, plan.company_id);
  if (!shift || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(shift.expected_time))
    throw new RequestError("Yayın için firmaya ait aktif vardiya ve geçerli saat gerekli", 409);
  const routes = await db.prepare("SELECT * FROM route_plan_routes WHERE route_plan_id=? ORDER BY id FOR UPDATE")
    .all<{ id: string; vehicle_id: string | null; name: string }>(plan.id);
  if (!routes.length) throw new RequestError("Yayınlamak için en az bir plan rotası gerekli", 409);
  const evidence = [];
  for (const route of routes) {
    const vehicle = await db.prepare(`SELECT v.id, v.plate, v.capacity, v.status_code FROM vehicles v WHERE v.id=?
      AND EXISTS (SELECT 1 FROM company_vehicles cv WHERE cv.company_id=? AND cv.is_active=1
        AND (cv.vehicle_id=v.id OR (cv.vehicle_id IS NULL AND cv.plate=v.plate))) FOR UPDATE`)
      .get<{ id: string; plate: string; capacity: number; status_code: string }>(route.vehicle_id, plan.company_id);
    if (!vehicle || vehicle.status_code !== "active" || !Number.isInteger(Number(vehicle.capacity)) || Number(vehicle.capacity) <= 0)
      throw new RequestError(`${route.name}: firmaya bağlı aktif araç ve geçerli kapasite gerekli`, 409);
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
