import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { logAudit } from "@/lib/audit";

type RoutePayload = {
  id?: string;
  route_id?: string | null;
  vehicle_id?: string | null;
  driver_id?: string | null;
  name?: string;
  color?: string | null;
  route_order?: number;
  geometry?: unknown;
  metrics?: unknown;
  stops?: Array<{ id?: string; name?: string; lat?: number | null; lng?: number | null; stop_order?: number; locked?: boolean; assigned_passenger_count?: number; passengers?: Array<{ passenger_id: string; walking_distance_m?: number | null }> }>;
};

async function loadPlan(db: ReturnType<typeof getDb>, id: string) {
  const plan = await db.prepare(
    `SELECT rp.*, c.name AS company_name, cs.shift_name
     FROM route_plans rp
     LEFT JOIN companies c ON c.id = rp.company_id
     LEFT JOIN company_shifts cs ON cs.id = rp.shift_id
     WHERE rp.id = ?
     LIMIT 1`
  ).get<any>(id);
  if (!plan) return null;
  const routes = await db.prepare(
    `SELECT * FROM route_plan_routes WHERE route_plan_id = ? ORDER BY route_order ASC, name ASC`
  ).all<any>(id);
  const routeIds = routes.map(route => route.id);
  let stops: any[] = [];
  let assignments: any[] = [];
  if (routeIds.length > 0) {
    stops = await db.prepare(
      `SELECT * FROM route_plan_stops WHERE route_plan_route_id IN (${routeIds.map(() => "?").join(",")}) ORDER BY stop_order ASC, name ASC`
    ).all<any>(...routeIds);
    const stopIds = stops.map(stop => stop.id);
    if (stopIds.length > 0) {
      assignments = await db.prepare(
        `SELECT rpa.*, p.full_name AS passenger_name
         FROM route_plan_assignments rpa
         LEFT JOIN passengers p ON p.id = rpa.passenger_id
         WHERE rpa.route_plan_stop_id IN (${stopIds.map(() => "?").join(",")})`
      ).all<any>(...stopIds);
    }
  }
  return {
    ...plan,
    metrics: plan.metrics_json ? JSON.parse(plan.metrics_json) : null,
    routes: routes.map(route => ({
      ...route,
      geometry: route.geometry_json ? JSON.parse(route.geometry_json) : null,
      metrics: route.metrics_json ? JSON.parse(route.metrics_json) : null,
      stops: stops.filter(stop => stop.route_plan_route_id === route.id).map(stop => ({
        ...stop,
        passengers: assignments.filter(a => a.route_plan_stop_id === stop.id),
      })),
    })),
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "routes:read")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { id } = await params;
    const db = getDb();
    const data = await loadPlan(db, id);
    if (!data) return NextResponse.json({ ok: false, error: "Plan bulunamadı" }, { status: 404 });
    if (data.company_id && user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(data.company_id)) {
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
      }
    }
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return apiError(e);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "routes:optimize")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const current = await loadPlan(db, id);
    if (!current) return NextResponse.json({ ok: false, error: "Plan bulunamadı" }, { status: 404 });
    if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (current.company_id && !allowed.includes(current.company_id)) {
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
      }
      if (body.company_id && !allowed.includes(body.company_id)) {
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
      }
    }
    if (!["draft", "published"].includes(String(current.status))) return NextResponse.json({ ok: false, error: "Bu durumdaki plan düzenlenemez" }, { status: 400 });

    const now = nowIso();
    const nextVersion = Number(current.version_no || 1) + 1;
    const routes = Array.isArray(body.routes) ? body.routes as RoutePayload[] : [];

    await db.transaction(async (conn) => {
      await conn.execute(
        `INSERT INTO route_plan_versions (id, route_plan_id, version_no, snapshot_json, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [uuidv4(), id, Number(current.version_no || 1), JSON.stringify(current), user.id, now]
      );
      await conn.execute(
        `UPDATE route_plans SET company_id=?, shift_id=?, name=?, direction=?, status='draft', version_no=?, metrics_json=?, updated_at=? WHERE id=?`,
        [body.company_id || current.company_id || null, body.shift_id || current.shift_id || null, String(body.name || current.name).trim(), body.direction || current.direction || "morning", nextVersion, body.metrics ? JSON.stringify(body.metrics) : current.metrics_json || null, now, id]
      );
      await conn.execute(
        `DELETE rpa FROM route_plan_assignments rpa
         JOIN route_plan_stops rps ON rps.id = rpa.route_plan_stop_id
         JOIN route_plan_routes rpr ON rpr.id = rps.route_plan_route_id
         WHERE rpr.route_plan_id = ?`,
        [id]
      );
      await conn.execute(
        `DELETE rps FROM route_plan_stops rps
         JOIN route_plan_routes rpr ON rpr.id = rps.route_plan_route_id
         WHERE rpr.route_plan_id = ?`,
        [id]
      );
      await conn.execute("DELETE FROM route_plan_routes WHERE route_plan_id = ?", [id]);

      for (const [routeIndex, route] of routes.entries()) {
        const routePlanRouteId = route.id || uuidv4();
        await conn.execute(
          `INSERT INTO route_plan_routes (id, route_plan_id, route_id, vehicle_id, driver_id, name, color, route_order, geometry_json, metrics_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [routePlanRouteId, id, route.route_id || null, route.vehicle_id || null, route.driver_id || null, String(route.name || `Plan Rotası ${routeIndex + 1}`).trim(), route.color || null, Number(route.route_order ?? routeIndex), route.geometry ? JSON.stringify(route.geometry) : null, route.metrics ? JSON.stringify(route.metrics) : null, now, now]
        );
        const stops = Array.isArray(route.stops) ? route.stops : [];
        for (const [stopIndex, stop] of stops.entries()) {
          const stopId = stop.id || uuidv4();
          await conn.execute(
            `INSERT INTO route_plan_stops (id, route_plan_route_id, name, lat, lng, stop_order, locked, assigned_passenger_count, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [stopId, routePlanRouteId, String(stop.name || `Durak ${stopIndex + 1}`).trim(), stop.lat ?? null, stop.lng ?? null, Number(stop.stop_order ?? stopIndex), stop.locked ? 1 : 0, Number(stop.assigned_passenger_count || stop.passengers?.length || 0), now, now]
          );
          for (const passenger of stop.passengers || []) {
            if (!passenger.passenger_id) continue;
            await conn.execute(
              `INSERT INTO route_plan_assignments (id, route_plan_stop_id, passenger_id, walking_distance_m, created_at)
               VALUES (?, ?, ?, ?, ?)`,
              [uuidv4(), stopId, passenger.passenger_id, passenger.walking_distance_m ?? null, now]
            );
          }
        }
      }
    });

    await logAudit({ actorUserId: user.id, action: "route_plan.update", entityType: "route_plan", entityId: id, details: { version_no: nextVersion, route_count: routes.length } });
    const updated = await loadPlan(db, id);
    return NextResponse.json({ ok: true, data: updated });
  } catch (e) {
    return apiError(e);
  }
}
