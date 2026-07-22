import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; changeId: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "passengers:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id, changeId } = await params;
    const db = getDb();
    await db.prepare(`DELETE FROM servis_degisiklikleri WHERE id = ? AND passenger_id = ?`).run(changeId, id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
