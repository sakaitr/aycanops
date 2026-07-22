import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isAtLeast } from "@/lib/permissions";
import { todayIstanbul } from "@/lib/time";
import { apiError } from "@/lib/api-error";

/**
 * GET /api/stats/kpi
 * Returns multi-metric KPIs with period comparison (trend indicators).
 * Each metric includes: value, total, percent, trend (% vs last period), unit, accent.
 */
export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!isAtLeast(user.role, "yetkili"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const db = getDb();
    const today = todayIstanbul();

    // Helper: safe fetch
    async function q<T>(sql: string, ...params: any[]): Promise<T> {
      try { return await db.prepare(sql).get(...params) as T; }
      catch { return {} as T; }
    }
    async function qa<T>(sql: string, ...params: any[]): Promise<T[]> {
      try { return await db.prepare(sql).all(...params) as T[]; }
      catch { return []; }
    }

    // ── 1. Filo Mevcudiyeti (Fleet Availability) ──────────────────────
    const totalVehicles  = (await q<{c:number}>("SELECT COUNT(*) as c FROM vehicles")).c || 0;
    const activeVehicles = (await q<{c:number}>("SELECT COUNT(*) as c FROM vehicles WHERE status_code = 'active'")).c || 0;
    const fleetPercent   = totalVehicles > 0 ? Math.round((activeVehicles / totalVehicles) * 100) : 0;

    // ── 2. SLA Uyumu ───────────────────────────────────────────────────
    let slaTotal = 0, slaOnTime = 0;
    if (isAtLeast(user.role, "yonetici")) {
      const r = await q<{total:number; on_time:number}>(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN sla_due_at IS NULL OR STR_TO_DATE(SUBSTRING(updated_at,1,19),'%Y-%m-%dT%H:%i:%s') <= STR_TO_DATE(SUBSTRING(sla_due_at,1,19),'%Y-%m-%dT%H:%i:%s') THEN 1 ELSE 0 END) as on_time
        FROM tickets
        WHERE status_code IN ('solved','closed')
        AND updated_at >= DATE_SUB(?, INTERVAL 30 DAY)
      `, today);
      slaTotal  = Number(r?.total  || 0);
      slaOnTime = Number(r?.on_time || 0);
    }
    const slaPercent = slaTotal > 0 ? Math.round((slaOnTime / slaTotal) * 100) : 100;

    // ── 3. Denetim Geçme Oranı (Inspection Pass Rate - last 30 days) ────
    const inspTotal = (await q<{c:number}>("SELECT COUNT(*) as c FROM inspections WHERE inspection_date >= DATE_SUB(?,INTERVAL 30 DAY)", today)).c || 0;
    const inspPass  = (await q<{c:number}>("SELECT COUNT(*) as c FROM inspections WHERE result='pass' AND inspection_date >= DATE_SUB(?,INTERVAL 30 DAY)", today)).c || 0;
    const inspPercent = inspTotal > 0 ? Math.round((inspPass / inspTotal) * 100) : 0;

    // ── 4. Bakım Durumu ────────────────────────────────────────────────
    const maintenanceOverdue = (await q<{c:number}>(`
      SELECT COUNT(*) as c FROM vehicle_maintenance
      WHERE next_service_date IS NOT NULL
      AND next_service_date < ?
    `, today)).c || 0;
    const maintenanceSoon = (await q<{c:number}>(`
      SELECT COUNT(*) as c FROM vehicle_maintenance
      WHERE next_service_date IS NOT NULL
      AND next_service_date >= ?
      AND next_service_date <= DATE_ADD(?, INTERVAL 30 DAY)
    `, today, today)).c || 0;
    const maintenanceThisMonth = (await q<{c:number}>(`
      SELECT COUNT(*) as c FROM vehicle_maintenance
      WHERE maintenance_date >= DATE_FORMAT(?, '%Y-%m-01')
      AND maintenance_date <= ?
    `, today, today)).c || 0;

    // ── 5. Araç Giriş (Bugün vs Dün) ───────────────────────────────────
    const arrivalsToday = (await q<{c:number}>("SELECT COUNT(*) as c FROM vehicle_arrivals WHERE arrival_date = ?", today)).c || 0;
    const arrivalsYesterday = (await q<{c:number}>("SELECT COUNT(*) as c FROM vehicle_arrivals WHERE arrival_date = DATE_SUB(?,INTERVAL 1 DAY)", today)).c || 0;
    const arrivalTrend = arrivalsYesterday > 0
      ? Math.round(((arrivalsToday - arrivalsYesterday) / arrivalsYesterday) * 100)
      : (arrivalsToday > 0 ? 100 : 0);

    // ── 6. Açık Görevler (Bu hafta vs geçen hafta) ─────────────────────
    const openTodosNow  = (await q<{c:number}>("SELECT COUNT(*) as c FROM todos WHERE status_code != 'done'")).c || 0;
    const openTodosLastWeek = (await q<{c:number}>("SELECT COUNT(*) as c FROM todos WHERE status_code != 'done' AND created_at < DATE_SUB(NOW(),INTERVAL 7 DAY)")).c || 0;
    const todoTrend = openTodosLastWeek > 0
      ? Math.round(((openTodosNow - openTodosLastWeek) / openTodosLastWeek) * 100)
      : 0;

    // ── 7. Denetim Gerektiren Araçlar ──────────────────────────────────
    const denetimGerektiren = (await q<{c:number}>(`
      SELECT COUNT(*) as c FROM company_vehicles cv
      WHERE cv.is_active = 1 AND cv.is_temporary = 0
      AND NOT EXISTS (
        SELECT 1 FROM inspections i
        WHERE i.company_vehicle_id = cv.id
        AND i.inspection_date >= DATE_SUB(?, INTERVAL 30 DAY)
      )
    `, today)).c || 0;

    // ── 8. Son 30 gün araç giriş trendi (sparkline) ────────────────────
    const arrivalSparkRows = await qa<{day:string;count:number}>(`
      SELECT arrival_date as day, COUNT(*) as count
      FROM vehicle_arrivals
      WHERE arrival_date >= DATE_SUB(?, INTERVAL 29 DAY)
      GROUP BY arrival_date
      ORDER BY arrival_date ASC
    `, today);
    const arrivalSpark: number[] = [];
    for (let i = 29; i >= 0; i--) {
      const dt = new Date(today + "T00:00:00+03:00");
      dt.setDate(dt.getDate() - i);
      const key = dt.toISOString().slice(0, 10);
      const found = arrivalSparkRows.find(r => r.day === key);
      arrivalSpark.push(found ? Number(found.count) : 0);
    }

    // ── 9. Bu ayki bakım maliyeti ──────────────────────────────────────
    const maintenanceCost = (await q<{total:number}>(`
      SELECT COALESCE(SUM(cost),0) as total FROM vehicle_maintenance
      WHERE maintenance_date >= DATE_FORMAT(?, '%Y-%m-01') AND maintenance_date <= ?
    `, today, today)).total || 0;

    // ── 10. Ticket son 30 gün çözüm süresi (ort) ────────────────────────
    let avgResolutionHours = 0;
    if (isAtLeast(user.role, "yonetici")) {
      const r = await q<{avg_h:number}>(`
        SELECT AVG(TIMESTAMPDIFF(HOUR, STR_TO_DATE(SUBSTRING(created_at,1,19),'%Y-%m-%dT%H:%i:%s'), STR_TO_DATE(SUBSTRING(updated_at,1,19),'%Y-%m-%dT%H:%i:%s'))) as avg_h
        FROM tickets
        WHERE status_code IN ('solved','closed')
        AND updated_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      `);
      avgResolutionHours = Math.round(Number(r?.avg_h || 0));
    }

    return NextResponse.json({
      ok: true,
      data: {
        fleet: { active: activeVehicles, total: totalVehicles, percent: fleetPercent },
        sla:   { on_time: slaOnTime, total: slaTotal, percent: slaPercent },
        inspection: { pass: inspPass, total: inspTotal, percent: inspPercent },
        maintenance: { overdue: maintenanceOverdue, due_soon: maintenanceSoon, this_month: maintenanceThisMonth, cost: Number(maintenanceCost) },
        arrivals: { today: arrivalsToday, yesterday: arrivalsYesterday, trend: arrivalTrend, spark: arrivalSpark },
        todos:    { open: openTodosNow, trend: todoTrend },
        denetimGerektiren,
        avgResolutionHours,
        asOf: today,
      },
    });
  } catch (e) { return apiError(e); }
}
