import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { driverEvaluationCreateSchema } from "@/lib/schemas";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("company_id");

    const db = getDb();
    let query = `
      SELECT de.*,
             c.name as company_name,
             u.full_name as created_by_name
      FROM driver_evaluations de
      LEFT JOIN companies c ON c.id = de.company_id
      LEFT JOIN users u ON u.id = de.created_by
    `;
    const params: string[] = [];
    if (companyId) {
      query += " WHERE de.company_id = ?";
      params.push(companyId);
    }
    query += " ORDER BY de.evaluation_date DESC, de.created_at DESC";

    const data = await db.prepare(query).all(...params);
    return NextResponse.json({ ok: true, data });
  } catch {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const body = await req.json();
    const {
      evaluation_date,
      driver_name,
      plate,
      vehicle_info,
      route_text,
      company_id,
      score_punctuality,
      score_driving,
      score_communication,
      score_cleanliness,
      score_route_compliance,
      score_appearance,
      notes,
    } = body;

    if (!evaluation_date?.trim()) return NextResponse.json({ ok: false, error: "Tarih zorunlu" }, { status: 400 });
    if (!driver_name?.trim()) return NextResponse.json({ ok: false, error: "Şöför adı zorunlu" }, { status: 400 });
    if (!plate?.trim()) return NextResponse.json({ ok: false, error: "Plaka zorunlu" }, { status: 400 });

    const scores = [score_punctuality, score_driving, score_communication, score_cleanliness, score_route_compliance, score_appearance];
    for (const s of scores) {
      if (typeof s !== "number" || s < 1 || s > 5) {
        return NextResponse.json({ ok: false, error: "Puanlar 1-5 arasında olmalı" }, { status: 400 });
      }
    }

    const db = getDb();
    const now = nowIso();
    const id = uuidv4();

    await db.prepare(`
      INSERT INTO driver_evaluations (
        id, evaluation_date, driver_name, plate, vehicle_info, route_text, company_id,
        score_punctuality, score_driving, score_communication,
        score_cleanliness, score_route_compliance, score_appearance,
        notes, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, evaluation_date.trim(), driver_name.trim(), plate.trim().toUpperCase(),
      vehicle_info?.trim() || null, route_text?.trim() || null, company_id || null,
      score_punctuality, score_driving, score_communication,
      score_cleanliness, score_route_compliance, score_appearance,
      notes?.trim() || null, user.id, now, now
    );

    return NextResponse.json({ ok: true, data: { id } });
  } catch {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
