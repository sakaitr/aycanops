import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isAtLeast } from "@/lib/permissions";

/**
 * GET /api/stats/badges
 * Returns lightweight badge counts for the nav bar.
 * Only called for yetkili+ roles.
 */
export async function GET() {
  try {
    const user = await requireUser();
    if (!user || !isAtLeast(user.role, "yetkili")) {
      return NextResponse.json({ ok: true, data: {} });
    }

    const db = getDb();

    // Vehicles not inspected in last 30 days
    let denetimCount = 0;
    try {
      denetimCount = (await db.prepare(`
        SELECT COUNT(*) AS c FROM company_vehicles cv
        WHERE cv.is_active = 1
        AND NOT EXISTS (
          SELECT 1 FROM inspections i
          WHERE i.company_vehicle_id = cv.id
          AND i.inspection_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        )
      `).get() as any)?.c || 0;
    } catch {}

    return NextResponse.json({ ok: true, data: { denetimCount } });
  } catch {
    return NextResponse.json({ ok: true, data: {} });
  }
}
