import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canViewWorklog } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { worklogCreateSchema } from "@/lib/schemas";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Yetkisiz erişim" },
        { status: 401 }
      );
    }

    const db = getDb();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const status = searchParams.get("status");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    let sql = `SELECT worklogs.*, users.full_name as user_name
               FROM worklogs
               JOIN users ON users.id = worklogs.user_id
               WHERE 1=1`;
    const params: unknown[] = [];

    if (user.role === "personel" || user.role === "yetkili") {
      // personel and yetkili only see their own worklogs (S-5)
      sql += " AND worklogs.user_id = ?";
      params.push(user.id);
    } else if (userId) {
      // yonetici/admin can filter by userId
      sql += " AND worklogs.user_id = ?";
      params.push(userId);
    }

    if (status) {
      sql += " AND worklogs.status_code = ?";
      params.push(status);
    }

    if (startDate) {
      sql += " AND worklogs.work_date >= ?";
      params.push(startDate);
    }

    if (endDate) {
      sql += " AND worklogs.work_date <= ?";
      params.push(endDate);
    }

    sql += " ORDER BY worklogs.work_date DESC, worklogs.created_at DESC";

    const rows = await db.prepare(sql).all(...params);
    return NextResponse.json({ ok: true, data: rows });
  } catch (error) {
    console.error("Worklogs list error:", error);
    return NextResponse.json(
      { ok: false, error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Yetkisiz erişim" },
        { status: 401 }
      );
    }

    const db = getDb();
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
    const parsed = worklogCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { work_date, summary } = parsed.data;

    const existing = await db
      .prepare(
        "SELECT id FROM worklogs WHERE user_id = ? AND work_date = ?"
      )
      .get(user.id, work_date);

    if (existing) {
      return NextResponse.json(
        { ok: false, error: "Bu tarih için günlük zaten mevcut" },
        { status: 409 }
      );
    }

    const id = uuidv4();
    const now = nowIso();
    await db.prepare(
      `INSERT INTO worklogs (id, user_id, work_date, summary, status_code, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'draft', ?, ?)`
    ).run(id, user.id, work_date, summary || "", now, now);

    const created = await db.prepare("SELECT * FROM worklogs WHERE id = ?").get(id);
    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("Worklog create error:", error);
    return NextResponse.json(
      { ok: false, error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}

