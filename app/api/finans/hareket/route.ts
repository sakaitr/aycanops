import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";

/**
 * Tek defter okuma. Tüm finansal hareketler (fatura/masraf/kasa/hakediş)
 * burada birleşik görünür — cari ekstre, patron paneli ve araç/güzergah/firma
 * kırılımları bu endpoint üzerinden çalışır (bkz. lib/finans-hareket.ts).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_hareket:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const conditions: string[] = [];
    const params: unknown[] = [];

    // İptal/reddedilen kayıtlar varsayılan olarak listede yok — iz olarak
    // saklanıyor ama rapor ve ekstreyi kirletmemeleri gerekiyor.
    const durum = searchParams.get("durum");
    if (durum) { conditions.push("h.durum = ?"); params.push(durum); }
    else conditions.push("h.durum NOT IN ('iptal','reddedildi')");

    const tur = searchParams.get("tur");
    if (tur === "gelir" || tur === "gider") { conditions.push("h.tur = ?"); params.push(tur); }

    const dateFrom = searchParams.get("date_from");
    if (dateFrom) { conditions.push("h.tarih >= ?"); params.push(dateFrom); }
    const dateTo = searchParams.get("date_to");
    if (dateTo) { conditions.push("h.tarih <= ?"); params.push(dateTo); }

    for (const [key, col] of [
      ["cari_id", "h.cari_id"],
      ["kategori_id", "h.kategori_id"],
      ["vehicle_id", "h.vehicle_id"],
      ["route_id", "h.route_id"],
      ["company_id", "h.company_id"],
      ["department_id", "h.department_id"],
      ["masraf_merkezi_id", "h.masraf_merkezi_id"],
      ["proje_id", "h.proje_id"],
      ["personel_id", "h.personel_id"],
      ["kaynak_tip", "h.kaynak_tip"],
      ["odeme_durumu", "h.odeme_durumu"],
    ] as const) {
      const v = searchParams.get(key);
      if (v) { conditions.push(`${col} = ?`); params.push(v); }
    }

    // Kategori filtresinde üst kategori seçilirse alt kategoriler de dahil
    // olsun ("Araç Giderleri" seçince yakıt+bakım+lastik hepsi gelsin).
    const kategoriTree = searchParams.get("kategori_agac_id");
    if (kategoriTree) {
      conditions.push("(h.kategori_id = ? OR h.kategori_id IN (SELECT id FROM finans_kategori WHERE parent_id = ?))");
      params.push(kategoriTree, kategoriTree);
    }

    const q = searchParams.get("q");
    if (q) { conditions.push("(h.aciklama LIKE ? OR ct.unvan LIKE ?)"); params.push(`%${q}%`, `%${q}%`); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.min(1000, Math.max(1, parseInt(searchParams.get("limit") || "200")));

    const rows = await getDb().prepare(
      `SELECT h.*,
              ct.unvan       AS cari_unvan,
              k.ad           AS kategori_ad,
              ust.ad         AS kategori_ust_ad,
              v.plate        AS arac_plaka,
              c.name         AS firma_ad,
              d.name         AS departman_ad,
              u.full_name    AS personel_ad,
              kb.ad          AS kasa_banka_ad
         FROM finans_hareket h
         LEFT JOIN cari_tedarikci ct ON ct.id = h.cari_id
         LEFT JOIN finans_kategori k ON k.id = h.kategori_id
         LEFT JOIN finans_kategori ust ON ust.id = k.parent_id
         LEFT JOIN vehicles v ON v.id = h.vehicle_id
         LEFT JOIN companies c ON c.id = h.company_id
         LEFT JOIN departments d ON d.id = h.department_id
         LEFT JOIN users u ON u.id = h.personel_id
         LEFT JOIN finans_kasa_banka_hesabi kb ON kb.id = h.kasa_banka_id
         ${where}
         ORDER BY h.tarih DESC, h.created_at DESC
         LIMIT ${limit}`
    ).all(...params);

    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}
