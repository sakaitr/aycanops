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
    if (!hasPermission(user, "firma_mutabakat:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const company_id = searchParams.get("company_id") || "";
    const durum = searchParams.get("durum") || "";
    const limit = Math.min(500, parseInt(searchParams.get("limit") || "100"));

    if (company_id && user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(company_id)) {
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
      }
    }

    const db = getDb();
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (company_id) { conditions.push("m.company_id = ?"); params.push(company_id); }
    else if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (allowed.length === 0) return NextResponse.json({ ok: true, data: [] });
      conditions.push(`m.company_id IN (${allowed.map(() => "?").join(",")})`);
      params.push(...allowed);
    }
    if (durum) { conditions.push("m.durum = ?"); params.push(durum); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await db.prepare(
      `SELECT m.*, c.name AS company_name
       FROM firma_mutabakat m
       JOIN companies c ON c.id = m.company_id
       ${where}
       ORDER BY m.donem DESC
       LIMIT ?`
    ).all(...params, limit);

    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "firma_mutabakat:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    const company_id: string = body.company_id;
    const donem: string = body.donem; // ayın herhangi bir günü, örn "2026-07-01"
    if (!company_id) return NextResponse.json({ ok: false, error: "Firma seçiniz" }, { status: 400 });
    if (!donem) return NextResponse.json({ ok: false, error: "Dönem zorunludur" }, { status: 400 });

    const db = getDb();

    const existing = await db.prepare(
      `SELECT id FROM firma_mutabakat WHERE company_id = ? AND donem = ?`
    ).get<{ id: string }>(company_id, donem.slice(0, 8) + "01");
    if (existing) return NextResponse.json({ ok: false, error: "Bu firma için bu dönemde zaten mutabakat var" }, { status: 400 });

    // O firmanın güzergahlarında, o ay içinde onaylı işlenen çetele kayıtlarının
    // güzergah fiyatından hesaplanan toplamı — mutabakatın gelir tutarı.
    const donemBaslangic = donem.slice(0, 8) + "01";
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
    ).get<{ toplam: number }>(company_id, donemBaslangic, donemBaslangic);

    const id = uuidv4();
    const now = nowIso();
    const tutar = Number(totalRow?.toplam ?? 0);

    await db.prepare(
      `INSERT INTO firma_mutabakat
         (id, company_id, donem, tutar, para_birimi, durum, gonderilis_tarihi, aciklama, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id, company_id, donemBaslangic, tutar, "TRY",
      "bekliyor", now, body.aciklama || null,
      user.id, now, now,
    );

    return NextResponse.json({ ok: true, data: { id, tutar } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
