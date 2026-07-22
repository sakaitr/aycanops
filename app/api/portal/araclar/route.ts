import { NextRequest, NextResponse } from "next/server";
import { requirePortalUser } from "@/lib/portal-auth";
import { getDb } from "@/lib/db";
import { apiError } from "@/lib/api-error";

export async function GET(_req: NextRequest) {
  try {
    const portalUser = await requirePortalUser();
    if (!portalUser) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const db = getDb();
    // Firmaya ait aktif araçlar — company_vehicles + vehicles JOIN
    const data = await db
      .prepare(
        `SELECT cv.id,
                cv.plate,
                COALESCE(v.driver_name, cv.driver_name) AS driver_name,
                COALESCE(v.driver_phone, '') AS driver_phone,
                COALESCE(r.name, cv.route_name) AS route_name,
                cv.route_id,
                v.brand, v.model, v.type AS vehicle_type,
                v.capacity, v.year, v.status_code,
                v.driver_license_class, v.driver_license_expiry,
                v.driver_src_expiry, v.driver_psiko_expiry, v.driver_health_expiry,
                MAX(va.arrival_date) AS last_seen,
                COUNT(va.id) AS entry_count
         FROM company_vehicles cv
         LEFT JOIN vehicles v ON v.id = cv.vehicle_id
         LEFT JOIN routes r ON r.id = cv.route_id
         LEFT JOIN vehicle_arrivals va ON va.vehicle_id = cv.id
         WHERE cv.company_id = ? AND cv.is_active = 1
         GROUP BY cv.id
         ORDER BY last_seen DESC, cv.plate ASC`
      )
      .all<any>(portalUser.company_id);

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return apiError(e);
  }
}
