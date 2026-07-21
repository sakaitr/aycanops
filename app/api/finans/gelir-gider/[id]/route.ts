import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { finansGelirGiderSchema } from "@/lib/schemas";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const { id } = await params;
    const raw = await req.json();
    const db = getDb();
    const existing = await db.prepare(`SELECT id, created_by, durum FROM finans_gelir_gider WHERE id = ?`).get(id) as
      { id: string; created_by: string; durum: string } | undefined;
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    if (raw.action === "onayla" || raw.action === "reddet") {
      if (!hasPermission(user, "finans_gelir_gider:approve"))
        return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
      if (existing.durum !== "taslak")
        return NextResponse.json({ ok: false, error: "Bu kayıt zaten sonuçlandırılmış" }, { status: 400 });
      if (existing.created_by === user.id)
        return NextResponse.json({ ok: false, error: "Kendi kaydınızı onaylayamazsınız" }, { status: 403 });

      const yeniDurum = raw.action === "onayla" ? "onaylandi" : "reddedildi";
      const now = nowIso();
      await db.prepare(
        `UPDATE finans_gelir_gider SET durum = ?, approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?`
      ).run(yeniDurum, user.id, now, now, id);
      return NextResponse.json({ ok: true });
    }

    if (!hasPermission(user, "finans_gelir_gider:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    if (existing.durum === "onaylandi")
      return NextResponse.json({ ok: false, error: "Onaylanmış kayıt düzenlenemez" }, { status: 400 });

    const parsed = finansGelirGiderSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const d = parsed.data;
    const now = nowIso();
    await db.prepare(
      `UPDATE finans_gelir_gider SET
         tur = ?, belge_tarihi = ?, tahakkuk_tarihi = ?, vade_tarihi = ?, cari_tip = ?, cari_id = ?,
         kategori_id = ?, net_tutar = ?, vergi_tutari = ?, brut_tutar = ?, para_birimi_kod = ?, kur = ?,
         company_id = ?, department_id = ?, proje_id = ?, masraf_merkezi_id = ?, aciklama = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      d.tur, d.belge_tarihi, d.tahakkuk_tarihi || null, d.vade_tarihi || null, d.cari_tip || null, d.cari_id || null,
      d.kategori_id || null, d.net_tutar, d.vergi_tutari ?? 0, d.brut_tutar, d.para_birimi_kod || "TRY", d.kur ?? 1,
      d.company_id || null, d.department_id || null, d.proje_id || null, d.masraf_merkezi_id || null,
      d.aciklama || null, now, id
    );
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_gelir_gider:delete"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    const existing = await db.prepare(`SELECT durum FROM finans_gelir_gider WHERE id = ?`).get(id) as { durum: string } | undefined;
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });
    if (existing.durum === "onaylandi")
      return NextResponse.json({ ok: false, error: "Onaylanmış kayıt silinemez" }, { status: 400 });

    await db.prepare(`DELETE FROM finans_gelir_gider WHERE id = ?`).run(id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
