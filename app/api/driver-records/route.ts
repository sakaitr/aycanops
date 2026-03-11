import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isAtLeast } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { driverRecordCreateSchema } from "@/lib/schemas";

// Puan hesaplama: temel 100, her kayıt ciddiyetine göre düşer
const SEVERITY_POINTS: Record<number, number> = { 1: 5, 2: 15, 3: 25, 4: 40 };

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const driver_name = searchParams.get("driver");
    const vehicle_id = searchParams.get("vehicle_id");
    const category = searchParams.get("category");
    const summary = searchParams.get("summary"); // "1" → grouped driver summary

    const db = getDb();

    if (summary === "1") {
      // Return per-driver aggregated stats
      const rows = await db.prepare(
        `SELECT driver_name,
                COUNT(*) as total_incidents,
                SUM(CASE WHEN severity = 1 THEN 1 ELSE 0 END) as s1,
                SUM(CASE WHEN severity = 2 THEN 1 ELSE 0 END) as s2,
                SUM(CASE WHEN severity = 3 THEN 1 ELSE 0 END) as s3,
                SUM(CASE WHEN severity = 4 THEN 1 ELSE 0 END) as s4,
                SUM(CASE WHEN severity = 1 THEN 5
                         WHEN severity = 2 THEN 15
                         WHEN severity = 3 THEN 25
                         WHEN severity = 4 THEN 40 ELSE 0 END) as total_deduction,
                MAX(incident_date) as last_incident,
                GROUP_CONCAT(DISTINCT vehicle_plate) as plates
         FROM driver_records
         GROUP BY driver_name
         ORDER BY total_deduction DESC`
      ).all() as any[];
      return NextResponse.json({ ok: true, data: rows });
    }

    let sql = `SELECT dr.*, u.full_name as reporter_name
               FROM driver_records dr
               LEFT JOIN users u ON u.id = dr.reported_by
               WHERE 1=1`;
    const args: unknown[] = [];
    if (driver_name) { sql += " AND dr.driver_name = ?"; args.push(driver_name); }
    if (vehicle_id) { sql += " AND dr.vehicle_id = ?"; args.push(vehicle_id); }
    if (category) { sql += " AND dr.category = ?"; args.push(category); }
    sql += " ORDER BY dr.incident_date DESC, dr.created_at DESC";

    const data = await db.prepare(sql).all(...args);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error(e);
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
    const parsed = driverRecordCreateSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const { driver_name, vehicle_id, vehicle_plate, incident_date, category, severity, description, action_taken } = parsed.data;

    const db = getDb();
    const now = nowIso();
    const id = uuidv4();

    await db.prepare(
      `INSERT INTO driver_records (id, driver_name, vehicle_id, vehicle_plate, incident_date, category, severity, description, action_taken, reported_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, driver_name.trim(), vehicle_id || null, vehicle_plate || null,
      incident_date, category || "diger", severity || 1,
      description.trim(), action_taken?.trim() || null,
      user.id, now, now
    );

    return NextResponse.json({ ok: true, data: { id } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
