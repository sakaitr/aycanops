import type { DbClient } from "./db";
import { RequestError } from "./request-error";
import { dateOnly } from "./financial-validation";

// Shared by service preview, hakediş and all settlement calculations.
export const CETELE_PRICE_JOIN = `LEFT JOIN route_supplier_prices csp ON csp.id = (
         SELECT rsp.id FROM route_supplier_prices rsp
         WHERE rsp.route_id = c.route_id
           AND rsp.company_id = r.company_id
           AND (
             (c.vehicle_id IS NOT NULL AND rsp.vehicle_id = c.vehicle_id)
             OR (v.plate IS NOT NULL AND rsp.plate = v.plate)
             OR (rsp.vehicle_id IS NULL AND rsp.plate IS NULL)
           )
           AND (rsp.hareket_tipi IS NULL OR rsp.hareket_tipi = c.hareket_tipi)
           AND (rsp.yon IS NULL OR rsp.yon = c.yon)
           AND rsp.valid_from <= c.tarih
           AND (rsp.valid_to IS NULL OR rsp.valid_to >= c.tarih)
         -- En spesifik eşleşme önce (tek + araç spesifikliği toplanır), eşitlikte
         -- en yeni valid_from (bkz. /api/cetele)
         ORDER BY (CASE WHEN rsp.hareket_tipi IS NOT NULL THEN 0 ELSE 1 END)
                  + (CASE WHEN rsp.yon IS NOT NULL THEN 0 ELSE 1 END)
                  + (CASE WHEN rsp.vehicle_id IS NOT NULL THEN 0 WHEN rsp.plate IS NOT NULL THEN 1 ELSE 2 END),
                  rsp.valid_from DESC, rsp.id DESC
         LIMIT 1
       )`;

export interface PricedService {
  id: string;
  tarih: string | Date;
  hareket_tipi: string;
  yon: string | null;
  plate: string | null;
  route_name: string | null;
  company_id: string | null;
  price_id: string | null;
  birim_ucret: number | string | null;
  currency: string | null;
}

export async function pricedServices(db: Pick<DbClient, "prepare">, where: string, params: unknown[]) {
  return db.prepare(`SELECT c.id, c.tarih, c.hareket_tipi, c.yon, v.plate, r.name AS route_name,
      r.company_id, csp.id AS price_id, csp.price_amount AS birim_ucret, csp.currency
    FROM cetele c LEFT JOIN routes r ON r.id = c.route_id
    LEFT JOIN vehicles v ON v.id = c.vehicle_id
    ${CETELE_PRICE_JOIN}
    WHERE ${where} ORDER BY c.tarih, c.id`).all<PricedService>(...params);
}

export function pricedTotal(rows: PricedService[], currency = "TRY") {
  const invalid = rows.filter(r => r.price_id == null || r.birim_ucret == null ||
    !Number.isFinite(Number(r.birim_ucret)) || Number(r.birim_ucret) < 0 || r.currency !== currency);
  if (invalid.length) throw new RequestError(`${invalid.length} hizmette fiyat eksik, geçersiz veya para birimi ${currency} ile uyumsuz`, 409,
    { services: invalid.map(r => ({ id: r.id, tarih: r.tarih, route_name: r.route_name, price_id: r.price_id, currency: r.currency })) });
  return rows.reduce((cents, r) => cents + Math.round(Number(r.birim_ucret) * 100), 0) / 100;
}

export function settlementServices(db: Pick<DbClient, "prepare">, companyId: string, period: string) {
  return pricedServices(db, "r.company_id = ? AND c.durum = 'onaylandi' AND c.tarih >= ? AND c.tarih < DATE_ADD(?, INTERVAL 1 MONTH)", [companyId, period, period]);
}

export function serviceSignature(rows: PricedService[]) {
  return JSON.stringify(rows.map(r => ({ id: r.id, tarih: dateOnly(typeof r.tarih === "string" && r.tarih.includes("T") ? new Date(r.tarih) : r.tarih),
    hareket_tipi: r.hareket_tipi, yon: r.yon, plate: r.plate, route_name: r.route_name,
    price_id: r.price_id, amount: Number(r.birim_ucret), currency: r.currency })).sort((a, b) => a.id.localeCompare(b.id)));
}
