import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";
import { routePriceCreateSchema } from "@/lib/schemas";

function normalizePlate(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim().toLocaleUpperCase("tr-TR") || null;
}

async function hasOverlap(companyId: string, routeId: string, plate: string | null, vehicleId: string | null, validFrom: string, validTo?: string | null) {
  const rows = await getDb().prepare(
    `SELECT id FROM route_supplier_prices
     WHERE company_id=? AND route_id=?
       AND COALESCE(plate, '') = COALESCE(?, '')
       AND COALESCE(vehicle_id, '') = COALESCE(?, '')
       AND valid_from <= COALESCE(?, '9999-12-31')
       AND COALESCE(valid_to, '9999-12-31') >= ?
     LIMIT 1`
  ).all(companyId, routeId, plate, vehicleId, validTo || null, validFrom);
  return rows.length > 0;
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "route_prices:read")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { searchParams } = new URL(req.url);
    const params: unknown[] = [];
    let where = "WHERE 1=1";
    for (const key of ["company_id", "route_id", "vehicle_id"]) {
      const value = searchParams.get(key);
      if (value) { where += ` AND rsp.${key} = ?`; params.push(value); }
    }
    const plate = normalizePlate(searchParams.get("plate"));
    if (plate) { where += " AND rsp.plate = ?"; params.push(plate); }
    const active = searchParams.get("active") === "1";
    if (active) where += " AND rsp.valid_from <= CURDATE() AND (rsp.valid_to IS NULL OR rsp.valid_to >= CURDATE())";
    const rows = await getDb().prepare(
      `SELECT rsp.*, c.name AS company_name, r.name AS route_name, v.plate AS vehicle_plate, u.full_name AS creator_name
       FROM route_supplier_prices rsp
       JOIN companies c ON c.id = rsp.company_id
       JOIN routes r ON r.id = rsp.route_id
       LEFT JOIN vehicles v ON v.id = rsp.vehicle_id
       LEFT JOIN users u ON u.id = rsp.created_by
       ${where}
       ORDER BY rsp.valid_from DESC, rsp.created_at DESC`
    ).all(...params);
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "route_prices:create")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const parsed = routePriceCreateSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const data = parsed.data;
    const plate = normalizePlate(data.plate);
    const vehicleId = data.vehicle_id || null;
    if (data.valid_to && data.valid_to < data.valid_from) return NextResponse.json({ ok: false, error: "Bitiş tarihi başlangıçtan önce olamaz" }, { status: 400 });
    if (!plate && !vehicleId) {
      return NextResponse.json({ ok: false, error: "Fiyat için plaka veya araç seçimi zorunlu" }, { status: 400 });
    }
    if (await hasOverlap(data.company_id, data.route_id, plate, vehicleId, data.valid_from, data.valid_to)) {
      return NextResponse.json({ ok: false, error: "Bu güzergah ve plaka için tarih aralığında aktif fiyat kaydı var" }, { status: 409 });
    }
    const id = uuidv4();
    const now = nowIso();
    await getDb().prepare(
      `INSERT INTO route_supplier_prices (id, company_id, route_id, supplier_id, vehicle_id, plate, price_amount, currency, valid_from, valid_to, created_by, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, data.company_id, data.route_id, vehicleId, plate, data.price_amount, data.currency, data.valid_from, data.valid_to || null, user.id, now, now);
    await logAudit({ actorUserId: user.id, action: "route_price.create", entityType: "route_supplier_prices", entityId: id, details: { ...data, plate, vehicle_id: vehicleId } });
    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
