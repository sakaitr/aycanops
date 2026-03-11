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
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const userId = searchParams.get("userId");

    let sql = `
      SELECT 
        users.id as user_id,
        users.full_name as user_name,
        COUNT(worklogs.id) as total_worklogs,
        SUM(CASE WHEN worklogs.status_code = 'draft' THEN 1 ELSE 0 END) as draft_count,
        SUM(CASE WHEN worklogs.status_code = 'submitted' THEN 1 ELSE 0 END) as submitted_count,
        SUM(CASE WHEN worklogs.status_code = 'approved' THEN 1 ELSE 0 END) as approved_count,
        SUM(CASE WHEN worklogs.status_code = 'returned' THEN 1 ELSE 0 END) as returned_count
      FROM users
      LEFT JOIN worklogs ON worklogs.user_id = users.id
      WHERE users.is_active = 1
    `;
    const params: unknown[] = [];

    if (userId) {
      sql += " AND users.id = ?";
      params.push(userId);
    }

    if (startDate) {
      sql += " AND worklogs.work_date >= ?";
      params.push(startDate);
    }

    if (endDate) {
      sql += " AND worklogs.work_date <= ?";
      params.push(endDate);
    }

    sql += " GROUP BY users.id, users.full_name ORDER BY users.full_name ASC";

    const userStats = await db.prepare(sql).all(...params);

    let categorySql = `
      SELECT 
        config_categories.name as category_name,
        COUNT(worklog_items.id) as item_count
      FROM worklog_items
      JOIN worklogs ON worklogs.id = worklog_items.worklog_id
      LEFT JOIN config_categories ON config_categories.id = worklog_items.category_id
      WHERE 1=1
    `;
    const categoryParams: unknown[] = [];

    if (userId) {
      categorySql += " AND worklogs.user_id = ?";
      categoryParams.push(userId);
    }

    if (startDate) {
      categorySql += " AND worklogs.work_date >= ?";
      categoryParams.push(startDate);
    }

    if (endDate) {
      categorySql += " AND worklogs.work_date <= ?";
      categoryParams.push(endDate);
    }

    categorySql +=
      " GROUP BY config_categories.name ORDER BY item_count DESC";

    const categoryStats = await db.prepare(categorySql).all(...categoryParams);

    const pendingApprovals = await db
      .prepare(
        `SELECT worklogs.*, users.full_name as user_name
         FROM worklogs
         JOIN users ON users.id = worklogs.user_id
         WHERE worklogs.status_code = 'submitted'
         ORDER BY worklogs.submitted_at ASC`
      )
      .all();

    return NextResponse.json({
      ok: true,
      data: {
        user_stats: userStats,
        category_stats: categoryStats,
        pending_approvals: pendingApprovals,
      },
    });
  } catch (error) {
    console.error("Worklog report error:", error);
    return NextResponse.json(
      { ok: false, error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}

