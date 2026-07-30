/**
 * Finans hareket defteri (tek defter) senkronizasyonu.
 *
 * finans_hareket, tüm finansal olayların birleşik görünümü (bkz. migration
 * 087). Fatura/masraf/kasa/hakediş gibi kaynak belgeler kendi tablolarında
 * durmaya devam eder; her mutasyondan sonra bu helper defteri güncel tutar.
 *
 * Neden ayrı bir defter: cari ekstre, patron paneli ve araç/güzergah/firma
 * kârlılığı tek bir yerden sorgulanabilsin diye. Kaynak tablolarını UNION
 * ile birleştirmek her rapor sorgusunu karmaşıklaştırıyor ve yeni bir kanal
 * eklendiğinde tüm raporların elden geçirilmesini gerektiriyordu.
 */

import { getDb } from "@/lib/db";
import { nowIso } from "@/lib/time";

export type HareketKaynakTip = "fatura" | "masraf" | "kasa" | "hakedis" | "manuel";

// Kaynak belgenin durumu → defter durumu. Defterde "reddedildi" kaydı da
// tutulur (rapor dışıdır ama iz kalması gerekir).
function mapDurum(durum: string | null | undefined): string {
  switch (durum) {
    case "iptal": return "iptal";
    case "taslak": return "taslak";
    case "onay_bekliyor": return "onay_bekliyor";
    case "reddedildi": return "reddedildi";
    default: return "onaylandi";
  }
}

/** Kaynak belgeye ait defter satırının deterministik id'si. */
function hareketId(kaynakTip: HareketKaynakTip, kaynakId: string): string {
  const prefix = { fatura: "fat", masraf: "msr", kasa: "kasa", hakedis: "hkd", manuel: "man" }[kaynakTip];
  return `hrk-${prefix}-${kaynakId}`;
}

export type HareketInput = {
  tur: "gelir" | "gider";
  tarih: string;
  tutar: number;
  net_tutar?: number;
  kdv_tutari?: number;
  para_birimi?: string;
  kur?: number;
  cari_id?: string | null;
  kategori_id?: string | null;
  vehicle_id?: string | null;
  route_id?: string | null;
  company_id?: string | null;
  department_id?: string | null;
  masraf_merkezi_id?: string | null;
  proje_id?: string | null;
  personel_id?: string | null;
  odeme_durumu?: string;
  odenen_tutar?: number;
  kasa_banka_id?: string | null;
  durum?: string | null;
  aciklama?: string | null;
  created_by?: string | null;
};

/**
 * Kaynak belge için defter satırını oluşturur veya günceller (idempotent).
 * Aynı kaynak_tip + kaynak_id için tekrar çağrılması güvenlidir.
 */
export async function syncHareket(
  kaynakTip: HareketKaynakTip,
  kaynakId: string,
  input: HareketInput
): Promise<void> {
  const db = getDb();
  const id = hareketId(kaynakTip, kaynakId);
  const now = nowIso();
  const kur = input.kur ?? 1;
  const tutar = Number(input.tutar) || 0;
  const netTutar = input.net_tutar ?? tutar;
  const kdv = input.kdv_tutari ?? 0;

  await db.prepare(
    `INSERT INTO finans_hareket
       (id, tur, tarih, tutar, net_tutar, kdv_tutari, para_birimi, kur, tutar_try,
        cari_id, kategori_id, vehicle_id, route_id, company_id, department_id,
        masraf_merkezi_id, proje_id, personel_id,
        kaynak_tip, kaynak_id, odeme_durumu, odenen_tutar, kasa_banka_id,
        durum, aciklama, created_by, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       tur = VALUES(tur), tarih = VALUES(tarih), tutar = VALUES(tutar),
       net_tutar = VALUES(net_tutar), kdv_tutari = VALUES(kdv_tutari),
       para_birimi = VALUES(para_birimi), kur = VALUES(kur), tutar_try = VALUES(tutar_try),
       cari_id = VALUES(cari_id), kategori_id = VALUES(kategori_id),
       vehicle_id = VALUES(vehicle_id), route_id = VALUES(route_id),
       company_id = VALUES(company_id), department_id = VALUES(department_id),
       masraf_merkezi_id = VALUES(masraf_merkezi_id), proje_id = VALUES(proje_id),
       personel_id = VALUES(personel_id),
       odeme_durumu = VALUES(odeme_durumu), odenen_tutar = VALUES(odenen_tutar),
       kasa_banka_id = VALUES(kasa_banka_id), durum = VALUES(durum),
       aciklama = VALUES(aciklama), updated_at = VALUES(updated_at)`
  ).run(
    id, input.tur, input.tarih, tutar, netTutar, kdv,
    input.para_birimi || "TRY", kur, tutar * kur,
    input.cari_id || null, input.kategori_id || null, input.vehicle_id || null,
    input.route_id || null, input.company_id || null, input.department_id || null,
    input.masraf_merkezi_id || null, input.proje_id || null, input.personel_id || null,
    kaynakTip, kaynakId, input.odeme_durumu || "odenmedi", input.odenen_tutar ?? 0,
    input.kasa_banka_id || null, mapDurum(input.durum), input.aciklama || null,
    input.created_by || null, now, now
  );
}

