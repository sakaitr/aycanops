import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requirePortalUser } from "@/lib/portal-auth";
import { apiError } from "@/lib/api-error";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const portalUser = await requirePortalUser();
    if (!portalUser) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const { id } = await params;
    const db = getDb();
    const criteria = await db.prepare(
      "SELECT label FROM config_inspection_criteria WHERE inspection_type_id = ? AND is_active = 1 ORDER BY sort_order ASC, label ASC"
    ).all(id);
    return NextResponse.json({ ok: true, data: criteria });
  } catch (e) {
    return apiError(e);
  }
}
