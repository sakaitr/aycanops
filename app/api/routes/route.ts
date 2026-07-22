import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { routeCreateSchema } from "@/lib/schemas";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "routes:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const url = new URL(req.url);
    const company_id = url.searchParams.get("company_id");
    if (company_id && user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(company_id)) {
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
      }
    }
    const db = getDb();
    let companyClause = "";
    let params: string[] = [];
    if (company_id) {
      companyClause = "WHERE r.company_id = ?";
      params = [company_id];
    } else if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (allowed.length === 0) return NextResponse.json({ ok: true, data: [] });
      companyClause = `WHERE r.company_id IN (${allowed.map(() => "?").join(",")})`;
      params = allowed;
    }
    const data = await db.prepare(
      `SELECT r.*, v.plate as vehicle_plate, v.driver_name as vehicle_driver_name, c.name as company_name,
              ap.price_amount as active_price_amount, ap.currency as active_price_currency,
              u.full_name as creator_name
       FROM routes r
       LEFT JOIN vehicles v ON v.id = r.vehicle_id
       LEFT JOIN companies c ON c.id = r.company_id
       LEFT JOIN route_supplier_prices ap ON ap.id = (
         SELECT rsp.id FROM route_supplier_prices rsp
         WHERE rsp.route_id = r.id
           AND rsp.company_id = r.company_id
           AND (
             (r.vehicle_id IS NOT NULL AND rsp.vehicle_id = r.vehicle_id)
             OR (v.plate IS NOT NULL AND rsp.plate = v.plate)
             OR (rsp.vehicle_id IS NULL AND rsp.plate IS NULL)
           )
           AND rsp.valid_from <= CURDATE()
           AND (rsp.valid_to IS NULL OR rsp.valid_to >= CURDATE())
         ORDER BY rsp.valid_from DESC LIMIT 1
       )
       LEFT JOIN users u ON u.id = r.created_by
       ${companyClause}
       ORDER BY r.name ASC`
    ).all(...params) as any[];

    // Vardiya (saat dilimi) listesini tek sorguda topluca çekip güzergahlara ekliyoruz
    if (data.length > 0) {
      const routeIds = data.map(r => r.id);
      const slots = await db.prepare(
        `SELECT id, route_id, ad, giris_saati, cikis_saati
         FROM route_time_slots
         WHERE is_active = 1 AND route_id IN (${routeIds.map(() => "?").join(",")})
         ORDER BY sort_order ASC, giris_saati ASC`
      ).all(...routeIds) as any[];
      const slotsByRoute: Record<string, any[]> = {};
      for (const s of slots) {
        if (!slotsByRoute[s.route_id]) slotsByRoute[s.route_id] = [];
        slotsByRoute[s.route_id].push(s);
      }
      for (const r of data) r.time_slots = slotsByRoute[r.id] || [];

      // Ayrı araç modundaki güzergahlar için güncel (bitis_tarihi NULL) giriş/çıkış
      // atamalarını topluca çekip ekliyoruz — grid'de yön bazlı araç çözümlemesi için.
      const activeAssignments = await db.prepare(
        `SELECT ga.route_id, ga.hareket_tipi, ga.yon, ga.vehicle_id, v.plate
         FROM guzergah_atama_gecmisi ga
         JOIN vehicles v ON v.id = ga.vehicle_id
         WHERE ga.bitis_tarihi IS NULL AND ga.yon IS NOT NULL
           AND ga.route_id IN (${routeIds.map(() => "?").join(",")})`
      ).all(...routeIds) as any[];
      const assignmentsByRoute: Record<string, any[]> = {};
      for (const a of activeAssignments) {
        if (!assignmentsByRoute[a.route_id]) assignmentsByRoute[a.route_id] = [];
        assignmentsByRoute[a.route_id].push(a);
      }
      for (const r of data) r.atama_aktif = assignmentsByRoute[r.id] || [];
    }

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "routes:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const raw = await req.json();
    const parsed = routeCreateSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const { name, code, direction, capacity, schedule_mode, shift_name, morning_departure, morning_arrival, evening_departure, evening_arrival, stops_json, vehicle_id, vehicle_assignment_status, company_id, driver_name, driver_phone, notes } = parsed.data;
    const db = getDb();
    const now = nowIso();
    const id = uuidv4();
    await db.prepare(
      `INSERT INTO routes (id, name, code, direction, capacity, schedule_mode, shift_name, morning_departure, morning_arrival, evening_departure, evening_arrival, stops_json, vehicle_id, vehicle_assignment_status, company_id, supplier_id, driver_name, driver_phone, is_active, notes, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
    ).run(id, name, code || null, direction || "both", capacity ?? null, schedule_mode || "fixed", shift_name || null, morning_departure || null, morning_arrival || null,
      evening_departure || null, evening_arrival || null, stops_json ? JSON.stringify(stops_json) : null,
      vehicle_id || null, vehicle_assignment_status || (vehicle_id ? "fixed" : "searching"), company_id || null, null, driver_name || null, driver_phone || null, notes || null, user.id, now, now);
    return NextResponse.json({ ok: true, data: { id } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
