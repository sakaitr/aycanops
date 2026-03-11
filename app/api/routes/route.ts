import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isAtLeast } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { routeCreateSchema } from "@/lib/schemas";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    const db = getDb();
    const data = await db.prepare(
      `SELECT r.*, v.plate as vehicle_plate, v.driver_name, u.full_name as creator_name
       FROM routes r
       LEFT JOIN vehicles v ON v.id = r.vehicle_id
       LEFT JOIN users u ON u.id = r.created_by
       ORDER BY r.name ASC`
    ).all();
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!isAtLeast(user.role, "yetkili"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const raw = await req.json();
    const parsed = routeCreateSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const { name, code, direction, morning_departure, morning_arrival, evening_departure, evening_arrival, stops_json, vehicle_id, notes } = parsed.data;
    const db = getDb();
    const now = nowIso();
    const id = uuidv4();
    await db.prepare(
      `INSERT INTO routes (id, name, code, direction, morning_departure, morning_arrival, evening_departure, evening_arrival, stops_json, vehicle_id, is_active, notes, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
    ).run(id, name, code || null, direction || "both", morning_departure || null, morning_arrival || null,
      evening_departure || null, evening_arrival || null, stops_json ? JSON.stringify(stops_json) : null,
      vehicle_id || null, notes || null, user.id, now, now);
    return NextResponse.json({ ok: true, data: { id } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
