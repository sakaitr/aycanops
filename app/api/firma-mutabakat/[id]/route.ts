import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "firma_mutabakat:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();

    const mutabakat = await db.prepare(
      `SELECT m.*, c.name AS company_name
       FROM firma_mutabakat m
       JOIN companies c ON c.id = m.company_id
       WHERE m.id = ?`
    ).get<any>(id);
    if (!mutabakat) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    const donemBaslangic = mutabakat.donem;
    const ceteleRows = await db.prepare(
      `SELECT c.id, c.tarih, c.hareket_tipi, v.plate, r.name AS route_name,
              csp.price_amount AS birim_ucret
       FROM cetele c
       JOIN routes r ON r.id = c.route_id
       LEFT JOIN vehicles v ON v.id = c.vehicle_id
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
       WHERE r.company_id = ?
         AND c.durum = 'onaylandi'
         AND c.tarih >= ?
         AND c.tarih < DATE_ADD(?, INTERVAL 1 MONTH)
       ORDER BY c.tarih ASC`
    ).all(mutabakat.company_id, donemBaslangic, donemBaslangic);

    return NextResponse.json({ ok: true, data: { ...mutabakat, cetele: ceteleRows } });
  } catch (e) { return apiError(e); }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const now = nowIso();

    const existing = await db.prepare(`SELECT * FROM firma_mutabakat WHERE id = ?`).get<any>(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    if (body.action === "onayla") {
      if (!hasPermission(user, "firma_mutabakat:approve"))
        return NextResponse.json({ ok: false, error: "Onaylama yetkiniz yok" }, { status: 403 });
      if (existing.durum !== "bekliyor")
        return NextResponse.json({ ok: false, error: "Sadece bekleyen mutabakatlar onaylanabilir" }, { status: 400 });

      await db.prepare(`UPDATE firma_mutabakat SET durum = 'onaylandi', onay_tarihi = ?, updated_at = ? WHERE id = ?`)
        .run(now, now, id);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "itiraz") {
      if (!hasPermission(user, "firma_mutabakat:reject"))
        return NextResponse.json({ ok: false, error: "İtiraz kaydetme yetkiniz yok" }, { status: 403 });
      if (existing.durum !== "bekliyor")
        return NextResponse.json({ ok: false, error: "Sadece bekleyen mutabakatlara itiraz edilebilir" }, { status: 400 });

      await db.prepare(`UPDATE firma_mutabakat SET durum = 'itiraz', itiraz_aciklamasi = ?, updated_at = ? WHERE id = ?`)
        .run(body.itiraz_aciklamasi || null, now, id);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "yeniden-hesapla") {
      if (!hasPermission(user, "firma_mutabakat:update"))
        return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
      if (existing.durum !== "bekliyor" && existing.durum !== "itiraz")
        return NextResponse.json({ ok: false, error: "Sadece bekleyen/itiraz edilmiş mutabakatlar yeniden hesaplanabilir" }, { status: 400 });

      const totalRow = await db.prepare(
        `SELECT COALESCE(SUM(csp.price_amount), 0) AS toplam
         FROM cetele c
         JOIN routes r ON r.id = c.route_id
         LEFT JOIN vehicles v ON v.id = c.vehicle_id
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
         WHERE r.company_id = ?
           AND c.durum = 'onaylandi'
           AND c.tarih >= ?
           AND c.tarih < DATE_ADD(?, INTERVAL 1 MONTH)`
      ).get<{ toplam: number }>(existing.company_id, existing.donem, existing.donem);

      const tutar = Number(totalRow?.toplam ?? 0);
      await db.prepare(`UPDATE firma_mutabakat SET tutar = ?, durum = 'bekliyor', updated_at = ? WHERE id = ?`)
        .run(tutar, now, id);
      return NextResponse.json({ ok: true, data: { tutar } });
    }

    return NextResponse.json({ ok: false, error: "Geçersiz işlem" }, { status: 400 });
  } catch (e) { return apiError(e); }
}
