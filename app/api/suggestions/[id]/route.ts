import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { suggestionUpdateSchema } from "@/lib/schemas";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "suggestions:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    const row = await db.prepare(
      `SELECT s.*, u.full_name as creator_name, a.full_name as assigned_name
       FROM suggestions s
       LEFT JOIN users u ON u.id = s.created_by
       LEFT JOIN users a ON a.id = s.assigned_to
       WHERE s.suggest_no = ?`
    ).get(id) as any;

    if (!row) return NextResponse.json({ ok: false, error: "Öneri bulunamadı" }, { status: 404 });

    if (!hasPermission(user, "suggestions:assign") && row.created_by !== user.id) {
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    }

    return NextResponse.json({ ok: true, data: row });
  } catch (e) {
    console.error("[GET suggestion]", e);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "suggestions:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    const existing = await db.prepare("SELECT * FROM suggestions WHERE suggest_no = ?").get(id) as any;
    if (!existing) return NextResponse.json({ ok: false, error: "Öneri bulunamadı" }, { status: 404 });

    if (!hasPermission(user, "suggestions:assign") && existing.created_by !== user.id) {
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = suggestionUpdateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { status, assigned_to, title, description, category } = parsed.data;

    if ((status === "closed" || assigned_to !== undefined) && !hasPermission(user, "suggestions:assign")) {
      return NextResponse.json({ ok: false, error: "Kapatma/atama yetkiniz yok" }, { status: 403 });
    }

    const now = nowIso();
    let sql = "UPDATE suggestions SET updated_at = ?";
    const sqlParams: unknown[] = [now];

    if (title !== undefined)       { sql += ", title = ?";       sqlParams.push(title); }
    if (description !== undefined) { sql += ", description = ?"; sqlParams.push(description || null); }
    if (category !== undefined)    { sql += ", category = ?";    sqlParams.push(category); }
    if (status !== undefined) {
      sql += ", status = ?";
      sqlParams.push(status);
      if (status === "closed") { sql += ", closed_at = ?"; sqlParams.push(now); }
    }
    if (assigned_to !== undefined) { sql += ", assigned_to = ?"; sqlParams.push(assigned_to || null); }

    sql += " WHERE id = ?";
    sqlParams.push(existing.id);

    await db.prepare(sql).run(...sqlParams);
    const updated = await db.prepare("SELECT * FROM suggestions WHERE id = ?").get(existing.id);
    return NextResponse.json({ ok: true, data: updated });
  } catch (e) {
    console.error("[PUT suggestion]", e);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "suggestions:delete")) {
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    }

    const { id } = await params;
    const db = getDb();
    const existing = await db.prepare("SELECT id FROM suggestions WHERE suggest_no = ?").get(id) as { id: string } | undefined;
    if (!existing) return NextResponse.json({ ok: false, error: "Öneri bulunamadı" }, { status: 404 });

    await db.prepare("DELETE FROM suggestions WHERE id = ?").run(existing.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE suggestion]", e);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
