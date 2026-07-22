import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { logAudit } from "@/lib/audit";
import type { ResultSetHeader } from "mysql2/promise";
import { v4 as uuidv4 } from "uuid";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "routes:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { id } = await params;
    const db = getDb();
    const route = await db.prepare(
      `SELECT r.*, v.plate as vehicle_plate, v.driver_name
       FROM routes r
       LEFT JOIN vehicles v ON v.id = r.vehicle_id
       WHERE r.id = ?`
    ).get(id);
    if (!route) return NextResponse.json({ ok: false, error: "Güzergah bulunamadı" }, { status: 404 });
    const routeCompanyId = (route as { company_id: string | null }).company_id;
    if (routeCompanyId && user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(routeCompanyId)) {
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
      }
    }
    return NextResponse.json({ ok: true, data: route });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "routes:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const now = nowIso();
    const route = await db.prepare("SELECT id, name, company_id, capacity FROM routes WHERE id = ? LIMIT 1").get(id) as { id: string; name: string; company_id: string | null; capacity?: number | null } | undefined;
    if (!route) return NextResponse.json({ ok: false, error: "Güzergah bulunamadı" }, { status: 404 });
    if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (route.company_id && !allowed.includes(route.company_id)) {
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
      }
      if (body.company_id && !allowed.includes(body.company_id)) {
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
      }
    }
    const capacity = body.capacity === "" || body.capacity == null ? null : Number(body.capacity);
    if (body.capacity !== undefined && capacity != null && (!Number.isFinite(capacity) || capacity < 0 || capacity > 1000)) {
      return NextResponse.json({ ok: false, error: "Kapasite 0-1000 arasında olmalı" }, { status: 400 });
    }
    if (body.capacity !== undefined) body.capacity = capacity;
    const passengerIds = Array.isArray(body.passenger_ids)
      ? Array.from(new Set(body.passenger_ids.filter((item: unknown) => typeof item === "string" && item.trim()).map((item: string) => item.trim())))
      : [];
    if (passengerIds.length > 500) return NextResponse.json({ ok: false, error: "Tek seferde en fazla 500 personel atanabilir" }, { status: 400 });
    const targetCompanyId = body.company_id ?? route.company_id;
    const routeCapacity = body.capacity === undefined ? (route.capacity == null ? null : Number(route.capacity)) : capacity;
    if (routeCapacity != null && passengerIds.length > routeCapacity) {
      return NextResponse.json({ ok: false, error: `Kapasite aşıldı: ${passengerIds.length}/${routeCapacity} personel` }, { status: 400 });
    }
    const fields = ["name", "code", "direction", "capacity", "schedule_mode", "shift_name", "morning_departure", "morning_arrival", "evening_departure", "evening_arrival", "vehicle_id", "vehicle_assignment_status", "arac_modu", "company_id", "driver_name", "driver_phone", "is_active", "notes"];
    const sets = fields.filter(f => body[f] !== undefined).map(f => `${f} = ?`);
    const vals = fields.filter(f => body[f] !== undefined).map(f => body[f]);
    if (body.stops_json !== undefined) { sets.push("stops_json = ?"); vals.push(JSON.stringify(body.stops_json)); }
    if (body.route_geometry !== undefined) { sets.push("route_geometry = ?"); vals.push(body.route_geometry ? JSON.stringify(body.route_geometry) : null); }
    if (sets.length > 0) await db.prepare(`UPDATE routes SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`).run(...vals, now, id);

    if (body.vehicle_assignment_status === "fixed" && body.vehicle_id) {
      await db.prepare("UPDATE open_routes SET status='closed', vehicle_id=?, closed_at=?, updated_at=? WHERE route_id=? AND status='open'").run(body.vehicle_id, now, now, id);
    } else if ((body.vehicle_assignment_status === "temporary" || body.vehicle_assignment_status === "searching") && targetCompanyId) {
      const open = await db.prepare("SELECT id FROM open_routes WHERE route_id=? AND status='open' LIMIT 1").get(id) as { id: string } | undefined;
      if (open) {
        await db.prepare("UPDATE open_routes SET supplier_id=NULL, vehicle_id=?, vehicle_assignment_status=?, updated_at=? WHERE id=?")
          .run(body.vehicle_id ?? null, body.vehicle_assignment_status, now, open.id);
      } else {
        await db.prepare(`INSERT INTO open_routes (id, company_id, route_id, supplier_id, vehicle_id, vehicle_assignment_status, name, status, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`)
          .run(uuidv4(), targetCompanyId, id, null, body.vehicle_id ?? null, body.vehicle_assignment_status, body.name || route.name, user.id, now, now);
      }
    }

    let assignedPassengerCount = 0;
    if (passengerIds.length > 0 && targetCompanyId) {
      const result = await db.prepare(
        `UPDATE passengers SET route_id = ?, updated_at = ?
         WHERE company_id = ? AND id IN (${passengerIds.map(() => "?").join(",")})`
      ).run(id, now, targetCompanyId, ...passengerIds) as { affectedRows?: number };
      assignedPassengerCount = result.affectedRows ?? 0;
    }
    return NextResponse.json({ ok: true, data: { assigned_passenger_count: assignedPassengerCount } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "routes:delete"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    const route = await db.prepare("SELECT id, name, company_id FROM routes WHERE id = ? LIMIT 1").get(id) as { id: string; name: string; company_id: string | null } | undefined;
    if (!route) return NextResponse.json({ ok: false, error: "Güzergah bulunamadı" }, { status: 404 });
    if (route.company_id && user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(route.company_id)) {
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
      }
    }

    const now = nowIso();
    const result = await db.transaction(async (conn) => {
      const [passengers] = await conn.execute<ResultSetHeader>("UPDATE passengers SET route_id = NULL, updated_at = ? WHERE route_id = ?", [now, id]);
      const [companyVehicles] = await conn.execute<ResultSetHeader>("UPDATE company_vehicles SET route_id = NULL, route_name = NULL WHERE route_id = ?", [id]);
      const [planRoutes] = await conn.execute<ResultSetHeader>("UPDATE route_plan_routes SET route_id = NULL, updated_at = ? WHERE route_id = ?", [now, id]);
      await conn.execute("UPDATE geofences SET route_id = NULL, updated_at = ? WHERE route_id = ?", [now, id]);
      const [deleted] = await conn.execute<ResultSetHeader>("DELETE FROM routes WHERE id = ?", [id]);
      return {
        deleted: deleted?.affectedRows ?? 0,
        unassigned_passengers: passengers?.affectedRows ?? 0,
        unlinked_company_vehicles: companyVehicles?.affectedRows ?? 0,
        unlinked_plan_routes: planRoutes?.affectedRows ?? 0,
      };
    });

    await logAudit({
      actorUserId: user.id,
      action: "routes.delete",
      entityType: "routes",
      entityId: id,
      details: { route_name: route.name, company_id: route.company_id, ...result },
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
