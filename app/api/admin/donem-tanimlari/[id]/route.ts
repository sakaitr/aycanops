import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "donem_tanimlari:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const existing = await db.prepare(`SELECT id FROM donem_tanimlari WHERE id = ?`).get(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });
    const now = nowIso();

    if (body.action === "durum-degistir") {
      await db.prepare(`UPDATE donem_tanimlari SET is_active = ?, updated_at = ? WHERE id = ?`)
        .run(body.is_active ? 1 : 0, now, id);
      return NextResponse.json({ ok: true });
    }

    if (!body.donem_adi?.trim()) return NextResponse.json({ ok: false, error: "Dönem adı zorunludur" }, { status: 400 });
    if (!body.baslangic_tarihi || !body.bitis_tarihi)
      return NextResponse.json({ ok: false, error: "Başlangıç/bitiş tarihi zorunludur" }, { status: 400 });
    if (body.bitis_tarihi < body.baslangic_tarihi)
      return NextResponse.json({ ok: false, error: "Bitiş tarihi başlangıçtan önce olamaz" }, { status: 400 });
    await db.prepare(`UPDATE donem_tanimlari SET donem_adi = ?, baslangic_tarihi = ?, bitis_tarihi = ?, updated_at = ? WHERE id = ?`)
      .run(body.donem_adi.trim(), body.baslangic_tarihi, body.bitis_tarihi, now, id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "donem_tanimlari:delete"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    await getDb().prepare(`DELETE FROM donem_tanimlari WHERE id = ?`).run(id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
