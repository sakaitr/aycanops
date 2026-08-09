import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { finansGiderSchema } from "@/lib/schemas";
import { syncHareket } from "@/lib/finans-hareket";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_gider:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const kategori_id = searchParams.get("kategori_id");
    const durum = searchParams.get("durum");
    const tip = searchParams.get("tip");
    const date_from = searchParams.get("date_from");
    const date_to = searchParams.get("date_to");

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (kategori_id) { conditions.push("g.kategori_id = ?"); params.push(kategori_id); }
    if (durum) { conditions.push("g.durum = ?"); params.push(durum); }
    if (tip) { conditions.push("g.tip = ?"); params.push(tip); }
    if (date_from) { conditions.push("g.tarih >= ?"); params.push(date_from); }
    if (date_to) { conditions.push("g.tarih <= ?"); params.push(date_to); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const db = getDb();
    const rows = await db.prepare(
      `SELECT g.*, k.ad AS kategori_ad, c.unvan AS cari_ad, u.full_name AS created_by_ad,
              (SELECT COUNT(*) FROM finans_gider_kalem gk WHERE gk.gider_id = g.id) AS kalem_sayisi,
              (SELECT COUNT(*) FROM finans_belge b WHERE b.iliskili_tip = 'gider' AND b.iliskili_id = g.id) AS belge_sayisi
       FROM finans_gider g
       LEFT JOIN finans_kategori k ON k.id = g.kategori_id
       LEFT JOIN cari_tedarikci c ON c.id = g.cari_id
       LEFT JOIN users u ON u.id = g.created_by
       ${where}
       ORDER BY g.tarih DESC, g.created_at DESC
       LIMIT 500`
    ).all(...params);

    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_gider:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const raw = await req.json();
    const parsed = finansGiderSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const d = parsed.data;

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();

    // Kalemler varsa toplam onlardan hesaplanır (kullanıcı elle tutar
    // girmişse bile kalemler kaynak kabul edilir — tutarsızlık olmasın).
    const kalemToplam = d.kalemler?.reduce((sum, k) => sum + k.miktar * k.birim_fiyat, 0);
    const tutar = kalemToplam !== undefined ? kalemToplam : d.tutar;

    await db.prepare(
      `INSERT INTO finans_gider
         (id, tip, tarih, kategori_id, cari_id, belge_no, tutar, para_birimi_kod, kdv_tutar, aciklama,
          department_id, proje_id, masraf_merkezi_id, vehicle_id, route_id, company_id, durum,
          created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, d.tip, d.tarih, d.kategori_id, d.cari_id || null, d.belge_no || null, tutar,
      d.para_birimi_kod || "TRY", d.kdv_tutar ?? null, d.aciklama || null,
      d.department_id || null, d.proje_id || null, d.masraf_merkezi_id || null,
      d.vehicle_id || null, d.route_id || null, d.company_id || null,
      d.durum || "tamamlandi", user.id, now, now
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
      personel_id: user.id,
      durum: d.durum === "taslak" ? "taslak" : "onaylandi",
      aciklama: d.aciklama || d.belge_no,
      created_by: user.id,
    });

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
