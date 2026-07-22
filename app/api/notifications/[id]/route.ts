import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz erişim" }, { status: 401 });

    const db = getDb();
    const notif = await db.prepare("SELECT * FROM notifications WHERE id = ?").get(id) as any;
    if (!notif) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });
    if (notif.user_id !== user.id && !hasPermission(user, "notifications:update")) {
      return NextResponse.json({ ok: false, error: "Yetkisiz erişim" }, { status: 403 });
    }

    await db.prepare(
      `UPDATE notifications SET is_read = 1, updated_at = ? WHERE id = ?`
    ).run(nowIso(), id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[X notifications PATCH]", e);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz erişim" }, { status: 401 });

    const db = getDb();
    const notif = await db.prepare("SELECT * FROM notifications WHERE id = ?").get(id) as any;
    if (!notif) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });
    if (notif.user_id !== user.id && !hasPermission(user, "notifications:delete")) {
      return NextResponse.json({ ok: false, error: "Yetkisiz erişim" }, { status: 403 });
    }

    await db.prepare("DELETE FROM notifications WHERE id = ?").run(id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[X notifications DELETE]", e);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
