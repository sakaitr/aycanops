import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";

// Firma bazında kâr-zarar özeti: gelir (o ay o firmanın güzergahlarında işlenen
// onaylı çetele kayıtlarının güzergah fiyatından toplamı) eksi gider (o ayki
// çetelelere bağlı hakediş tutarlarının toplamı, sadece onaylı/ödendi hakedişler).
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "reports:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const donem = searchParams.get("donem") || "";
    if (!donem) return NextResponse.json({ ok: false, error: "Dönem zorunludur (YYYY-MM-01)" }, { status: 400 });

    const db = getDb();

    const rows = await db.prepare(
      `SELECT c.id AS company_id, c.name AS company_name,
              COALESCE(rev.toplam, 0) AS gelir,
              COALESCE(cost.toplam, 0) AS gider,
              m.durum AS mutabakat_durum, m.id AS mutabakat_id
       FROM companies c
       LEFT JOIN (
         SELECT r.company_id, SUM(csp.price_amount) AS toplam
         FROM cetele ce
         JOIN routes r ON r.id = ce.route_id
         LEFT JOIN vehicles v ON v.id = ce.vehicle_id
         LEFT JOIN route_supplier_prices csp ON csp.id = (
           SELECT rsp.id FROM route_supplier_prices rsp
           WHERE rsp.route_id = ce.route_id
             AND rsp.company_id = r.company_id
             AND (
               (ce.vehicle_id IS NOT NULL AND rsp.vehicle_id = ce.vehicle_id)
               OR (v.plate IS NOT NULL AND rsp.plate = v.plate)
               OR (rsp.vehicle_id IS NULL AND rsp.plate IS NULL)
             )
             AND rsp.valid_from <= ce.tarih
             AND (rsp.valid_to IS NULL OR rsp.valid_to >= ce.tarih)
           ORDER BY rsp.valid_from DESC LIMIT 1
         )
         WHERE ce.durum = 'onaylandi' AND ce.tarih >= ? AND ce.tarih < DATE_ADD(?, INTERVAL 1 MONTH)
         GROUP BY r.company_id
       ) rev ON rev.company_id = c.id
       LEFT JOIN (
         SELECT r.company_id, SUM(hc.tutar) AS toplam
         FROM hakedis_cetele hc
         JOIN cetele ce ON ce.id = hc.cetele_id
         JOIN routes r ON r.id = ce.route_id
         JOIN hakedis h ON h.id = hc.hakedis_id
         WHERE h.durum IN ('onaylandi','odendi') AND ce.tarih >= ? AND ce.tarih < DATE_ADD(?, INTERVAL 1 MONTH)
         GROUP BY r.company_id
       ) cost ON cost.company_id = c.id
       LEFT JOIN firma_mutabakat m ON m.company_id = c.id AND m.donem = ?
       WHERE c.is_active = 1 AND (rev.toplam IS NOT NULL OR cost.toplam IS NOT NULL)
       ORDER BY c.name ASC`
    ).all(donem, donem, donem, donem, donem);

    const toplam = rows.reduce((acc: any, r: any) => {
      acc.gelir += Number(r.gelir) || 0;
      acc.gider += Number(r.gider) || 0;
      return acc;
    }, { gelir: 0, gider: 0 });

    return NextResponse.json({ ok: true, data: rows, toplam: { ...toplam, kar: toplam.gelir - toplam.gider } });
  } catch (e) { return apiError(e); }
}
