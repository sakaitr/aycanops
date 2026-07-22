import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "hakedis:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const isleten_id = searchParams.get("isleten_id") || "";
    const durum = searchParams.get("durum") || "";
    const limit = Math.min(500, parseInt(searchParams.get("limit") || "100"));
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const offset = (page - 1) * limit;

    const db = getDb();
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (isleten_id) { conditions.push("h.isleten_id = ?"); params.push(isleten_id); }
    if (durum) { conditions.push("h.durum = ?"); params.push(durum); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countRow = await db.prepare(`SELECT COUNT(*) AS total FROM hakedis h ${where}`).get<{ total: number }>(...params);

    const rows = await db.prepare(
      `SELECT h.*, i.unvan AS isleten_unvan, i.cari_kod,
              v.plate,
              ft.form_adi AS form_tipi_adi,
              (SELECT COUNT(*) FROM hakedis_cetele hc WHERE hc.hakedis_id = h.id) AS cetele_sayisi
       FROM hakedis h
       JOIN isleten i ON i.id = h.isleten_id
       LEFT JOIN vehicles v ON v.id = h.vehicle_id
       LEFT JOIN ucretlendirme_form_tipi ft ON ft.id = h.form_tipi_id
       ${where}
       ORDER BY h.donem_baslangic DESC, h.created_at DESC
       LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    return NextResponse.json({ ok: true, data: rows, meta: { total: countRow?.total ?? 0, page, limit } });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "hakedis:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    if (!body.isleten_id) return NextResponse.json({ ok: false, error: "İşleten seçiniz" }, { status: 400 });
    if (!body.donem_baslangic || !body.donem_bitis)
      return NextResponse.json({ ok: false, error: "Dönem başlangıç/bitiş zorunludur" }, { status: 400 });

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();

    // Bağlanacak çetele kayıtlarının, güzergah fiyatından çözümlenen kazancını hesapla.
    // Bir araca çeteleden iş işlenmişse, bu tutar otomatik olarak hakedişin brütüne yansır.
    const ceteleIds: string[] = Array.isArray(body.cetele_ids) ? body.cetele_ids : [];
    const ceteleTutarlar: { cetele_id: string; tutar: number }[] = [];
    let ceteleToplam = 0;

    if (ceteleIds.length > 0) {
      const placeholders = ceteleIds.map(() => "?").join(",");
      const priceRows = await db.prepare(
        `SELECT c.id AS cetele_id,
                COALESCE(csp.price_amount, 0) AS birim_ucret
         FROM cetele c
         LEFT JOIN vehicles v ON v.id = c.vehicle_id
         LEFT JOIN routes r ON r.id = c.route_id
         LEFT JOIN route_supplier_prices csp ON csp.id = (
           SELECT rsp.id FROM route_supplier_prices rsp
           WHERE rsp.route_id = c.route_id
             AND rsp.company_id = r.company_id
             AND (
               (c.vehicle_id IS NOT NULL AND rsp.vehicle_id = c.vehicle_id)
               OR (v.plate IS NOT NULL AND rsp.plate = v.plate)
               OR (rsp.vehicle_id IS NULL AND rsp.plate IS NULL)
             )
             AND rsp.valid_from <= c.tarih
             AND (rsp.valid_to IS NULL OR rsp.valid_to >= c.tarih)
           ORDER BY rsp.valid_from DESC LIMIT 1
         )
         WHERE c.id IN (${placeholders})`
      ).all<{ cetele_id: string; birim_ucret: number }>(...ceteleIds);

      for (const row of priceRows) {
        const tutar = Number(row.birim_ucret) || 0;
        ceteleTutarlar.push({ cetele_id: row.cetele_id, tutar });
        ceteleToplam += tutar;
      }
    }

    // Çetele bağlıysa ve fiyatlandırma çözümlenebildiyse brüt, çeteleden hesaplanan
    // toplamdır (fiyatlandırma denetim izi). Aksi halde (çetele yok veya hiçbirinde
    // tanımlı güzergah fiyatı yoksa) elle girilen tutar kullanılır.
    const brut = ceteleIds.length > 0 && ceteleToplam > 0
      ? Math.round(ceteleToplam * 100) / 100
      : parseFloat(body.brut_tutar || "0");
    const kdvOrani = parseFloat(body.kdv_orani ?? "20");
    const tevkifatOrani = parseFloat(body.tevkifat_orani ?? "0");
    const kdvTutari = Math.round(brut * kdvOrani) / 100;
    const tevkifatTutari = Math.round(brut * tevkifatOrani) / 100;
    const netTutar = Math.round((brut + kdvTutari - tevkifatTutari) * 100) / 100;

    await db.prepare(
      `INSERT INTO hakedis
         (id, isleten_id, vehicle_id, donem_baslangic, donem_bitis, form_tipi_id,
          brut_tutar, kdv_orani, kdv_tutari, tevkifat_orani, tevkifat_tutari, net_tutar,
          durum, aciklama, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id, body.isleten_id, body.vehicle_id || null,
      body.donem_baslangic, body.donem_bitis, body.form_tipi_id || null,
      brut, kdvOrani, kdvTutari, tevkifatOrani, tevkifatTutari, netTutar,
      "taslak", body.aciklama || null,
      user.id, now, now,
    );

    // Onaylı çetele kayıtlarını, o an hesaplanan tutarla birlikte bu hakedişe bağla (denetim izi)
    for (const ct of ceteleTutarlar) {
      await db.prepare(
        `INSERT IGNORE INTO hakedis_cetele (id, hakedis_id, cetele_id, tutar, created_at) VALUES (?,?,?,?,?)`
      ).run(uuidv4(), id, ct.cetele_id, ct.tutar, now);
    }

    return NextResponse.json({ ok: true, data: { id, brut_tutar: brut, cetele_toplam: Math.round(ceteleToplam * 100) / 100 } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
