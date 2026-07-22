import { NextRequest, NextResponse } from "next/server";
import { requirePortalUser } from "@/lib/portal-auth";
import { getDb } from "@/lib/db";
import { apiError } from "@/lib/api-error";

export async function GET(_req: NextRequest) {
  try {
    const portalUser = await requirePortalUser();
    if (!portalUser) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const db = getDb();
    const data = await db
      .prepare(
        `SELECT r.id, r.name, r.code, r.direction,
                r.morning_departure, r.morning_arrival, r.evening_departure, r.evening_arrival,
          r.is_active, r.notes, r.driver_name, r.driver_phone, r.stops_json, r.route_geometry,
                v.plate as vehicle_plate, v.brand, v.model, v.capacity,
                v.driver_name as v_driver_name, v.driver_phone as v_driver_phone
         FROM routes r
         LEFT JOIN vehicles v ON v.id = r.vehicle_id
         WHERE r.company_id = ?
         ORDER BY r.is_active DESC, r.name ASC`
      )
      .all<any>(portalUser.company_id);

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return apiError(e);
  }
}
