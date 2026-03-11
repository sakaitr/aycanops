import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { nowIso } from "@/lib/time";
import { driverEvaluationCreateSchema } from "@/lib/schemas";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const parsed = driverEvaluationCreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
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
    } = parsed.data;

    const db = getDb();
    const existing = await db.prepare("SELECT id, created_by FROM driver_evaluations WHERE id = ?").get(id) as any;
    if (!existing) return NextResponse.json({ ok: false, error: "Kayıt bulunamadı" }, { status: 404 });

    const now = nowIso();
    await db.prepare(`
      UPDATE driver_evaluations SET
        evaluation_date = ?, driver_name = ?, plate = ?, vehicle_info = ?,
        route_text = ?, company_id = ?,
        score_punctuality = ?, score_driving = ?, score_communication = ?,
        score_cleanliness = ?, score_route_compliance = ?, score_appearance = ?,
        notes = ?, updated_at = ?
      WHERE id = ?
    `).run(
      evaluation_date.trim(), driver_name.trim(), plate.trim().toUpperCase(),
      vehicle_info?.trim() || null, route_text?.trim() || null, company_id || null,
      score_punctuality, score_driving, score_communication,
      score_cleanliness, score_route_compliance, score_appearance,
      notes?.trim() || null, now, id
    );

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const { id } = await params;
    const db = getDb();
    const existing = await db.prepare("SELECT id FROM driver_evaluations WHERE id = ?").get(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Kayıt bulunamadı" }, { status: 404 });

    await db.prepare("DELETE FROM driver_evaluations WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
