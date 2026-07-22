import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "transfers:cancel"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const { cancellation_reason } = body;

    if (!cancellation_reason?.trim())
      return NextResponse.json({ ok: false, error: "İptal sebebi zorunludur" }, { status: 400 });

    const db = getDb();
    const transfer = await db.prepare("SELECT status FROM transfers WHERE id = ?").get(id) as any;
    if (!transfer) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });
    if (transfer.status === "tamamlandı")
      return NextResponse.json({ ok: false, error: "Tamamlanmış transfer iptal edilemez" }, { status: 409 });
    if (transfer.status === "iptal")
      return NextResponse.json({ ok: false, error: "Transfer zaten iptal edilmiş" }, { status: 409 });

    await db.prepare(
      `UPDATE transfers SET
         status = 'iptal',
         cancelled_at = ?,
         cancelled_by = ?,
         cancellation_reason = ?
       WHERE id = ?`
    ).run(nowIso(), user.id, cancellation_reason.trim(), id);

    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
