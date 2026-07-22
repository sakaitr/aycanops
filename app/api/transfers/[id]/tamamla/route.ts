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
    if (!hasPermission(user, "transfers:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const { actual_passenger_count, completion_notes } = body;

    const db = getDb();
    const transfer = await db.prepare("SELECT status FROM transfers WHERE id = ?").get(id) as any;
    if (!transfer) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });
    if (transfer.status !== "yapılıyor")
      return NextResponse.json({ ok: false, error: "Sadece 'yapılıyor' durumundaki transferler tamamlanabilir" }, { status: 409 });

    await db.prepare(
      `UPDATE transfers SET
         status = 'tamamlandı',
         completed_at = ?,
         completed_by = ?,
         actual_passenger_count = ?,
         completion_notes = ?
       WHERE id = ?`
    ).run(
      nowIso(),
      user.id,
      actual_passenger_count ? Number(actual_passenger_count) : null,
      completion_notes || null,
      id
    );

    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
