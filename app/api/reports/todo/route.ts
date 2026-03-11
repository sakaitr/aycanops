import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isAtLeast } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Yetkisiz erişim" },
        { status: 401 }
      );
    }

    if (!isAtLeast(user.role, "yonetici")) {
      return NextResponse.json(
        { ok: false, error: "Yetersiz yetki" },
        { status: 403 }
      );
    }

    const db = getDb();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const status = searchParams.get("status");

    let sql = `
      SELECT 
        users.id as user_id,
        users.full_name as user_name,
        COUNT(todos.id) as total_todos,
        SUM(CASE WHEN todos.status_code = 'todo' THEN 1 ELSE 0 END) as todo_count,
        SUM(CASE WHEN todos.status_code = 'doing' THEN 1 ELSE 0 END) as doing_count,
        SUM(CASE WHEN todos.status_code = 'blocked' THEN 1 ELSE 0 END) as blocked_count,
        SUM(CASE WHEN todos.status_code = 'done' THEN 1 ELSE 0 END) as done_count,
        SUM(CASE WHEN todos.due_date < NOW() AND todos.status_code != 'done' THEN 1 ELSE 0 END) as overdue_count
      FROM users
      LEFT JOIN todos ON todos.assigned_to = users.id
      WHERE users.is_active = 1
    `;
    const params: unknown[] = [];

    if (userId) {
      sql += " AND users.id = ?";
      params.push(userId);
    }

    if (status) {
      sql += " AND todos.status_code = ?";
      params.push(status);
    }

    sql += " GROUP BY users.id, users.full_name ORDER BY users.full_name ASC";

    const userStats = await db.prepare(sql).all(...params);

    const avgCompletionSql = `
      SELECT 
        AVG(DATEDIFF(completed_at, created_at)) as avg_days
      FROM todos
      WHERE status_code = 'done' AND completed_at IS NOT NULL
    `;
    const avgCompletion = await db.prepare(avgCompletionSql).get() as
      | { avg_days: number | null }
      | undefined;

    const overdueTodos = await db
      .prepare(
        `SELECT todos.*, users.full_name as assigned_name
         FROM todos
         LEFT JOIN users ON users.id = todos.assigned_to
         WHERE todos.due_date < NOW() AND todos.status_code != 'done'
         ORDER BY todos.due_date ASC
         LIMIT 100`
      )
      .all();

    return NextResponse.json({
      ok: true,
      data: {
        user_stats: userStats,
        avg_completion_days: avgCompletion?.avg_days || 0,
        overdue_todos: overdueTodos,
      },
    });
  } catch (error) {
    console.error("Todo report error:", error);
    return NextResponse.json(
      { ok: false, error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}

