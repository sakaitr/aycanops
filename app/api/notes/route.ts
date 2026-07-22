import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { nowIso } from "@/lib/time";
import { noteCreateSchema, noteUpdateSchema } from "@/lib/schemas";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const db = getDb();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() || "";
    const targetUserId = searchParams.get("user_id");

    // Admin başka kullanıcının notlarını görebilir
    const viewUserId =
      user.role === "admin" && targetUserId ? targetUserId : user.id;

    let sql = `
      SELECT n.id, n.title, n.content, n.created_at, n.updated_at, n.user_id,
             u.full_name AS user_full_name
      FROM notes n
      JOIN users u ON u.id = n.user_id
      WHERE n.user_id = ?`;
    const params: unknown[] = [viewUserId];

    if (q) {
      sql += " AND (n.title LIKE ? OR n.content LIKE ?)";
      params.push(`%${q}%`, `%${q}%`);
    }

    sql += " ORDER BY n.updated_at DESC";

    const rows = await db.prepare(sql).all(...params);
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const raw = await req.json();
    const parsed = noteCreateSchema.safeParse(raw);
    if (!parsed.success)
      return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { title, content } = parsed.data;
    const db = getDb();
    const now = nowIso();
    const id = uuidv4();

    await db.prepare(
      "INSERT INTO notes (id, user_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id, user.id, title ?? "", content ?? "", now, now);

    const created = await db.prepare("SELECT * FROM notes WHERE id = ?").get(id);
    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (e) { return apiError(e); }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "id gerekli" }, { status: 400 });

    const db = getDb();
    const existing: any = await db.prepare("SELECT * FROM notes WHERE id = ?").get(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Not bulunamadı" }, { status: 404 });
    if (existing.user_id !== user.id)
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const raw = await req.json();
    const parsed = noteUpdateSchema.safeParse(raw);
    if (!parsed.success)
      return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { title, content } = parsed.data;
    const now = nowIso();
    const newTitle = title !== undefined ? title : existing.title;
    const newContent = content !== undefined ? content : existing.content;

    await db.prepare(
      "UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ?"
    ).run(newTitle, newContent, now, id);

    return NextResponse.json({ ok: true, data: { id, title: newTitle, content: newContent, updated_at: now } });
  } catch (e) { return apiError(e); }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "id gerekli" }, { status: 400 });

    const db = getDb();
    const existing: any = await db.prepare("SELECT * FROM notes WHERE id = ?").get(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Not bulunamadı" }, { status: 404 });

    // Sadece sahibi veya admin silebilir
    if (existing.user_id !== user.id && user.role !== "admin")
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    await db.prepare("DELETE FROM notes WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
