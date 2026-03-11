import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canManageConfigs, isAtLeast } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { logAudit } from "@/lib/audit";
import { templateCreateSchema } from "@/lib/schemas";

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
    const activeOnly = searchParams.get("activeOnly") === "true";

    let sql = "SELECT * FROM todo_templates WHERE 1=1";
    if (activeOnly) {
      sql += " AND is_active = 1";
    }
    sql += " ORDER BY created_at DESC";

    const rows = await db.prepare(sql).all();
    return NextResponse.json({ ok: true, data: rows });
  } catch (error) {
    console.error("Templates list error:", error);
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
    const parsed = templateCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { title, description, role_target, department_id, apply_now } = parsed.data;

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();

    await db.prepare(
      `INSERT INTO todo_templates (id, title, description, role_target, department_id, is_active, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`
    ).run(
      id,
      title,
      description || null,
      role_target || null,
      department_id || null,
      user.id,
      now,
      now
    );

    await logAudit({
      actorUserId: user.id,
      action: "template_create",
      entityType: "todo_template",
      entityId: id,
      details: { title },
    });

    if (apply_now) {
      let targetUsers: string[] = [];
      if (department_id) {
        const users = await db
          .prepare(
            "SELECT id FROM users WHERE department_id = ? AND is_active = 1"
          )
          .all(department_id) as { id: string }[];
        targetUsers = users.map((u) => u.id);
      } else if (role_target) {
        const users = await db
          .prepare("SELECT id FROM users WHERE role = ? AND is_active = 1")
          .all(role_target) as { id: string }[];
        targetUsers = users.map((u) => u.id);
      }

      for (const userId of targetUsers) {
        const todoId = uuidv4();
        await db.prepare(
          `INSERT INTO todos (id, title, description, status_code, assigned_to, created_by, department_id, created_at, updated_at)
           VALUES (?, ?, ?, 'todo', ?, ?, ?, ?, ?)`
        ).run(
          todoId,
          title,
          description || null,
          userId,
          user.id,
          department_id || null,
          now,
          now
        );
      }

      await logAudit({
        actorUserId: user.id,
        action: "template_apply",
        entityType: "todo_template",
        entityId: id,
        details: { created_count: targetUsers.length },
      });
    }

    const created = await db
      .prepare("SELECT * FROM todo_templates WHERE id = ?")
      .get(id);
    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("Template create error:", error);
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
    const { id, title, description, role_target, department_id, is_active } = body;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Şablon ID gerekli" },
        { status: 400 }
      );
    }

    const db = getDb();
    const now = nowIso();

    let sql = "UPDATE todo_templates SET updated_at = ?";
    const params: unknown[] = [now];

    if (title !== undefined) {
      sql += ", title = ?";
      params.push(title);
    }

    if (description !== undefined) {
      sql += ", description = ?";
      params.push(description || null);
    }

    if (role_target !== undefined) {
      sql += ", role_target = ?";
      params.push(role_target || null);
    }

    if (department_id !== undefined) {
      sql += ", department_id = ?";
      params.push(department_id || null);
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
      action: "template_update",
      entityType: "todo_template",
      entityId: id,
    });

    const updated = await db
      .prepare("SELECT * FROM todo_templates WHERE id = ?")
      .get(id);
    return NextResponse.json({ ok: true, data: updated });
  } catch (error) {
    console.error("Template update error:", error);
    return NextResponse.json(
      { ok: false, error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}

