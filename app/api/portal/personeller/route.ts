import { NextRequest, NextResponse } from "next/server";
import { requirePortalUser } from "@/lib/portal-auth";
import { getDb } from "@/lib/db";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  try {
    const portalUser = await requirePortalUser();
    if (!portalUser) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "";
    const type = searchParams.get("type") || "";

    const db = getDb();
    let sql = `
      SELECT id, full_name, phone, email, type, pickup_address, dropoff_address, notes, status
      FROM passengers
      WHERE company_id = ?`;
    const params: unknown[] = [portalUser.company_id];

    if (status) { sql += " AND status = ?"; params.push(status); }
    if (type)   { sql += " AND type = ?";   params.push(type); }

    sql += " ORDER BY full_name ASC";
    const data = await db.prepare(sql).all<any>(...params);

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return apiError(e);
  }
}
