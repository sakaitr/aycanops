import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso, todayIstanbul } from "@/lib/time";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "cetele:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const tarih = searchParams.get("tarih") || todayIstanbul();
    const tarih_bitis = searchParams.get("tarih_bitis") || "";
    const vehicle_id = searchParams.get("vehicle_id") || "";
    const durum = searchParams.get("durum") || "";
    const hareket_tipi = searchParams.get("hareket_tipi") || "";
    const company_id = searchParams.get("company_id") || "";
    const limit = Math.min(500, parseInt(searchParams.get("limit") || "200"));

    if (company_id && user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(company_id)) {
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
      }
    }

    const db = getDb();
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (tarih_bitis) {
      conditions.push("c.tarih BETWEEN ? AND ?");
      params.push(tarih, tarih_bitis);
    } else {
      conditions.push("c.tarih = ?");
      params.push(tarih);
    }
    if (vehicle_id) { conditions.push("c.vehicle_id = ?"); params.push(vehicle_id); }
    if (durum) { conditions.push("c.durum = ?"); params.push(durum); }
    if (hareket_tipi) { conditions.push("c.hareket_tipi = ?"); params.push(hareket_tipi); }
    if (company_id) {
      conditions.push("EXISTS (SELECT 1 FROM company_vehicles cv WHERE cv.vehicle_id = c.vehicle_id AND cv.company_id = ?)");
      params.push(company_id);
    } else if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (allowed.length === 0) return NextResponse.json({ ok: true, data: [] });
      conditions.push(
        `EXISTS (SELECT 1 FROM company_vehicles cv WHERE cv.vehicle_id = c.vehicle_id AND cv.company_id IN (${allowed.map(() => "?").join(",")}))`
      );
      params.push(...allowed);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await db.prepare(
      `SELECT c.*,
              v.plate, v.brand, v.model,
              r.name AS route_name,
              onaylayan_u.full_name AS onaylayan_name,
              hc.hakedis_id,
              csp.price_amount AS birim_ucret,
              csp.currency AS birim_ucret_para_birimi
       FROM cetele c
       JOIN vehicles v ON v.id = c.vehicle_id
       LEFT JOIN routes r ON r.id = c.route_id
       LEFT JOIN users onaylayan_u ON onaylayan_u.id = c.onaylayan
       LEFT JOIN hakedis_cetele hc ON hc.cetele_id = c.id
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
       ${where}
       ORDER BY c.tarih DESC, v.plate ASC
       LIMIT ?`
    ).all(...params, limit);

    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "cetele:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    if (!body.vehicle_id) return NextResponse.json({ ok: false, error: "Araç seçiniz" }, { status: 400 });
    if (!body.tarih) return NextResponse.json({ ok: false, error: "Tarih zorunludur" }, { status: 400 });
    if (!body.hareket_tipi) return NextResponse.json({ ok: false, error: "Hareket tipi zorunludur" }, { status: 400 });

    const db = getDb();

    if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      const access = await db.prepare(
        `SELECT 1 FROM company_vehicles cv WHERE cv.vehicle_id = ? AND cv.company_id IN (${allowed.map(() => "?").join(",") || "NULL"})`
      ).get(body.vehicle_id, ...allowed);
      if (!access) return NextResponse.json({ ok: false, error: "Bu araca erişim yetkiniz yok" }, { status: 403 });
    }

    const id = uuidv4();
    const now = nowIso();

    await db.prepare(
      `INSERT INTO cetele
         (id, vehicle_id, route_id, tarih, hareket_tipi, durum, yolcu_sayisi,
          aciklama, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id, body.vehicle_id, body.route_id || null, body.tarih, body.hareket_tipi,
      "bekliyor", body.yolcu_sayisi || null,
      body.aciklama || null,
      user.id, now, now,
    );

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
