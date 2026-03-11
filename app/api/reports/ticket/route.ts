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
    const priority = searchParams.get("priority");
    const category = searchParams.get("category");

    let countsSql = `
      SELECT 
        status_code,
        COUNT(*) as count
      FROM tickets
      WHERE 1=1
    `;
    const countsParams: unknown[] = [];

    if (startDate) {
      countsSql += " AND created_at >= ?";
      countsParams.push(startDate);
    }

    if (endDate) {
      countsSql += " AND created_at <= ?";
      countsParams.push(endDate);
    }

    if (priority) {
      countsSql += " AND priority_code = ?";
      countsParams.push(priority);
    }

    if (category) {
      countsSql += " AND category_id = ?";
      countsParams.push(category);
    }

    countsSql += " GROUP BY status_code";

    const statusCounts = await db.prepare(countsSql).all(...countsParams);

    let resolutionSql = `
      SELECT 
        AVG(DATEDIFF(closed_at, created_at)) as avg_days,
        CASE 
          WHEN DATEDIFF(closed_at, created_at) < 1 THEN '0-1'
          WHEN DATEDIFF(closed_at, created_at) < 7 THEN '1-7'
          WHEN DATEDIFF(closed_at, created_at) < 30 THEN '7-30'
          ELSE '30+'
        END as aging_bucket,
        COUNT(*) as count
      FROM tickets
      WHERE closed_at IS NOT NULL
    `;
    const resolutionParams: unknown[] = [];

    if (startDate) {
      resolutionSql += " AND created_at >= ?";
      resolutionParams.push(startDate);
    }

    if (endDate) {
      resolutionSql += " AND created_at <= ?";
      resolutionParams.push(endDate);
    }

    resolutionSql += " GROUP BY aging_bucket";

    const resolutionStats = await db.prepare(resolutionSql).all(...resolutionParams);

    const avgResolution = await db
      .prepare(
        `SELECT 
           AVG(DATEDIFF(closed_at, created_at)) as avg_days,
           AVG(DATEDIFF(closed_at, created_at)) as median_days
         FROM tickets
         WHERE closed_at IS NOT NULL`
      )
      .get() as
      | { avg_days: number | null; median_days: number | null }
      | undefined;

    let slaBreachSql = `
      SELECT tickets.*, users.full_name as assigned_name
      FROM tickets
      LEFT JOIN users ON users.id = tickets.assigned_to
      WHERE tickets.sla_due_at IS NOT NULL 
        AND tickets.sla_due_at < NOW()
        AND tickets.status_code NOT IN ('solved', 'closed')
      ORDER BY tickets.sla_due_at ASC
      LIMIT 100
    `;

    const slaBreaches = await db.prepare(slaBreachSql).all();

    return NextResponse.json({
      ok: true,
      data: {
        status_counts: statusCounts,
        resolution_stats: resolutionStats,
        avg_resolution_days: avgResolution?.avg_days || 0,
        median_resolution_days: avgResolution?.median_days || 0,
        sla_breaches: slaBreaches,
      },
    });
  } catch (error) {
    console.error("Ticket report error:", error);
    return NextResponse.json(
      { ok: false, error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}

