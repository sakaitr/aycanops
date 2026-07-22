import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "transfers:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const db = getDb();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const company_id = searchParams.get("company_id");

    let where = "1=1";
    const params: any[] = [];
    if (status) { where += " AND t.status = ?"; params.push(status); }
    if (company_id) { where += " AND t.company_id = ?"; params.push(company_id); }

    const rows = await db.prepare(
      `SELECT t.id, t.status, t.title, t.company_id, t.vehicle_id, t.driver_name, t.driver_phone,
         t.pickup_location, t.dropoff_location,
         DATE_FORMAT(t.transfer_date, '%Y-%m-%d') AS transfer_date,
         t.transfer_time, t.passenger_count, t.notes, t.created_by,
         t.created_at, t.updated_at,
         c.name AS company_name,
         v.plate AS vehicle_plate,
         u.full_name AS creator_name
       FROM transfers t
       LEFT JOIN companies c ON c.id = t.company_id
       LEFT JOIN vehicles v ON v.id = t.vehicle_id
       LEFT JOIN users u ON u.id = t.created_by
       WHERE ${where}
       ORDER BY FIELD(t.status,'istek','planlandı','yapılıyor','tamamlandı'), t.transfer_date ASC, t.created_at DESC`
    ).all(...params);

    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "transfers:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    const { title, company_id, vehicle_id, driver_name, driver_phone, pickup_location, dropoff_location, transfer_date, transfer_time, passenger_count, notes } = body;

    if (!title?.trim()) return NextResponse.json({ ok: false, error: "Başlık zorunludur" }, { status: 400 });

    const db = getDb();
    const id = uuidv4();
    await db.prepare(
      `INSERT INTO transfers (id, status, title, company_id, vehicle_id, driver_name, driver_phone, pickup_location, dropoff_location, transfer_date, transfer_time, passenger_count, notes, created_by)
       VALUES (?, 'istek', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, title.trim(), company_id || null, vehicle_id || null, driver_name || null, driver_phone || null,
      pickup_location || null, dropoff_location || null, transfer_date || null, transfer_time || null,
      passenger_count ? Number(passenger_count) : null, notes || null, user.id);

    return NextResponse.json({ ok: true, id });
  } catch (e) { return apiError(e); }
}
