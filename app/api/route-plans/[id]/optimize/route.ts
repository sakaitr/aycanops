import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { logAudit } from "@/lib/audit";
import { lockEditablePlan } from "@/lib/route-plan-lock";
import { geocodeAddress } from "@/lib/geocode";
import { planRoutes, type PlanPersonnel, type PlanVehicle } from "@/lib/planner";

const PALETTE = ["#2563eb", "#16a34a", "#dc2626", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];

// POST /api/route-plans/[id]/optimize
// Body: { depot_lat, depot_lng } | { depot_address } | { }  (depot yoksa firmanın
//       ilk route stops_json company-location'ı denenir)
//       opsiyonel: vehicle_ids[]  (yoksa firmanın aktif güzergah araçları)
// Planı VROOM+Valhalla ile optimize eder, route_plan_* tablolarına yazar,
// route_plan_versions snapshot alır, öncesi/sonrası metrik döner.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "routes:optimize"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const db = getDb();

    const plan = await db
      .prepare(`SELECT * FROM route_plans WHERE id = ? LIMIT 1`)
      .get<any>(id);
    if (!plan) return NextResponse.json({ ok: false, error: "Plan bulunamadı" }, { status: 404 });
    if (!plan.company_id)
      return NextResponse.json({ ok: false, error: "Planın firması yok, optimize edilemez" }, { status: 400 });

    if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(plan.company_id))
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
    }
    if (!["draft", "published"].includes(String(plan.status)))
      return NextResponse.json({ ok: false, error: "Bu durumdaki plan optimize edilemez" }, { status: 400 });

    // ── Depot ────────────────────────────────────────────────────────
    let depotLat = Number(body?.depot_lat);
    let depotLng = Number(body?.depot_lng);
    if (!Number.isFinite(depotLat) || !Number.isFinite(depotLng)) {
      if (typeof body?.depot_address === "string" && body.depot_address.trim()) {
        const g = await geocodeAddress(body.depot_address.trim());
        if (g) { depotLat = g.lat; depotLng = g.lng; }
      }
    }
    if (!Number.isFinite(depotLat) || !Number.isFinite(depotLng)) {
      // firmanın herhangi bir güzergahındaki company-location durağı
      const routesWithStops = await db
        .prepare(`SELECT stops_json FROM routes WHERE company_id = ? AND is_active = 1 AND stops_json IS NOT NULL`)
        .all<{ stops_json: string }>(plan.company_id);
      for (const r of routesWithStops) {
        try {
          const stops = JSON.parse(r.stops_json || "[]");
          const cs = Array.isArray(stops) ? stops.find((s: any) => s?.is_company_location && s?.lat && s?.lng) : null;
          if (cs) { depotLat = Number(cs.lat); depotLng = Number(cs.lng); break; }
        } catch { /* ignore */ }
      }
    }
    if (!Number.isFinite(depotLat) || !Number.isFinite(depotLng)) {
      return NextResponse.json(
        { ok: false, error: "Depo konumu belirlenemedi. depot_lat/depot_lng veya depot_address gönderin." },
        { status: 400 },
      );
    }

    // ── Personel (koordinatlı aktif yolcular) ────────────────────────
    const pRows = await db
      .prepare(
        `SELECT id, full_name, pickup_lat, pickup_lng FROM passengers
         WHERE company_id = ? AND status = 'aktif' AND pickup_lat IS NOT NULL AND pickup_lng IS NOT NULL`,
      )
      .all<{ id: string; full_name: string; pickup_lat: number; pickup_lng: number }>(plan.company_id);
    const personnel: PlanPersonnel[] = pRows.map((p) => ({
      id: p.id,
      name: p.full_name,
      lat: Number(p.pickup_lat),
      lng: Number(p.pickup_lng),
    }));
    if (personnel.length === 0)
      return NextResponse.json(
        { ok: false, error: "Koordinatı olan aktif yolcu yok. Önce yolcu adreslerini geokodlayın." },
        { status: 400 },
      );

    // ── Araçlar ─────────────────────────────────────────────────────
    const vehicleIds: string[] = Array.isArray(body?.vehicle_ids) ? body.vehicle_ids : [];
    const vRows =
      vehicleIds.length > 0
        ? await db
            .prepare(
              `SELECT id, plate, capacity FROM vehicles
               WHERE id IN (${vehicleIds.map(() => "?").join(",")}) AND status_code = 'active'`,
            )
            .all<{ id: string; plate: string; capacity: number }>(...vehicleIds)
        : await db
            .prepare(
              `SELECT DISTINCT v.id, v.plate, v.capacity FROM vehicles v
               JOIN routes r ON r.vehicle_id = v.id
               WHERE r.company_id = ? AND r.is_active = 1 AND v.status_code = 'active'`,
            )
            .all<{ id: string; plate: string; capacity: number }>(plan.company_id);

    if (vRows.length === 0)
      return NextResponse.json(
        { ok: false, error: "Uygun araç yok. vehicle_ids gönderin ya da firmanın güzergahlarına araç atayın." },
        { status: 400 },
      );

    const vehicles: PlanVehicle[] = vRows.map((v) => ({
      id: v.id,
      label: v.plate,
      capacity: Math.max(1, Number(v.capacity) || 14),
      depot_lat: depotLat,
      depot_lng: depotLng,
    }));

    // ── Önceki metrik ───────────────────────────────────────────────
    const before = await db
      .prepare(
        `SELECT COUNT(DISTINCT rpr.id) AS arac,
                COALESCE(SUM(CAST(JSON_EXTRACT(rpr.metrics_json, '$.distance_meters') AS DECIMAL(12,2))), 0) AS metre
         FROM route_plan_routes rpr WHERE rpr.route_plan_id = ?`,
      )
      .get<{ arac: number; metre: number }>(id);

    // ── Optimize ────────────────────────────────────────────────────
    const result = await planRoutes({ personnel, vehicles });

    // ── Yaz ─────────────────────────────────────────────────────────
    const now = nowIso();
    const current = await loadPlanSnapshot(db, id);
    const nextVersion = Number(plan.version_no || 1) + 1;

    const metrics = {
      engine: result.engine,
      total_distance_m: result.total_distance,
      total_duration_s: result.total_duration,
      arac_sayisi: result.vehicles.filter((v) => v.stops.length > 0).length,
      atanmamis: result.unassigned.length,
      optimize_at: now,
    };

    await db.transaction(async (conn) => {
      await lockEditablePlan(conn, id, plan);
      await conn.execute(
        `INSERT INTO route_plan_versions (id, route_plan_id, version_no, snapshot_json, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [uuidv4(), id, Number(plan.version_no || 1), JSON.stringify(current), user.id, now],
      );
      await conn.execute(
        `UPDATE route_plans SET status='draft', version_no=?, metrics_json=?, updated_at=? WHERE id=?`,
        [nextVersion, JSON.stringify(metrics), now, id],
      );
      // eski route_plan_* temizle
      await conn.execute(
        `DELETE rpa FROM route_plan_assignments rpa
         JOIN route_plan_stops rps ON rps.id = rpa.route_plan_stop_id
         JOIN route_plan_routes rpr ON rpr.id = rps.route_plan_route_id
         WHERE rpr.route_plan_id = ?`,
        [id],
      );
      await conn.execute(
        `DELETE rps FROM route_plan_stops rps
         JOIN route_plan_routes rpr ON rpr.id = rps.route_plan_route_id
         WHERE rpr.route_plan_id = ?`,
        [id],
      );
      await conn.execute(`DELETE FROM route_plan_routes WHERE route_plan_id = ?`, [id]);

      let ri = 0;
      for (const vres of result.vehicles) {
        if (vres.stops.length === 0) continue;
        const rprId = uuidv4();
        await conn.execute(
          `INSERT INTO route_plan_routes (id, route_plan_id, route_id, vehicle_id, driver_id, name, color, route_order, geometry_json, metrics_json, created_at, updated_at)
           VALUES (?, ?, NULL, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
          [
            rprId,
            id,
            vres.vehicle_id,
            vres.vehicle_label,
            PALETTE[ri % PALETTE.length],
            ri,
            JSON.stringify(vres.geometry),
            JSON.stringify({ distance_meters: vres.distance_meters, duration_seconds: vres.duration_seconds, stop_count: vres.stops.length }),
            now,
            now,
          ],
        );
        for (const [si, st] of vres.stops.entries()) {
          const stopId = uuidv4();
          await conn.execute(
            `INSERT INTO route_plan_stops (id, route_plan_route_id, name, lat, lng, stop_order, locked, assigned_passenger_count, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
            [stopId, rprId, st.name, st.lat, st.lng, si, now, now],
          );
          await conn.execute(
            `INSERT INTO route_plan_assignments (id, route_plan_stop_id, passenger_id, walking_distance_m, created_at)
             VALUES (?, ?, ?, NULL, ?)`,
            [uuidv4(), stopId, st.id, now],
          );
        }
        ri += 1;
      }
    await logAudit({
      actorUserId: user.id,
      action: "route_plan.optimize",
      entityType: "route_plan",
      entityId: id,
      details: {
        engine: result.engine,
        arac: metrics.arac_sayisi,
        atanmamis: metrics.atanmamis,
        km: Math.round(result.total_distance / 100) / 10,
      },
    }, conn);
    });

    return NextResponse.json({
      ok: true,
      data: {
        engine: result.engine,
        oncesi: { arac_sayisi: Number(before?.arac ?? 0), km: Math.round(Number(before?.metre ?? 0) / 100) / 10 },
        sonrasi: { arac_sayisi: metrics.arac_sayisi, km: Math.round(result.total_distance / 100) / 10 },
        atanmamis: result.unassigned.map((p) => ({ id: p.id, name: p.name })),
        version_no: nextVersion,
      },
    });
  } catch (e) {
    return apiError(e);
  }
}

async function loadPlanSnapshot(db: ReturnType<typeof getDb>, id: string) {
  const plan = await db.prepare(`SELECT * FROM route_plans WHERE id = ?`).get<any>(id);
  const routes = await db.prepare(`SELECT * FROM route_plan_routes WHERE route_plan_id = ?`).all<any>(id);
  return { plan, routes };
}
