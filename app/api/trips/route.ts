import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { tripCreateSchema } from "@/lib/schemas";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "100")));
    const offset = (page - 1) * limit;
    const db = getDb();

    let sql = `SELECT t.*, u.full_name as creator_name
         FROM trips t
         LEFT JOIN users u ON u.id = t.created_by
         WHERE 1=1`;
    const params: unknown[] = [];
    if (date) {
      sql += " AND t.trip_date = ?";
      params.push(date);
    }

    const countRow = await db.prepare(`SELECT COUNT(*) as total FROM (${sql}) _t`).get(...params) as { total: number };
    const total = countRow.total;

    sql += " ORDER BY t.created_at DESC LIMIT ? OFFSET ?";
    const rows = await db.prepare(sql).all(...params, limit, offset);
    return NextResponse.json({ ok: true, data: rows, meta: { total, page, limit, pages: Math.ceil(total / limit) } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    const raw = await req.json();
    const parsed = tripCreateSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const { trip_date, route_id, vehicle_id, direction, planned_departure, planned_arrival, passenger_count, notes } = parsed.data;
    const db = getDb();
    const now = nowIso();
    const id = uuidv4();
    await db.prepare(
      `INSERT INTO trips (id, trip_date, route_id, vehicle_id, direction, planned_departure, planned_arrival, passenger_count, status_code, delay_minutes, notes, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'planned', 0, ?, ?, ?, ?)`
    ).run(id, trip_date, route_id || null, vehicle_id || null, direction || "morning",
      planned_departure || null, planned_arrival || null, passenger_count || 0,
      notes || null, user.id, now, now);
    return NextResponse.json({ ok: true, data: { id } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
