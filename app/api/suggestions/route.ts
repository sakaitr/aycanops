import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { nextSuggestNo } from "@/lib/suggestNo";
import { suggestionCreateSchema } from "@/lib/schemas";
import { apiError } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "suggestions:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const db = getDb();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const page  = Math.max(1, parseInt(searchParams.get("page")  || "1"));
    const limit = Math.min(9999, Math.max(1, parseInt(searchParams.get("limit") || "100")));
    const offset = (page - 1) * limit;

    let sql = `SELECT s.*, u.full_name as creator_name, a.full_name as assigned_name
               FROM suggestions s
               LEFT JOIN users u ON u.id = s.created_by
               LEFT JOIN users a ON a.id = s.assigned_to
               WHERE 1=1`;
    const params: unknown[] = [];

    if (!hasPermission(user, "suggestions:assign")) {
      sql += " AND s.created_by = ?";
      params.push(user.id);
    }

    if (status) {
      sql += " AND s.status = ?";
      params.push(status);
    }

    const countRow = await db.prepare(`SELECT COUNT(*) as total FROM (${sql}) _t`).get(...params) as { total: number };
    const total = countRow.total;

    sql += " ORDER BY s.created_at DESC LIMIT ? OFFSET ?";
    const rows = await db.prepare(sql).all(...params, limit, offset);

    return NextResponse.json({ ok: true, data: rows, meta: { total, page, limit, pages: Math.ceil(total / limit) } });
  } catch (e) { return apiError(e); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "suggestions:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const db = getDb();
    const body = await request.json();
    const parsed = suggestionCreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { title, description, category, kaynak } = parsed.data;
    const suggestNo = await nextSuggestNo();
    const id  = uuidv4();
    const now = nowIso();

    await db.prepare(
      `INSERT INTO suggestions (id, suggest_no, title, description, category, kaynak, status, created_by, assigned_to, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?, NULL, ?, ?)`
    ).run(id, suggestNo, title, description || null, category, kaynak || null, user.id, now, now);

    const created = await db.prepare("SELECT * FROM suggestions WHERE id = ?").get(id);
    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (e) { return apiError(e); }
}
