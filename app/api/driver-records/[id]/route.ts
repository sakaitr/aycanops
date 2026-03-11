import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isAtLeast } from "@/lib/permissions";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!isAtLeast(user.role, "yonetici"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { id } = await params;
    const db = getDb();
    const row = await db.prepare("SELECT id FROM driver_records WHERE id = ?").get(id);
    if (!row) return NextResponse.json({ ok: false, error: "Kayıt bulunamadı" }, { status: 404 });
    await db.prepare("DELETE FROM driver_records WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
