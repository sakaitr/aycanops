import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { finansFaturaSchema } from "@/lib/schemas";
import { syncHareketFromFatura, updateHareketDurum, deleteHareket } from "@/lib/finans-hareket";

// Kalem güncellemesi bu fazda desteklenmiyor — PUT sadece başlık alanlarını
// (kalemler hariç) kabul eder. Kalem düzeltmek isteyen kullanıcı faturayı
// iptal edip yeniden oluşturur (aşağıdaki "iptal" action'ı).
const finansFaturaHeaderSchema = finansFaturaSchema.omit({ kalemler: true });

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const { id } = await params;
    const raw = await req.json();
    const db = getDb();
    const existing = await db.prepare(`SELECT id, durum, cari_tip, cari_id FROM finans_fatura WHERE id = ?`).get(id) as
      { id: string; durum: string; cari_tip: string; cari_id: string } | undefined;
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    // finans_fatura'da company_id kolonu yok — cari_tip='musteri' kayıtlarında
    // cari_id bir companies.id'dir ve firma kısıtlaması buradan uygulanır.
    // cari_tip='tedarikci' kayıtları (GET'teki ilkeyle tutarlı olarak)
    // kısıtlamaya tabi değildir.
    if (existing.cari_tip === "musteri" && user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(existing.cari_id))
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
    }

    // Durum makinesi: taslak → onay_bekliyor → onaylandı/iptal. Bu fazda
    // onaylama tek adımlı işler (Faz 1'in dört-göz kuralı burada uygulanmaz —
    // fatura kendi firmasının kaydı, iç onay değil): action:"onayla" taslak
    // durumundaki faturayı doğrudan onaylandi yapar. Onaylanmış ve iptal
    // edilmiş faturalar terminal durumlardır — düzenlenemez/silinemez.
    if (raw.action === "onayla") {
      if (!hasPermission(user, "finans_fatura:approve"))
        return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
      if (existing.durum !== "taslak")
        return NextResponse.json({ ok: false, error: "Bu fatura zaten sonuçlandırılmış" }, { status: 400 });

      const now = nowIso();
      await db.prepare(
        `UPDATE finans_fatura SET durum = 'onaylandi', updated_at = ? WHERE id = ?`
      ).run(now, id);
      await updateHareketDurum("fatura", id, "onaylandi", user.id);
      return NextResponse.json({ ok: true });
    }

    if (raw.action === "iptal") {
      if (!hasPermission(user, "finans_fatura:update"))
        return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
      if (existing.durum !== "taslak")
        return NextResponse.json({ ok: false, error: "Bu fatura zaten sonuçlandırılmış" }, { status: 400 });

      const now = nowIso();
      await db.prepare(
        `UPDATE finans_fatura SET durum = 'iptal', updated_at = ? WHERE id = ?`
      ).run(now, id);
      await updateHareketDurum("fatura", id, "iptal", user.id);
      return NextResponse.json({ ok: true });
    }

    if (!hasPermission(user, "finans_fatura:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    if (existing.durum !== "taslak")
      return NextResponse.json({ ok: false, error: "Onaylanmış veya iptal edilmiş fatura düzenlenemez" }, { status: 400 });

    const parsed = finansFaturaHeaderSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const d = parsed.data;
    const now = nowIso();
    await db.prepare(
      `UPDATE finans_fatura SET
         tur = ?, fatura_no = ?, odeme_turu = ?, belge_turu_id = ?, cari_tip = ?, cari_id = ?, tarih = ?, vade_tarihi = ?,
         para_birimi_kod = ?, kur = ?, iliskili_fatura_id = ?, aciklama = ?, banka_adi = ?, banka_iban = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      d.tur, d.fatura_no || null, d.odeme_turu || null, d.belge_turu_id || null, d.cari_tip, d.cari_id, d.tarih, d.vade_tarihi || null,
      d.para_birimi_kod || "TRY", d.kur ?? 1, d.iliskili_fatura_id || null, d.aciklama || null, d.banka_adi || null, d.banka_iban || null,
      now, id
    );

    // Başlık değiştiyse (tür/tarih/cari/kur) defter satırı da tazelenmeli.
    const guncel = await db.prepare(
      `SELECT id, tur, tarih, genel_toplam, ara_toplam, vergi_toplam, para_birimi_kod, kur,
              cari_id, odeme_durumu, durum, aciklama, created_by
         FROM finans_fatura WHERE id = ?`
    ).get(id) as any;
    if (guncel) await syncHareketFromFatura(guncel);

    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_fatura:delete"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    const existing = await db.prepare(`SELECT durum, cari_tip, cari_id FROM finans_fatura WHERE id = ?`).get(id) as
      { durum: string; cari_tip: string; cari_id: string } | undefined;
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });
    if (existing.cari_tip === "musteri" && user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(existing.cari_id))
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
    }
    if (existing.durum !== "taslak")
      return NextResponse.json({ ok: false, error: "Onaylanmış veya iptal edilmiş fatura silinemez" }, { status: 400 });

    // finans_fatura_kalemi FK'si ON DELETE CASCADE tanımlı (migration 077) —
    // kalemler ayrıca silinmesine gerek yok.
    await db.prepare(`DELETE FROM finans_fatura WHERE id = ?`).run(id);
    await deleteHareket("fatura", id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
