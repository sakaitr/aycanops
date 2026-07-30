import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";

/**
 * Patron paneli özeti — tek defter üzerinden dört soruyu cevaplar:
 *   ne kazandım / ne harcadım  → toplam
 *   neye harcandı              → kategori kırılımı (üst + alt)
 *   neden / kim için harcandı  → araç, firma, departman, personel kırılımı
 *   nereden girdi              → kaynak kırılımı (fatura/masraf/kasa/hakediş)
 *
 * Tüm tutarlar tutar_try üzerinden toplanır — dövizli kayıtlar kayıt anındaki
 * kurla TRY'ye sabitlenmiş olur, geçmiş rapor kur değişiminden etkilenmez.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_hareket:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");

    // Taslak/onay bekleyen kayıtlar gerçekleşmiş sayılmaz; iptal/reddedilen
    // hiç sayılmaz. Panel yalnızca onaylanmış hareketleri toplar.
    const conds = ["h.durum = 'onaylandi'"];
    const p: unknown[] = [];
    if (dateFrom) { conds.push("h.tarih >= ?"); p.push(dateFrom); }
    if (dateTo) { conds.push("h.tarih <= ?"); p.push(dateTo); }
    const where = `WHERE ${conds.join(" AND ")}`;

    const db = getDb();

    const [toplam, kategori, arac, firma, departman, kaynak, trend, bekleyen] = await Promise.all([
      // Ne kazandım / ne harcadım
      db.prepare(
        `SELECT h.tur,
                COALESCE(SUM(h.tutar_try), 0) AS toplam,
                COALESCE(SUM(CASE WHEN h.odeme_durumu <> 'odendi' THEN h.tutar_try - h.odenen_tutar ELSE 0 END), 0) AS acik,
                COUNT(*) AS adet
           FROM finans_hareket h ${where} GROUP BY h.tur`
      ).all(...p),

      // Neye harcandı — üst kategori bazında toplanır, alt kategoriler detay
      db.prepare(
        `SELECT h.tur,
                COALESCE(ust.id, k.id)   AS ust_id,
                COALESCE(ust.ad, k.ad, 'Kategorisiz') AS ust_ad,
                k.id                     AS alt_id,
                k.ad                     AS alt_ad,
                COALESCE(SUM(h.tutar_try), 0) AS toplam,
                COUNT(*) AS adet
           FROM finans_hareket h
           LEFT JOIN finans_kategori k ON k.id = h.kategori_id
           LEFT JOIN finans_kategori ust ON ust.id = k.parent_id
           ${where}
           GROUP BY h.tur, ust_id, ust_ad, alt_id, alt_ad
           ORDER BY toplam DESC`
      ).all(...p),

      // Kim için — araç bazlı maliyet
      db.prepare(
        `SELECT h.vehicle_id, v.plate AS plaka,
                COALESCE(SUM(h.tutar_try), 0) AS toplam, COUNT(*) AS adet
           FROM finans_hareket h
           JOIN vehicles v ON v.id = h.vehicle_id
           ${where} AND h.tur = 'gider'
           GROUP BY h.vehicle_id, v.plate
           ORDER BY toplam DESC LIMIT 20`
      ).all(...p),

      // Firma bazlı gelir/gider (kârlılık için)
      db.prepare(
        `SELECT h.company_id, c.name AS firma_ad, h.tur,
                COALESCE(SUM(h.tutar_try), 0) AS toplam
           FROM finans_hareket h
           JOIN companies c ON c.id = h.company_id
           ${where}
           GROUP BY h.company_id, c.name, h.tur
           ORDER BY toplam DESC LIMIT 40`
      ).all(...p),

      db.prepare(
        `SELECT h.department_id, d.name AS departman_ad,
                COALESCE(SUM(h.tutar_try), 0) AS toplam, COUNT(*) AS adet
           FROM finans_hareket h
           JOIN departments d ON d.id = h.department_id
           ${where} AND h.tur = 'gider'
           GROUP BY h.department_id, d.name
           ORDER BY toplam DESC`
      ).all(...p),

      // Nereden girdi
      db.prepare(
        `SELECT h.kaynak_tip, h.tur,
                COALESCE(SUM(h.tutar_try), 0) AS toplam, COUNT(*) AS adet
           FROM finans_hareket h ${where}
           GROUP BY h.kaynak_tip, h.tur`
      ).all(...p),

      // Aylık trend (son 12 ay, tarih filtresinden bağımsız)
      db.prepare(
        `SELECT DATE_FORMAT(h.tarih, '%Y-%m') AS ay, h.tur,
                COALESCE(SUM(h.tutar_try), 0) AS toplam
           FROM finans_hareket h
           WHERE h.durum = 'onaylandi' AND h.tarih >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
           GROUP BY ay, h.tur
           ORDER BY ay ASC`
      ).all(),

      // Onay bekleyen (patronun aksiyon alması gereken)
      db.prepare(
        `SELECT h.tur, COALESCE(SUM(h.tutar_try), 0) AS toplam, COUNT(*) AS adet
           FROM finans_hareket h
           WHERE h.durum IN ('taslak','onay_bekliyor')
           GROUP BY h.tur`
      ).all(),
    ]);

    return NextResponse.json({
      ok: true,
      data: { toplam, kategori, arac, firma, departman, kaynak, trend, bekleyen },
    });
  } catch (e) { return apiError(e); }
}
