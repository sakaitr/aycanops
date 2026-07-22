import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { logAudit } from "@/lib/audit";

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "routes:read")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("company_id") || "";
    if (companyId && user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(companyId)) {
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
      }
    }
    const db = getDb();
    let rows;
    if (companyId) {
      rows = await db.prepare(`SELECT rp.*, c.name AS company_name, cs.shift_name FROM route_plans rp LEFT JOIN companies c ON c.id=rp.company_id LEFT JOIN company_shifts cs ON cs.id=rp.shift_id WHERE rp.company_id=? ORDER BY rp.updated_at DESC LIMIT 100`).all(companyId);
    } else if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (allowed.length === 0) return NextResponse.json({ ok: true, data: [] });
      rows = await db.prepare(`SELECT rp.*, c.name AS company_name, cs.shift_name FROM route_plans rp LEFT JOIN companies c ON c.id=rp.company_id LEFT JOIN company_shifts cs ON cs.id=rp.shift_id WHERE rp.company_id IN (${allowed.map(() => "?").join(",")}) ORDER BY rp.updated_at DESC LIMIT 100`).all(...allowed);
    } else {
      rows = await db.prepare(`SELECT rp.*, c.name AS company_name, cs.shift_name FROM route_plans rp LEFT JOIN companies c ON c.id=rp.company_id LEFT JOIN company_shifts cs ON cs.id=rp.shift_id ORDER BY rp.updated_at DESC LIMIT 100`).all();
    }
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "routes:optimize")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const body = await req.json();
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ ok: false, error: "Plan adı zorunludur" }, { status: 400 });
    const id = uuidv4();
    const now = nowIso();
    const db = getDb();
    await db.prepare(`INSERT INTO route_plans (id, company_id, shift_id, name, direction, status, metrics_json, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`)
      .run(id, body.company_id || null, body.shift_id || null, name, body.direction || "morning", body.metrics ? JSON.stringify(body.metrics) : null, user.id, now, now);
    if (body.seed_from_routes !== false) {
      const seedParams: unknown[] = [];
      const seedWhere = ["is_active = 1"];
      if (body.company_id) { seedWhere.push("company_id = ?"); seedParams.push(body.company_id); }
      const seedRoutes = await db.prepare(
        `SELECT id, name, vehicle_id, driver_name, stops_json, route_geometry
         FROM routes
         WHERE ${seedWhere.join(" AND ")}
         ORDER BY name ASC
         LIMIT 25`
      ).all<any>(...seedParams);
      for (const [routeIndex, route] of seedRoutes.entries()) {
        const planRouteId = uuidv4();
        await db.prepare(
          `INSERT INTO route_plan_routes (id, route_plan_id, route_id, vehicle_id, driver_id, name, color, route_order, geometry_json, metrics_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?)`
        ).run(planRouteId, id, route.id, route.vehicle_id || null, route.name, ["#38bdf8", "#34d399", "#f59e0b", "#a78bfa", "#fb7185", "#22c55e"][routeIndex % 6], routeIndex, route.route_geometry || null, now, now);
        const stops = parseJson<any[]>(route.stops_json, []);
        for (const [stopIndex, stop] of stops.entries()) {
          await db.prepare(
            `INSERT INTO route_plan_stops (id, route_plan_route_id, name, lat, lng, stop_order, locked, assigned_passenger_count, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`
          ).run(uuidv4(), planRouteId, String(stop.name || `Durak ${stopIndex + 1}`), stop.lat ?? null, stop.lng ?? null, Number(stop.order ?? stopIndex), now, now);
        }
      }
    }
    await logAudit({ actorUserId: user.id, action: "route_plan.create", entityType: "route_plan", entityId: id, details: { name, company_id: body.company_id || null } });
    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
