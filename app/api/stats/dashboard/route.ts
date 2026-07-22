import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isAtLeast } from "@/lib/permissions";
import { todayIstanbul } from "@/lib/time";
import { apiError } from "@/lib/api-error";

/**
 * GET /api/stats/dashboard
 * Returns chart data for the main dashboard.
 */
export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const db = getDb();
    const today = todayIstanbul();

    // Last 7 days arrivals
    let arrivalTrend: { day: string; count: number }[] = [];
    try {
      const rows = await db.prepare(`
        SELECT arrival_date as day, COUNT(*) as count
        FROM vehicle_arrivals
        WHERE arrival_date >= DATE_SUB(?, INTERVAL 6 DAY)
        GROUP BY arrival_date
        ORDER BY arrival_date ASC
      `).all(today) as { day: string; count: number }[];
      // Fill gaps for all 7 days using Istanbul today
      for (let i = 6; i >= 0; i--) {
        const dt = new Date(today + "T00:00:00+03:00");
        dt.setDate(dt.getDate() - i);
        const key = dt.toISOString().slice(0, 10);
        const found = rows.find(r => r.day === key);
        arrivalTrend.push({ day: key, count: found ? Number(found.count) : 0 });
      }
    } catch {}

    // Todo status breakdown (user's todos)
    let todoStats: { status: string; count: number }[] = [];
    try {
      todoStats = await db.prepare(`
        SELECT status_code as status, COUNT(*) as count
        FROM todos
        WHERE assigned_to = ? OR created_by = ?
        GROUP BY status_code
      `).all(user.id, user.id) as { status: string; count: number }[];
    } catch {}

    // Inspection results last 30 days (yetkili+)
    let inspectionStats: { result: string; count: number }[] = [];
    if (isAtLeast(user.role, "yetkili")) {
      try {
        inspectionStats = await db.prepare(`
          SELECT result, COUNT(*) as count
          FROM inspections
          WHERE inspection_date >= DATE_SUB(?, INTERVAL 30 DAY)
          GROUP BY result
        `).all(today) as { result: string; count: number }[];
      } catch {}
    }

    // Weekly trip counts (last 7 days)
    let tripTrend: { day: string; count: number }[] = [];
    try {
      const rows = await db.prepare(`
        SELECT trip_date as day, COUNT(*) as count
        FROM trips
        WHERE trip_date >= DATE_SUB(?, INTERVAL 6 DAY)
        GROUP BY trip_date
        ORDER BY trip_date ASC
      `).all(today) as { day: string; count: number }[];
      for (let i = 6; i >= 0; i--) {
        const dt = new Date(today + "T00:00:00+03:00");
        dt.setDate(dt.getDate() - i);
        const key = dt.toISOString().slice(0, 10);
        const found = rows.find(r => r.day === key);
        tripTrend.push({ day: key, count: found ? Number(found.count) : 0 });
      }
    } catch {}

    // Active vehicles vs arrived today
    let vehicleStatus = { total: 0, arrivedToday: 0 };
    try {
      vehicleStatus.total = ((await db.prepare(`
        SELECT COUNT(*) as c
        FROM company_vehicles cv
        WHERE cv.is_active = 1
          AND (COALESCE(cv.is_temporary, 0) = 0 OR cv.added_date = ?)
      `).get(today)) as any)?.c || 0;
      vehicleStatus.arrivedToday = ((await db.prepare(`
        SELECT COUNT(DISTINCT va.vehicle_id) as c
        FROM vehicle_arrivals va
        JOIN company_vehicles cv ON cv.id = va.vehicle_id AND cv.is_active = 1
          AND (COALESCE(cv.is_temporary, 0) = 0 OR cv.added_date = ?)
        WHERE va.arrival_date = ?
      `).get(today, today)) as any)?.c || 0;
    } catch {}

    // Kontrol Edilen / Edilmeyen Firma
    let checkedCompanies = 0, uncheckedCompanies = 0;
    try {
      checkedCompanies = ((await db.prepare(
        "SELECT COUNT(DISTINCT company_id) as c FROM vehicle_arrivals WHERE arrival_date = ?"
      ).get(today)) as any)?.c || 0;
      uncheckedCompanies = ((await db.prepare(`
        SELECT COUNT(*) as c FROM companies
        WHERE is_active = 1
        AND NOT EXISTS (
          SELECT 1 FROM vehicle_arrivals va
          WHERE va.company_id = companies.id
          AND va.arrival_date = ?
        )
      `).get(today)) as any)?.c || 0;
    } catch {}

    // Açık Güzergah sayısı
    let openRoutesCount = 0;
    try {
      openRoutesCount = ((await db.prepare(
        "SELECT COUNT(*) as c FROM open_routes WHERE status = 'open'"
      ).get()) as any)?.c || 0;
    } catch {}

    // Açık Görev (kullanıcıya atanan veya oluşturduğu, done olmayan)
    let openTodosCount = 0;
    try {
      openTodosCount = ((await db.prepare(
        "SELECT COUNT(*) as c FROM todos WHERE (assigned_to = ? OR created_by = ?) AND status_code != 'done'"
      ).get(user.id, user.id)) as any)?.c || 0;
    } catch {}

    return NextResponse.json({
      ok: true,
      data: {
        arrivalTrend, todoStats, inspectionStats, tripTrend, vehicleStatus,
        checkedCompanies, uncheckedCompanies, openRoutesCount, openTodosCount,
      },
    });
  } catch (e) { return apiError(e); }
}
