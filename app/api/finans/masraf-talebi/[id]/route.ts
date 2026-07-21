import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { v4 as uuidv4 } from "uuid";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const { id } = await params;
    const raw = await req.json();
    const db = getDb();
    const existing = await db.prepare(
      `SELECT * FROM finans_masraf_talebi WHERE id = ?`
    ).get(id) as any;
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });
    if (existing.durum !== "bekliyor")
      return NextResponse.json({ ok: false, error: "Bu talep zaten sonuçlandırılmış" }, { status: 400 });

    if (existing.talep_eden_user_id === user.id)
      return NextResponse.json({ ok: false, error: "Kendi talebinizi onaylayamazsınız" }, { status: 403 });

    const now = nowIso();

    if (raw.action === "reddet") {
      if (!hasPermission(user, "finans_masraf_talebi:reject"))
        return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
      if (!raw.red_nedeni?.trim())
        return NextResponse.json({ ok: false, error: "Red nedeni zorunludur" }, { status: 400 });
      await db.prepare(
        `UPDATE finans_masraf_talebi SET durum = 'reddedildi', onaylayan_user_id = ?, onay_tarihi = ?, red_nedeni = ?, updated_at = ? WHERE id = ?`
      ).run(user.id, now, raw.red_nedeni.trim(), now, id);
      await db.prepare(
        `INSERT INTO notifications (id, user_id, title, body, link, is_read, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`
      ).run(uuidv4(), existing.talep_eden_user_id, `Masraf talebiniz reddedildi: ${existing.baslik}`,
        raw.red_nedeni.trim(), "/finans/masraf-talebi", user.id, now, now);
      return NextResponse.json({ ok: true });
    }

    if (raw.action === "onayla") {
      if (!hasPermission(user, "finans_masraf_talebi:approve"))
        return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
      const ggId = uuidv4();
      await db.prepare(
        `INSERT INTO finans_gelir_gider
           (id, tur, belge_tarihi, kayit_tarihi, kategori_id, net_tutar, vergi_tutari, brut_tutar,
            para_birimi_kod, department_id, proje_id, masraf_merkezi_id, odeme_durumu, durum,
            aciklama, created_by, created_at, updated_at)
         VALUES (?, 'gider', ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'odenmedi', 'taslak', ?, ?, ?, ?)`
      ).run(
        ggId, existing.tarih, now, existing.kategori_id, existing.tahmini_tutar, existing.tahmini_tutar,
        existing.para_birimi_kod, existing.department_id, existing.proje_id, existing.masraf_merkezi_id,
        `Masraf talebinden oluşturuldu: ${existing.baslik}`, existing.talep_eden_user_id, now, now
      );
      await db.prepare(
        `UPDATE finans_masraf_talebi SET durum = 'onaylandi', onaylayan_user_id = ?, onay_tarihi = ?, iliskili_gelir_gider_id = ?, updated_at = ? WHERE id = ?`
      ).run(user.id, now, ggId, now, id);
      await db.prepare(
        `INSERT INTO notifications (id, user_id, title, body, link, is_read, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`
      ).run(uuidv4(), existing.talep_eden_user_id, `Masraf talebiniz onaylandı: ${existing.baslik}`,
        `Talebiniz onaylandı, gider kaydı oluşturuldu.`, "/finans/gelir-gider", user.id, now, now);
      return NextResponse.json({ ok: true, data: { gelir_gider_id: ggId } });
    }

    return NextResponse.json({ ok: false, error: "Geçersiz işlem" }, { status: 400 });
  } catch (e) { return apiError(e); }
}
