import { NextRequest, NextResponse } from "next/server";
import { requirePortalUser } from "@/lib/portal-auth";
import { getDb } from "@/lib/db";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  try {
    const portalUser = await requirePortalUser();
    if (!portalUser) {
      return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const db = getDb();
    const cid = portalUser.company_id;

    // Haftalık görünüm: ?week=YYYY-MM-DD (pazartesi tarihi)
    const weekParam = searchParams.get("week");
    if (weekParam) {
      // 7 günlük tarih aralığı oluştur
      const days: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekParam);
        d.setDate(d.getDate() + i);
        days.push(d.toISOString().slice(0, 10));
      }

      const rows = await db
        .prepare(
          `SELECT t.id, t.trip_date, t.direction, t.status_code, t.delay_minutes,
                  t.planned_departure, t.actual_departure, t.passenger_count,
                  t.vehicle_id, v.plate AS vehicle_plate,
                  r.id as route_id, r.name as route_name, r.code as route_code
           FROM trips t
           JOIN routes r ON r.id = t.route_id
           LEFT JOIN vehicles v ON v.id = t.vehicle_id
           WHERE r.company_id = ?
             AND t.trip_date >= ?
             AND t.trip_date <= ?
           ORDER BY r.name ASC, t.direction ASC, t.planned_departure ASC`
        )
        .all<any>(cid, days[0], days[6]);

      const routes = await db
        .prepare(
          `SELECT id, name, code FROM routes WHERE company_id = ? AND is_active = 1 ORDER BY name ASC`
        )
        .all<any>(cid);

      return NextResponse.json({ ok: true, view: "weekly", data: { days, rows, routes } });
    }

    // Giriş saatleri görünümü: ?arrivals=1&date=YYYY-MM-DD
    const arrivalsParam = searchParams.get("arrivals");
    if (arrivalsParam) {
      const date = searchParams.get("date") || new Date().toISOString().slice(0, 10);

      // Geldi işaretlenen araçlar
      const arrived = await db.prepare(`
        SELECT va.id, va.vehicle_id, va.arrival_date, va.arrived_at, va.shift, va.note,
               v.plate, v.brand, v.model, v.driver_name,
               r.id as route_id, r.name as route_name, r.code as route_code
        FROM vehicle_arrivals va
        JOIN vehicles v ON v.id = va.vehicle_id
        LEFT JOIN routes r ON r.vehicle_id = va.vehicle_id AND r.company_id = ? AND r.is_active = 1
        WHERE va.company_id = ? AND va.arrival_date = ?
        ORDER BY va.arrived_at ASC
      `).all<any>(cid, cid, date);

      // Henüz gelmeyen aktif güzergah araçları
      const pending = await db.prepare(`
        SELECT r.id as route_id, r.name as route_name, r.code as route_code,
               r.morning_departure,
               v.id as vehicle_id, v.plate, v.brand, v.model, v.driver_name
        FROM routes r
        JOIN vehicles v ON v.id = r.vehicle_id
        WHERE r.company_id = ? AND r.is_active = 1 AND r.vehicle_id IS NOT NULL
          AND v.id NOT IN (
            SELECT vehicle_id FROM vehicle_arrivals WHERE company_id = ? AND arrival_date = ?
          )
        ORDER BY r.name ASC
      `).all<any>(cid, cid, date);

      return NextResponse.json({ ok: true, view: "arrivals", data: { date, arrived, pending } });
    }

    // Liste görünümü (sayfalı)
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "30")));
    const offset = (page - 1) * limit;
    const dateFilter = searchParams.get("tarih") || "";
    const statusFilter = searchParams.get("durum") || "";

    let sql = `
      SELECT t.id, t.trip_date, t.direction, t.status_code, t.delay_minutes,
             t.planned_departure, t.actual_departure, t.planned_arrival, t.actual_arrival,
             t.passenger_count, t.notes,
             r.name as route_name, r.code as route_code,
             v.plate
      FROM trips t
      JOIN routes r ON r.id = t.route_id
      LEFT JOIN vehicles v ON v.id = t.vehicle_id
      WHERE r.company_id = ?`;
    const params: unknown[] = [cid];

    if (dateFilter) { sql += " AND t.trip_date = ?"; params.push(dateFilter); }
    if (statusFilter) { sql += " AND t.status_code = ?"; params.push(statusFilter); }

    const countRow = await db
      .prepare(`SELECT COUNT(*) as total FROM (${sql}) _t`)
      .get<{ total: number }>(...params);

    sql += " ORDER BY t.trip_date DESC, t.planned_departure DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const data = await db.prepare(sql).all<any>(...params);
    return NextResponse.json({
      ok: true,
      view: "list",
      data,
      meta: {
        total: countRow?.total ?? 0,
        page,
        limit,
        pages: Math.ceil((countRow?.total ?? 0) / limit),
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