/** Kaynak belge silindiğinde defter satırını da kaldırır. */
export async function deleteHareket(kaynakTip: HareketKaynakTip, kaynakId: string): Promise<void> {
  await getDb()
    .prepare("DELETE FROM finans_hareket WHERE kaynak_tip = ? AND kaynak_id = ?")
    .run(kaynakTip, kaynakId);
}

/** Sadece durum değişti (onay/iptal gibi) — tam sync'e gerek yok. */
export async function updateHareketDurum(
  kaynakTip: HareketKaynakTip,
  kaynakId: string,
  durum: string,
  onaylayanId?: string
): Promise<void> {
  await getDb()
    .prepare(
      `UPDATE finans_hareket SET durum = ?, onaylayan_id = COALESCE(?, onaylayan_id), updated_at = ?
       WHERE kaynak_tip = ? AND kaynak_id = ?`
    )
    .run(mapDurum(durum), onaylayanId || null, nowIso(), kaynakTip, kaynakId);
}

/** Ödeme kaydedildiğinde defterdeki ödeme durumunu tazeler. */
export async function updateHareketOdeme(
  kaynakTip: HareketKaynakTip,
  kaynakId: string,
  odemeDurumu: string,
  odenenTutar: number
): Promise<void> {
  await getDb()
    .prepare(
      `UPDATE finans_hareket SET odeme_durumu = ?, odenen_tutar = ?, updated_at = ?
       WHERE kaynak_tip = ? AND kaynak_id = ?`
    )
    .run(odemeDurumu, odenenTutar, nowIso(), kaynakTip, kaynakId);
}

/** Faturadan defter satırı üretir — fatura API'sinin tek çağrı noktası. */
export async function syncHareketFromFatura(fatura: {
  id: string;
  tur: string;
  tarih: string;
  genel_toplam: number | string;
  ara_toplam: number | string;
  vergi_toplam: number | string;
  para_birimi_kod?: string;
  kur?: number | string;
  cari_id: string;
  odeme_durumu?: string;
  durum?: string;
  aciklama?: string | null;
  created_by?: string | null;
}): Promise<void> {
  await syncHareket("fatura", fatura.id, {
    tur: fatura.tur === "satis" ? "gelir" : "gider",
    tarih: fatura.tarih,
    tutar: Number(fatura.genel_toplam) || 0,
    net_tutar: Number(fatura.ara_toplam) || 0,
    kdv_tutari: Number(fatura.vergi_toplam) || 0,
    para_birimi: fatura.para_birimi_kod || "TRY",
    kur: Number(fatura.kur) || 1,
    cari_id: fatura.cari_id,
    odeme_durumu: fatura.odeme_durumu || "odenmedi",
    durum: fatura.durum,
    aciklama: fatura.aciklama ?? null,
    created_by: fatura.created_by ?? null,
  });
}
