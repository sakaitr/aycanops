import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canViewTodo, isAtLeast } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { logAudit } from "@/lib/audit";
import { todoCreateSchema } from "@/lib/schemas";

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
    const assignedTo = searchParams.get("assignedTo");
    const status = searchParams.get("status");
    const viewAll = searchParams.get("viewAll") === "true";

    let sql = `SELECT todos.*, users.full_name as assigned_name
               FROM todos
               LEFT JOIN users ON users.id = todos.assigned_to
               WHERE 1=1`;
    const params: unknown[] = [];

    if (!isAtLeast(user.role, "yonetici") && !viewAll) {
      sql +=
        " AND (todos.assigned_to = ? OR todos.created_by = ?)";
      params.push(user.id, user.id);
    } else if (assignedTo) {
      sql += " AND todos.assigned_to = ?";
      params.push(assignedTo);
    }

    if (status) {
      sql += " AND todos.status_code = ?";
      params.push(status);
    }

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "100")));
    const offset = (page - 1) * limit;

    const countRow = await db.prepare(`SELECT COUNT(*) as total FROM (${sql}) _t`).get(...params) as { total: number };
    const total = countRow.total;

    sql += " ORDER BY todos.created_at DESC LIMIT ? OFFSET ?";
    const rows = await db.prepare(sql).all(...params, limit, offset);
    return NextResponse.json({ ok: true, data: rows, meta: { total, page, limit, pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error("Todos list error:", error);
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
    const parsed = todoCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const {
      title,
      description,
      priority_code,
      assigned_to,
      department_id,
      due_date,
      bulk_targets,
    } = parsed.data;

    const now = nowIso();

    if (bulk_targets) {
      const { target_type, target_value } = bulk_targets;

      let targetUsers: string[] = [];

      if (target_type === "department") {
        const users = await db
          .prepare(
            "SELECT id FROM users WHERE department_id = ? AND is_active = 1"
          )
          .all(target_value) as { id: string }[];
        targetUsers = users.map((u) => u.id);
      } else if (target_type === "role") {
        const users = await db
          .prepare("SELECT id FROM users WHERE role = ? AND is_active = 1")
          .all(target_value) as { id: string }[];
        targetUsers = users.map((u) => u.id);
      } else if (target_type === "users") {
        targetUsers = Array.isArray(target_value) ? target_value : [target_value];
      } else {
        return NextResponse.json(
          { ok: false, error: "Geçersiz target_type" },
          { status: 400 }
        );
      }

      if (!Array.isArray(targetUsers) || targetUsers.length === 0) {
        return NextResponse.json(
          { ok: false, error: "Hedef kullanıcı bulunamadı" },
          { status: 400 }
        );
      }

      const ids: string[] = [];

      for (const userId of targetUsers) {
        const id = uuidv4();
        await db.prepare(
          `INSERT INTO todos (id, title, description, status_code, priority_code, assigned_to, created_by, department_id, due_date, created_at, updated_at)
           VALUES (?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          title,
          description || null,
          priority_code || null,
          userId,
          user.id,
          department_id || null,
          due_date || null,
          now,
          now
        );
        ids.push(id);
        await logAudit({
          actorUserId: user.id,
          action: "todo_create_bulk",
          entityType: "todo",
          entityId: id,
          details: { assigned_to: userId },
        });
      }

      return NextResponse.json(
        { ok: true, data: { created_count: ids.length, ids } },
        { status: 201 }
      );
    }

    const id = uuidv4();
    await db.prepare(
      `INSERT INTO todos (id, title, description, status_code, priority_code, assigned_to, created_by, department_id, due_date, created_at, updated_at)
       VALUES (?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      title,
      description || null,
      priority_code || null,
      assigned_to || null,
      user.id,
      department_id || null,
      due_date || null,
      now,
      now
    );

    await logAudit({
      actorUserId: user.id,
      action: "todo_create",
      entityType: "todo",
      entityId: id,
    });

    const created = await db.prepare("SELECT * FROM todos WHERE id = ?").get(id);
    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("Todo create error:", error);
    return NextResponse.json(
      { ok: false, error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}

