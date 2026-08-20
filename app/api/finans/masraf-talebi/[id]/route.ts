import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { v4 as uuidv4 } from "uuid";
import { updateHareketDurum, deleteHareket } from "@/lib/finans-hareket";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_masraf_talebi:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const row = await getDb().prepare(
      `SELECT mt.*, u.full_name AS talep_eden_ad, k.ad AS kategori_ad,
              d.name AS department_ad, p.ad AS proje_ad,
              v.plate AS vehicle_plate, c.name AS company_ad
       FROM finans_masraf_talebi mt
       JOIN users u ON u.id = mt.talep_eden_user_id
       LEFT JOIN finans_kategori k ON k.id = mt.kategori_id
       LEFT JOIN departments d ON d.id = mt.department_id
       LEFT JOIN finans_proje p ON p.id = mt.proje_id
       LEFT JOIN vehicles v ON v.id = mt.vehicle_id
       LEFT JOIN companies c ON c.id = mt.company_id
       WHERE mt.id = ?`
    ).get(id);
    if (!row) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });
    return NextResponse.json({ ok: true, data: row });
  } catch (e) { return apiError(e); }
}

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
      await updateHareketDurum("masraf", id, "reddedildi", user.id);
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

      // Onaylanan masraf tek deftere zaten "onay_bekliyor" olarak yazılmıştı
      // (bkz. POST /api/finans/masraf-talebi) — burada sadece durumu
      // "onaylandi"ya çeviriyoruz, ayrıca gider kaydı OLUŞTURMUYORUZ.
      // (Eskiden finans_gelir_gider'a ayrı satır yazılıyordu; o tablo
      // kaldırıldı, tek defter dışında ikinci bir kayıt tutulmuyor.)
      await db.prepare(
        `UPDATE finans_masraf_talebi SET durum = 'onaylandi', onaylayan_user_id = ?, onay_tarihi = ?, updated_at = ? WHERE id = ?`
      ).run(user.id, now, now, id);
      await updateHareketDurum("masraf", id, "onaylandi", user.id);
      await db.prepare(
        `INSERT INTO notifications (id, user_id, title, body, link, is_read, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`
      ).run(uuidv4(), existing.talep_eden_user_id, `Masraf talebiniz onaylandı: ${existing.baslik}`,
        `Talebiniz onaylandı.`, "/finans/masraf-talebi", user.id, now, now);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Geçersiz işlem" }, { status: 400 });
  } catch (e) { return apiError(e); }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_masraf_talebi:delete"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    const existing = await db.prepare("SELECT id FROM finans_masraf_talebi WHERE id = ?").get(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    await db.prepare("DELETE FROM finans_masraf_talebi WHERE id = ?").run(id);
    await deleteHareket("masraf", id);

    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
