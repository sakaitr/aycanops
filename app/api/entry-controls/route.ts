import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { entryControlCreateSchema } from "@/lib/schemas";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];
    const db = getDb();
    const data = await db.prepare(
      `SELECT ec.*, r.name as route_name, r.code as route_code,
              u.full_name as creator_name
       FROM entry_controls ec
       LEFT JOIN routes r ON r.id = ec.route_id
       LEFT JOIN users u ON u.id = ec.created_by
       WHERE ec.control_date = ?
       ORDER BY ec.planned_time ASC`
    ).all(date);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    const body = await req.json();
    const parsed = entryControlCreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const { control_date, route_id, trip_id, planned_time, actual_time, passenger_expected, passenger_actual, status_code, notes } = parsed.data;
    const db = getDb();
    const now = nowIso();
    const id = uuidv4();

    let delay_minutes = 0;
    if (actual_time && planned_time) {
      const [ph, pm] = planned_time.split(":").map(Number);
      const [ah, am] = actual_time.split(":").map(Number);
      let delay = (ah * 60 + am) - (ph * 60 + pm);
      if (delay < -12 * 60) delay += 24 * 60; // overnight (e.g. planned 23:00 actual 00:30)
      delay_minutes = Math.max(0, delay);
    }

    const computed_status = status_code || (actual_time
      ? (delay_minutes > 0 ? "delayed" : "on_time")
      : "pending");

    await db.prepare(
      `INSERT INTO entry_controls (id, control_date, route_id, trip_id, planned_time, actual_time, delay_minutes, passenger_expected, passenger_actual, status_code, notes, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, control_date, route_id, trip_id || null, planned_time, actual_time || null, delay_minutes,
      passenger_expected || 0, passenger_actual || 0, computed_status, notes || null, user.id, now, now);
    return NextResponse.json({ ok: true, data: { id } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
