import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requirePortalUser } from "@/lib/portal-auth";
import { apiError } from "@/lib/api-error";

// Salt okunur — firma denetim ekibi checklist doldururken tür seçebilsin diye.
export async function GET() {
  try {
    const portalUser = await requirePortalUser();
    if (!portalUser) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const db = getDb();
    const types = await db.prepare(
      `SELECT id, label, code FROM config_inspection_types WHERE is_active = 1 ORDER BY sort_order ASC, label ASC`
    ).all();
    return NextResponse.json({ ok: true, data: types });
  } catch (e) {
    return apiError(e);
  }
}
