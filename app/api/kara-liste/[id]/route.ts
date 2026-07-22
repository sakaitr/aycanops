import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "kara_liste:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const now = nowIso();

    const existing = await db.prepare(`SELECT id, durum FROM kara_liste WHERE id = ?`).get<{ id: string; durum: string }>(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    if (body.action === "kaldir") {
      if (existing.durum !== "aktif")
        return NextResponse.json({ ok: false, error: "Sadece aktif kayıtlar kaldırılabilir" }, { status: 400 });
      await db.prepare(`UPDATE kara_liste SET durum = 'kaldirildi', kaldirma_nedeni = ?, updated_at = ? WHERE id = ?`)
        .run(body.kaldirma_nedeni || null, now, id);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "tekrar-aktif") {
      await db.prepare(`UPDATE kara_liste SET durum = 'aktif', kaldirma_nedeni = NULL, updated_at = ? WHERE id = ?`)
        .run(now, id);
      return NextResponse.json({ ok: true });
    }

    await db.prepare(
      `UPDATE kara_liste SET isim = ?, tur = ?, tc_no = ?, telefon = ?, ekleme_nedeni = ?, aciklama = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      body.isim, body.tur, body.tc_no || null, body.telefon || null,
      body.ekleme_nedeni || null, body.aciklama || null, now, id,
    );

    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
