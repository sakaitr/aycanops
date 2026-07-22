import { NextRequest, NextResponse } from "next/server";
import { requirePortalUser } from "@/lib/portal-auth";
import { getDb } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { todayIstanbul } from "@/lib/time";

export async function GET(_req: NextRequest) {
  try {
    const portalUser = await requirePortalUser();
    if (!portalUser) {
      return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    }

    const db = getDb();
    const cid = portalUser.company_id;
    const today = todayIstanbul();

    // Araç sayısı
    const vehiclesRow = await db
      .prepare(
        "SELECT COUNT(*) as total FROM company_vehicles WHERE company_id = ? AND is_active = 1"
      )
      .get<{ total: number }>(cid);

    // Güzergah sayısı
    const routesRow = await db
      .prepare(
        "SELECT COUNT(*) as total FROM routes WHERE company_id = ? AND is_active = 1"
      )
      .get<{ total: number }>(cid);

    // Bu aya ait sefer sayıları (routes ile join üzerinden)
    const now = new Date();
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const tripsRow = await db
      .prepare(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN t.status_code = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN t.delay_minutes > 0 THEN 1 ELSE 0 END) as delayed_count
         FROM trips t
         JOIN routes r ON r.id = t.route_id
         WHERE r.company_id = ? AND t.trip_date LIKE ?`
      )
      .get<{ total: number; completed: number; delayed_count: number }>(cid, `${monthPrefix}%`);

    // Açık destek talepleri
    const ticketsRow = await db
      .prepare(
        "SELECT COUNT(*) as total FROM portal_tickets WHERE company_id = ? AND durum IN ('acik','islemde')"
      )
      .get<{ total: number }>(cid);

    // Son 10 sefer
    const recentTrips = await db
      .prepare(
        `SELECT t.id, t.trip_date, t.direction, t.status_code, t.delay_minutes,
                t.planned_departure, t.actual_departure, t.passenger_count,
                r.name as route_name, r.code as route_code
         FROM trips t
         JOIN routes r ON r.id = t.route_id
         WHERE r.company_id = ?
         ORDER BY t.trip_date DESC, t.planned_departure DESC
         LIMIT 10`
      )
      .all<any>(cid);

    const todayTripsRow = await db
      .prepare(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN t.status_code = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN t.status_code = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
                SUM(CASE WHEN t.delay_minutes > 0 OR t.status_code = 'delayed' THEN 1 ELSE 0 END) as delayed_trips_count
         FROM trips t
         JOIN routes r ON r.id = t.route_id
         WHERE r.company_id = ? AND t.trip_date = ?`
      )
      .get<{ total: number; completed: number; cancelled: number; delayed_trips_count: number }>(cid, today);

    // arrived_at UTC ISO string olarak saklanır (VARCHAR) — Istanbul saatine
    // çevirmek için +3 saat eklenir, aksi halde TIME() karşılaştırması UTC
    // saatiyle yapılıp 3 saat kayardı.
    const arrivalsRow = await db
      .prepare(
        `SELECT COUNT(*) as arrived,
                SUM(CASE WHEN TIME(DATE_ADD(STR_TO_DATE(SUBSTRING(arrived_at, 1, 19), '%Y-%m-%dT%H:%i:%s'), INTERVAL 3 HOUR)) > '09:30:00' THEN 1 ELSE 0 END) as late_arrivals
         FROM vehicle_arrivals
         WHERE company_id = ? AND arrival_date = ?`
      )
      .get<{ arrived: number; late_arrivals: number }>(cid, today);

    const expectedVehiclesRow = await db
      .prepare("SELECT COUNT(*) as total FROM company_vehicles WHERE company_id = ? AND is_active = 1")
      .get<{ total: number }>(cid);

    const expectedVehicles = expectedVehiclesRow?.total ?? 0;
    const arrivedVehicles = arrivalsRow?.arrived ?? 0;
    const missingVehicles = Math.max(0, expectedVehicles - arrivedVehicles);

    return NextResponse.json({
      ok: true,
      data: {
        stats: {
          vehicles: vehiclesRow?.total ?? 0,
          routes: routesRow?.total ?? 0,
          trips_this_month: tripsRow?.total ?? 0,
          trips_completed: tripsRow?.completed ?? 0,
          trips_delayed: tripsRow?.delayed_count ?? 0,
          open_tickets: ticketsRow?.total ?? 0,
        },
        recent_trips: recentTrips,
        today_service: {
          date: today,
          planned_trips: todayTripsRow?.total ?? 0,
          completed_trips: todayTripsRow?.completed ?? 0,
          delayed_trips: todayTripsRow?.delayed_trips_count ?? 0,
          cancelled_trips: todayTripsRow?.cancelled ?? 0,
          expected_vehicles: expectedVehicles,
          arrived_vehicles: arrivedVehicles,
          missing_vehicles: missingVehicles,
          late_arrivals: arrivalsRow?.late_arrivals ?? 0,
          status: missingVehicles > 0 || (todayTripsRow?.delayed_trips_count ?? 0) > 0 ? "attention" : "ok",
        },
        user: portalUser,
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
