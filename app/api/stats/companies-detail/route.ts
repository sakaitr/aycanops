import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isAtLeast } from "@/lib/permissions";
import { todayIstanbul } from "@/lib/time";
import { apiError } from "@/lib/api-error";

/**
 * GET /api/stats/companies-detail?type=checked|unchecked
 * Returns detailed company list for dashboard popups.
 * - checked: companies with arrivals today + who recorded + arrival count
 * - unchecked: companies with no arrivals today
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!isAtLeast(user.role, "yetkili"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type"); // "checked" | "unchecked"
    const db = getDb();
    const today = searchParams.get("date") || todayIstanbul();

    // allowed_companies filter
    const allowedIds: string[] | null =
      user.role !== "admin" && user.allowed_companies
        ? JSON.parse(user.allowed_companies)
        : null;

    const allowedClause =
      allowedIds && allowedIds.length > 0
        ? `AND c.id IN (${allowedIds.map(() => "?").join(",")})`
        : "";
    const allowedParams = allowedIds ?? [];

    if (type === "checked") {
      // Companies with at least one arrival today
      // + per-company: arrival count, vehicle list with arrival times and who recorded
      const companies = await db.prepare(`
        SELECT
          c.id,
          c.name,
          COUNT(DISTINCT va.vehicle_id) AS arrival_count,
          COUNT(DISTINCT cv.id)         AS total_vehicles
        FROM companies c
        JOIN vehicle_arrivals va ON va.company_id = c.id AND va.arrival_date = ?
        JOIN company_vehicles cv ON cv.company_id = c.id AND cv.is_active = 1
          AND (COALESCE(cv.is_temporary, 0) = 0 OR cv.added_date = ?)
        WHERE c.is_active = 1 ${allowedClause}
        GROUP BY c.id, c.name
        ORDER BY c.name ASC
      `).all(today, today, ...allowedParams) as any[];

      // For each company, get arrivals with recorder info
      const result = await Promise.all(companies.map(async (co: any) => {
        const arrivals = await db.prepare(`
          SELECT
            cv.plate,
            cv.driver_name,
            cv.route_name,
            va.arrived_at,
            va.note AS arrival_note,
            u.full_name AS recorded_by
          FROM vehicle_arrivals va
          JOIN company_vehicles cv ON cv.id = va.vehicle_id
          LEFT JOIN users u ON u.id = va.recorded_by
          WHERE va.company_id = ? AND va.arrival_date = ?
          ORDER BY va.arrived_at ASC
        `).all(co.id, today) as any[];
        return { ...co, arrivals };
      }));

      return NextResponse.json({ ok: true, data: result });
    }

    if (type === "unchecked") {
      // Companies with no arrivals today. This includes firms whose last check was
      // yesterday (1 day ago) and older, so the dashboard shows the full follow-up list.
      const rows = await db.prepare(`
        SELECT
          c.id,
          c.name,
          COUNT(DISTINCT cv.id) AS vehicle_count,
          MAX(va_last.arrival_date) AS last_arrival_date
        FROM companies c
        LEFT JOIN company_vehicles cv ON cv.company_id = c.id AND cv.is_active = 1
          AND (COALESCE(cv.is_temporary, 0) = 0 OR cv.added_date = ?)
        LEFT JOIN vehicle_arrivals va_last ON va_last.company_id = c.id
        WHERE c.is_active = 1
        AND NOT EXISTS (
          SELECT 1 FROM vehicle_arrivals va
          WHERE va.company_id = c.id
          AND va.arrival_date = ?
        )
        ${allowedClause}
        GROUP BY c.id, c.name
        ORDER BY MAX(va_last.arrival_date) IS NULL DESC, MAX(va_last.arrival_date) ASC, c.name ASC
      `).all(today, today, ...allowedParams) as any[];

      return NextResponse.json({ ok: true, data: rows });
    }

    return NextResponse.json({ ok: false, error: "type parametresi gerekli (checked|unchecked)" }, { status: 400 });
  } catch (e) { return apiError(e); }
}
