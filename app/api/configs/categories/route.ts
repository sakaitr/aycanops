import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canManageConfigs } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { logAudit } from "@/lib/audit";
import { categorySchema } from "@/lib/schemas";

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
    const type = searchParams.get("type");
    const activeOnly = searchParams.get("activeOnly") === "true";

    let sql = "SELECT * FROM config_categories WHERE 1=1";
    const params: unknown[] = [];

    if (type) {
      sql += " AND type = ?";
      params.push(type);
    }

    if (activeOnly) {
      sql += " AND is_active = 1";
    }

    sql += " ORDER BY name ASC";

    const rows = await db.prepare(sql).all(...params);
    return NextResponse.json({ ok: true, data: rows });
  } catch (error) {
    console.error("Categories list error:", error);
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

    if (!canManageConfigs(user.role)) {
      return NextResponse.json(
        { ok: false, error: "Yetersiz yetki" },
        { status: 403 }
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
    const parsed = categorySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { type, name, color } = parsed.data;

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();

    await db.prepare(
      "INSERT INTO config_categories (id, type, name, color, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)"
    ).run(id, type, name, color || null, now, now);

    await logAudit({
      actorUserId: user.id,
      action: "category_create",
      entityType: "config_category",
      entityId: id,
      details: { type, name },
    });

    const created = await db
      .prepare("SELECT * FROM config_categories WHERE id = ?")
      .get(id);
    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("Category create error:", error);
    return NextResponse.json(
      { ok: false, error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Yetkisiz erişim" },
        { status: 401 }
      );
    }

    if (!canManageConfigs(user.role)) {
      return NextResponse.json(
        { ok: false, error: "Yetersiz yetki" },
        { status: 403 }
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
    const { id, name, color, is_active } = body;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Kategori ID gerekli" },
        { status: 400 }
      );
    }

    const db = getDb();
    const now = nowIso();

    let sql = "UPDATE config_categories SET updated_at = ?";
    const params: unknown[] = [now];

    if (name !== undefined) {
      sql += ", name = ?";
      params.push(name);
    }

    if (color !== undefined) {
      sql += ", color = ?";
      params.push(color || null);
    }

    if (is_active !== undefined) {
      sql += ", is_active = ?";
      params.push(is_active ? 1 : 0);
    }

    sql += " WHERE id = ?";
    params.push(id);

    await db.prepare(sql).run(...params);

    await logAudit({
      actorUserId: user.id,
      action: "category_update",
      entityType: "config_category",
      entityId: id,
    });

    const updated = await db
      .prepare("SELECT * FROM config_categories WHERE id = ?")
      .get(id);
    return NextResponse.json({ ok: true, data: updated });
  } catch (error) {
    console.error("Category update error:", error);
    return NextResponse.json(
      { ok: false, error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}

