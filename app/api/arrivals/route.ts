import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { v4 as uuidv4 } from "uuid";
import { nowIso, todayIstanbul } from "@/lib/time";
import { arrivalCreateSchema } from "@/lib/schemas";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    const url = new URL(req.url);
    const company_id = url.searchParams.get("company_id");
    const date = url.searchParams.get("date") || todayIstanbul();
    if (!company_id) return NextResponse.json({ ok: false, error: "company_id gerekli" }, { status: 400 });

    // S-3: allowed_companies enforcement
    if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(company_id)) {
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
      }
    }

    const db = getDb();
    // All vehicles for this company + their arrival status for the given date
    const data = await db.prepare(`
      SELECT
        cv.id,
        cv.plate,
        cv.notes,
        cv.driver_name,
        cv.route_id,
        cv.sort_order,
        r.name       AS route_name,
        va.id        AS arrival_id,
        va.arrived_at,
        va.latitude,
        va.longitude,
        u.full_name  AS recorded_by_name
      FROM company_vehicles cv
      LEFT JOIN routes r ON r.id = cv.route_id
      LEFT JOIN vehicle_arrivals va ON va.vehicle_id = cv.id AND va.arrival_date = ?
      LEFT JOIN users u ON u.id = va.recorded_by
      WHERE cv.company_id = ? AND cv.is_active = 1
      ORDER BY cv.sort_order ASC, cv.plate ASC
    `).all(date, company_id);

    return NextResponse.json({ ok: true, data });
  } catch {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    const raw = await req.json();
    const parsed = arrivalCreateSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const { vehicle_id, company_id, date, latitude, longitude } = parsed.data;
    if (!vehicle_id || !company_id || !date)
      return NextResponse.json({ ok: false, error: "vehicle_id, company_id ve date zorunlu" }, { status: 400 });

    const db = getDb();

    // S-4: verify vehicle belongs to company
    const vehicleCheck = await db.prepare(
      "SELECT id FROM company_vehicles WHERE id = ? AND company_id = ? AND is_active = 1"
    ).get(vehicle_id, company_id);
    if (!vehicleCheck) {
      return NextResponse.json({ ok: false, error: "Bu araç bu firmaya ait değil" }, { status: 400 });
    }

    // S-3: allowed_companies enforcement
    if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(company_id as string)) {
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
      }
    }

    const now = nowIso();
    const id = uuidv4();

    await db.prepare(`
      INSERT INTO vehicle_arrivals (id, company_id, vehicle_id, arrival_date, arrived_at, recorded_by, latitude, longitude, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, company_id, vehicle_id, date, now, user.id, latitude ?? null, longitude ?? null, now);

    return NextResponse.json({ ok: true, data: { id, arrived_at: now } });
  } catch (e: any) {
    if (e?.message?.includes("UNIQUE"))
      return NextResponse.json({ ok: false, error: "Bu araç bugün zaten kaydedildi" }, { status: 409 });
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (user.role !== "admin" && user.role !== "yonetici")
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "id gerekli" }, { status: 400 });
    const db = getDb();
    await db.prepare("DELETE FROM vehicle_arrivals WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
