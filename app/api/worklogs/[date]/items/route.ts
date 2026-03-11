import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { nowIso } from "@/lib/time";
import { worklogItemCreateSchema } from "@/lib/schemas";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ date: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Yetkisiz erişim" },
        { status: 401 }
      );
    }

    const { date } = await params;
    if (!date) {
      return NextResponse.json(
        { ok: false, error: "Tarih gerekli" },
        { status: 400 }
      );
    }
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error("Invalid JSON in request:", parseError);
      return NextResponse.json(
        { ok: false, error: "Geçersiz JSON" },
        { status: 400 }
      );
    }
    const parsed = worklogItemCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const {
      title,
      category_id,
      duration_minutes,
      tag_ids,
      linked_todo_id,
      linked_ticket_id,
      note,
    } = parsed.data;

    const db = getDb();
    const worklogRaw = await db
      .prepare("SELECT * FROM worklogs WHERE user_id = ? AND work_date = ?")
      .get(user.id, date);

    if (!worklogRaw) {
      return NextResponse.json(
        { ok: false, error: "Günlük bulunamadı" },
        { status: 404 }
      );
    }

    const worklog = worklogRaw as { id: string; status_code: string };

    if (
      worklog.status_code !== "draft" &&
      worklog.status_code !== "returned"
    ) {
      return NextResponse.json(
        { ok: false, error: "Sadece taslak veya iade edilmiş günlüğe madde eklenebilir" },
        { status: 400 }
      );
    }

    const id = uuidv4();
    const now = nowIso();
    const tagIdsStr = Array.isArray(tag_ids) ? tag_ids.join(",") : tag_ids;

    await db.prepare(
      `INSERT INTO worklog_items (id, worklog_id, title, category_id, duration_minutes, tag_ids, linked_todo_id, linked_ticket_id, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      worklog.id,
      title,
      category_id || null,
      duration_minutes || null,
      tagIdsStr || null,
      linked_todo_id || null,
      linked_ticket_id || null,
      note || null,
      now,
      now
    );

    const created = await db
      .prepare("SELECT * FROM worklog_items WHERE id = ?")
      .get(id);
    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("Worklog item create error:", error);
    return NextResponse.json(
      { ok: false, error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}

