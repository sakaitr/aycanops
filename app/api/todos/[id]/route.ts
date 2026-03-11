import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canViewTodo, isAtLeast } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { logAudit } from "@/lib/audit";
import { todoUpdateSchema } from "@/lib/schemas";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Yetkisiz erişim" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const db = getDb();
    const todo = await db.prepare("SELECT * FROM todos WHERE id = ?").get(id) as
      | { assigned_to: string | null; created_by: string }
      | undefined;

    if (!todo) {
      return NextResponse.json(
        { ok: false, error: "Görev bulunamadı" },
        { status: 404 }
      );
    }

    if (!canViewTodo(user, todo)) {
      return NextResponse.json(
        { ok: false, error: "Yetersiz yetki" },
        { status: 403 }
      );
    }

    const comments = await db
      .prepare(
        `SELECT todo_comments.*, users.full_name as user_name
         FROM todo_comments
         JOIN users ON users.id = todo_comments.user_id
         WHERE todo_comments.todo_id = ?
         ORDER BY todo_comments.created_at ASC`
      )
      .all(id);

    return NextResponse.json({ ok: true, data: { ...todo, comments } });
  } catch (error) {
    console.error("Todo detail error:", error);
    return NextResponse.json(
      { ok: false, error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Yetkisiz erişim" },
        { status: 401 }
      );
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Görev ID gerekli" },
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
    const parsed = todoUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { status_code, assigned_to, priority_code, due_date, description } = parsed.data;
    const db = getDb();

    const todoRaw = await db.prepare("SELECT * FROM todos WHERE id = ?").get(id);

    if (!todoRaw) {
      return NextResponse.json(
        { ok: false, error: "Görev bulunamadı" },
        { status: 404 }
      );
    }

    const todo = todoRaw as { assigned_to: string | null; created_by: string; status_code: string };

    if (!canViewTodo(user, todo)) {
      return NextResponse.json(
        { ok: false, error: "Yetersiz yetki" },
        { status: 403 }
      );
    }

    const now = nowIso();
    let updateSql = "UPDATE todos SET updated_at = ?";
    const updateParams: unknown[] = [now];

    if (status_code) {
      updateSql += ", status_code = ?";
      updateParams.push(status_code);
      if (status_code === "done") {
        updateSql += ", completed_at = ?";
        updateParams.push(now);
      }
      await logAudit({
        actorUserId: user.id,
        action: "todo_status_change",
        entityType: "todo",
        entityId: id,
        details: { old_status: todo.status_code, new_status: status_code },
      });
    }

    if (assigned_to !== undefined) {
      updateSql += ", assigned_to = ?";
      updateParams.push(assigned_to || null);
      await logAudit({
        actorUserId: user.id,
        action: "todo_assign",
        entityType: "todo",
        entityId: id,
        details: { assigned_to },
      });
    }

    if (priority_code !== undefined) {
      updateSql += ", priority_code = ?";
      updateParams.push(priority_code || null);
    }

    if (due_date !== undefined) {
      updateSql += ", due_date = ?";
      updateParams.push(due_date || null);
    }

    if (description !== undefined) {
      updateSql += ", description = ?";
      updateParams.push(description || null);
    }

    updateSql += " WHERE id = ?";
    updateParams.push(id);

    await db.prepare(updateSql).run(...updateParams);

    const updated = await db.prepare("SELECT * FROM todos WHERE id = ?").get(id);
    return NextResponse.json({ ok: true, data: updated });
  } catch (error) {
    console.error("Todo update error:", error);
    return NextResponse.json(
      { ok: false, error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Yetkisiz erişim" }, { status: 401 });
    }
    if (!isAtLeast(user.role, "yonetici")) {
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    }
    const { id } = await params;
    const db = getDb();
    const todo = await db.prepare("SELECT * FROM todos WHERE id = ?").get(id);
    if (!todo) {
      return NextResponse.json({ ok: false, error: "Görev bulunamadı" }, { status: 404 });
    }
    await db.prepare("DELETE FROM todo_comments WHERE todo_id = ?").run(id);
    await db.prepare("DELETE FROM todos WHERE id = ?").run(id);
    await logAudit({
      actorUserId: user.id,
      action: "todo_delete",
      entityType: "todo",
      entityId: id,
      details: {},
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Todo delete error:", error);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

