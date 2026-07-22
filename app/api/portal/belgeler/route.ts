import { NextRequest, NextResponse } from "next/server";
import { requirePortalUser } from "@/lib/portal-auth";
import { getDb } from "@/lib/db";
import { apiError } from "@/lib/api-error";

export async function GET(_req: NextRequest) {
  try {
    const portalUser = await requirePortalUser();
    if (!portalUser) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const db = getDb();
    // Firmaya ait güzergahlardaki araçlara ait belgeler
    const data = await db
      .prepare(
        `SELECT vd.id, vd.doc_type, vd.doc_label, vd.expiry_date, vd.file_url, vd.notes,
                vd.created_at, vd.vehicle_id,
                v.plate, v.brand, v.model
         FROM vehicle_documents vd
         JOIN vehicles v ON v.id = vd.vehicle_id
         WHERE v.id IN (
           SELECT DISTINCT r.vehicle_id
           FROM routes r
           WHERE r.company_id = ? AND r.vehicle_id IS NOT NULL
         )
         ORDER BY vd.expiry_date ASC, v.plate ASC`
      )
      .all<any>(portalUser.company_id);

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return apiError(e);
  }
}
