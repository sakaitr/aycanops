import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { syncHareket } from "@/lib/finans-hareket";
import type { z } from "zod";
import type { finansGiderSchema } from "@/lib/schemas";

type GiderInput = z.infer<typeof finansGiderSchema>;

/** finans_gider satırı zorunlu-alan kontrolü. Anlık giriş (durum='taslak')
 * kategori/tutar olmadan da kaydedilebilir, diğer akışlarda ikisi de zorunlu. */
export function validateGiderFields(d: Pick<GiderInput, "durum" | "kategori_id" | "tutar">): Record<string, string[]> | null {
  if (d.durum === "taslak") return null;
  const fieldErrors: Record<string, string[]> = {};
  if (!d.kategori_id) fieldErrors.kategori_id = ["Kategori zorunlu"];
  if (d.tutar === undefined) fieldErrors.tutar = ["Tutar zorunlu"];
  return Object.keys(fieldErrors).length > 0 ? fieldErrors : null;
}

/** Tek bir Gider kaydı oluşturur: finans_gider + kalemler + defter senkronu.
 * Hem tekil POST /api/finans/gider hem de toplu Excel import tarafından kullanılır. */
export async function createGiderRecord(userId: string, d: GiderInput): Promise<string> {
  const db = getDb();
  const id = uuidv4();
  const now = nowIso();

  const kalemToplam = d.kalemler?.reduce((sum, k) => sum + k.miktar * k.birim_fiyat, 0);
  const tutar = kalemToplam !== undefined ? kalemToplam : (d.tutar ?? 0);

  await db.prepare(
    `INSERT INTO finans_gider
       (id, tip, tarih, kategori_id, cari_id, belge_no, tutar, para_birimi_kod, kdv_tutar, aciklama,
        department_id, proje_id, masraf_merkezi_id, vehicle_id, route_id, company_id, durum,
        created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, d.tip, d.tarih, d.kategori_id || null, d.cari_id || null, d.belge_no || null, tutar,
    d.para_birimi_kod || "TRY", d.kdv_tutar ?? null, d.aciklama || null,
    d.department_id || null, d.proje_id || null, d.masraf_merkezi_id || null,
    d.vehicle_id || null, d.route_id || null, d.company_id || null,
    d.durum || "tamamlandi", userId, now, now
  );

  if (d.kalemler && d.kalemler.length > 0) {
    let sortOrder = 0;
    for (const k of d.kalemler) {
      await db.prepare(
        `INSERT INTO finans_gider_kalem (id, gider_id, aciklama, miktar, birim_fiyat, tutar, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(uuidv4(), id, k.aciklama, k.miktar, k.birim_fiyat, k.miktar * k.birim_fiyat, sortOrder++);
    }
  }

  await syncHareket("gider", id, {
    tur: "gider",
    tarih: d.tarih,
    tutar,
    kdv_tutari: d.kdv_tutar ?? undefined,
    para_birimi: d.para_birimi_kod || "TRY",
    cari_id: d.cari_id,
    kategori_id: d.kategori_id,
    department_id: d.department_id,
    proje_id: d.proje_id,
    masraf_merkezi_id: d.masraf_merkezi_id,
    vehicle_id: d.vehicle_id,
    route_id: d.route_id,
    company_id: d.company_id,
    personel_id: userId,
    durum: d.durum === "taslak" ? "taslak" : "onaylandi",
    aciklama: d.aciklama || d.belge_no,
    created_by: userId,
  });

  return id;
}

/** Aynı belge no daha önce girilmiş mi kontrol eder — sadece uyarı amaçlı,
 * kayıt engellenmez. Boş belge no'lar (çoğu fiş girişinde olduğu gibi)
 * kontrol edilmez. */
export async function checkDuplicateBelgeNo(
  belgeNo: string | null | undefined, excludeId?: string
): Promise<{ id: string; tarih: string; tutar: number; kategori_ad: string | null } | null> {
  const trimmed = belgeNo?.trim();
  if (!trimmed) return null;
  const db = getDb();
  const exclude = excludeId ? "AND g.id <> ?" : "";
  const args = exclude ? [trimmed, excludeId] : [trimmed];
  const row = await db.prepare(
    `SELECT g.id, g.tarih, g.tutar, k.ad AS kategori_ad
     FROM finans_gider g
     LEFT JOIN finans_kategori k ON k.id = g.kategori_id
     WHERE g.belge_no = ? ${exclude}
     ORDER BY g.created_at DESC LIMIT 1`
  ).get(...args) as { id: string; tarih: string; tutar: number; kategori_ad: string | null } | undefined;
  return row || null;
}

/** Kaydı oluşturan kullanıcının, giderin tarihine ait ay için kişisel bütçesi
 * varsa aşılıp aşılmadığını kontrol eder. Sadece uyarı amaçlı — kayıt
 * engellenmez (patron mail'i, İSTENİLEN TALEPLER). Bütçe tanımlı değilse null. */
export async function checkPersonalBudget(
  userId: string, tarih: string
): Promise<{ asildi: boolean; butce: number; harcanan: number } | null> {
  const db = getDb();
  const ay = tarih.slice(0, 7);
  const butceRow = await db.prepare(
    "SELECT tutar FROM finans_kisisel_butce WHERE user_id = ? AND ay = ?"
  ).get(userId, ay) as { tutar: number } | undefined;
  if (!butceRow) return null;

  const harcananRow = await db.prepare(
    `SELECT COALESCE(SUM(tutar), 0) AS toplam FROM finans_gider
     WHERE created_by = ? AND durum <> 'taslak' AND SUBSTRING(tarih, 1, 7) = ?`
  ).get(userId, ay) as { toplam: number };

  const harcanan = Number(harcananRow.toplam);
  const butce = Number(butceRow.tutar);
  return { asildi: harcanan > butce, butce, harcanan };
}
