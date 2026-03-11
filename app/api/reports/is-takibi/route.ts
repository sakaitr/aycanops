import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isAtLeast } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Yetkisiz erişim" }, { status: 401 });
    }
    if (!isAtLeast(user.role, "yetkili")) {
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    }

    const db = getDb();
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate"); // YYYY-MM-DD
    const endDate = searchParams.get("endDate");     // YYYY-MM-DD

    const dateFilter = (col: string, params: unknown[]) => {
      let sql = "";
      if (startDate) { sql += ` AND ${col} >= ?`; params.push(startDate + "T00:00:00.000Z"); }
      if (endDate)   { sql += ` AND ${col} <= ?`; params.push(endDate + "T23:59:59.999Z"); }
      return sql;
    };

    // ─────────────────────────────────────────────
    // GÖREVLER (todos)
    // ─────────────────────────────────────────────

    const todoBySP: unknown[] = [];
    const todoByStatus = await db.prepare(
      `SELECT status_code, COUNT(*) as count FROM todos WHERE 1=1${dateFilter("created_at", todoBySP)} GROUP BY status_code`
    ).all(...todoBySP) as { status_code: string; count: number }[];

    const todoByPP: unknown[] = [];
    const todoByPriority = await db.prepare(
      `SELECT priority_code, COUNT(*) as count FROM todos WHERE priority_code IS NOT NULL${dateFilter("created_at", todoByPP)} GROUP BY priority_code ORDER BY CASE priority_code WHEN 'high' THEN 1 WHEN 'med' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`
    ).all(...todoByPP) as { priority_code: string; count: number }[];

    const todoAssigneeP: unknown[] = [];
    const todoByAssignee = await db.prepare(
      `SELECT u.full_name, COUNT(*) as total,
              SUM(CASE WHEN t.status_code = 'done' THEN 1 ELSE 0 END) as done,
              SUM(CASE WHEN t.status_code IN ('todo','doing','blocked') AND t.due_date IS NOT NULL AND t.due_date < CURDATE() THEN 1 ELSE 0 END) as overdue
       FROM todos t
       JOIN users u ON u.id = t.assigned_to
       WHERE t.assigned_to IS NOT NULL${dateFilter("t.created_at", todoAssigneeP)}
       GROUP BY t.assigned_to, u.full_name
       ORDER BY total DESC
       LIMIT 20`
    ).all(...todoAssigneeP) as { full_name: string; total: number; done: number; overdue: number }[];

    const overdueP: unknown[] = [];
    const overdueRow = await db.prepare(
      `SELECT COUNT(*) as count FROM todos WHERE status_code != 'done' AND due_date IS NOT NULL AND due_date < CURDATE()${dateFilter("created_at", overdueP)}`
    ).get(...overdueP) as { count: number };

    const todoTotal = todoByStatus.reduce((s, r) => s + r.count, 0);
    const todoDone = todoByStatus.find(r => r.status_code === "done")?.count ?? 0;

    // ─────────────────────────────────────────────
    // SORUNLAR (tickets)
    // ─────────────────────────────────────────────

    const tickBySP: unknown[] = [];
    const ticketByStatus = await db.prepare(
      `SELECT status_code, COUNT(*) as count FROM tickets WHERE 1=1${dateFilter("created_at", tickBySP)} GROUP BY status_code`
    ).all(...tickBySP) as { status_code: string; count: number }[];

    const tickByPP: unknown[] = [];
    const ticketByPriority = await db.prepare(
      `SELECT priority_code, COUNT(*) as count FROM tickets WHERE priority_code IS NOT NULL${dateFilter("created_at", tickByPP)} GROUP BY priority_code ORDER BY CASE priority_code WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'med' THEN 3 WHEN 'low' THEN 4 ELSE 5 END`
    ).all(...tickByPP) as { priority_code: string; count: number }[];

    const tickAssigneeP: unknown[] = [];
    const ticketByAssignee = await db.prepare(
      `SELECT u.full_name, COUNT(*) as total,
              SUM(CASE WHEN tk.status_code IN ('solved','closed') THEN 1 ELSE 0 END) as resolved
       FROM tickets tk
       JOIN users u ON u.id = tk.assigned_to
       WHERE tk.assigned_to IS NOT NULL${dateFilter("tk.created_at", tickAssigneeP)}
       GROUP BY tk.assigned_to, u.full_name
       ORDER BY total DESC
       LIMIT 20`
    ).all(...tickAssigneeP) as { full_name: string; total: number; resolved: number }[];

    // Çözümlenme süresi: created_at → solved_at (saat cinsinden)
    const resP: unknown[] = [];
    const resDateFilter = dateFilter("created_at", resP);
    const resolutionRow = await db.prepare(
      `SELECT
         COUNT(*) as solved_count,
         ROUND(AVG(TIMESTAMPDIFF(HOUR, created_at, solved_at)), 2) as avg_hours,
         ROUND(MIN(TIMESTAMPDIFF(HOUR, created_at, solved_at)), 2) as min_hours,
         ROUND(MAX(TIMESTAMPDIFF(HOUR, created_at, solved_at)), 2) as max_hours
       FROM tickets
       WHERE solved_at IS NOT NULL${resDateFilter}`
    ).get(...resP) as { solved_count: number; avg_hours: number | null; min_hours: number | null; max_hours: number | null };

    // SLA ihlali (aktif sorunlar)
    const slaP: unknown[] = [];
    const slaBreachRow = await db.prepare(
      `SELECT COUNT(*) as count FROM tickets
       WHERE sla_due_at IS NOT NULL AND sla_due_at < NOW()
         AND status_code NOT IN ('solved','closed')${dateFilter("created_at", slaP)}`
    ).get(...slaP) as { count: number };

    // Çözümlenme süresi dağılımı (bucket'lar)
    const resBucketP: unknown[] = [];
    const resBuckets = await db.prepare(
      `SELECT
         CASE
           WHEN TIMESTAMPDIFF(MINUTE, created_at, solved_at) < 60 THEN '< 1 saat'
           WHEN TIMESTAMPDIFF(HOUR, created_at, solved_at) < 4 THEN '1-4 saat'
           WHEN TIMESTAMPDIFF(HOUR, created_at, solved_at) < 24 THEN '4-24 saat'
           WHEN DATEDIFF(solved_at, created_at) < 7 THEN '1-7 gün'
           ELSE '7+ gün'
         END as bucket,
         COUNT(*) as count
       FROM tickets
       WHERE solved_at IS NOT NULL${dateFilter("created_at", resBucketP)}
       GROUP BY bucket`
    ).all(...resBucketP) as { bucket: string; count: number }[];

    // Aylık trend: son 6 ay
    const now = new Date();
    const monthlyTrend: { month: string; created: number; solved: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const label = `${year}-${month}`;
      const from = `${label}-01`;
      const toD = new Date(year, d.getMonth() + 1, 1);
      const to = `${toD.getFullYear()}-${String(toD.getMonth() + 1).padStart(2, "0")}-01`;
      const created = (await db.prepare(
        "SELECT COUNT(*) as c FROM tickets WHERE created_at >= ? AND created_at < ?"
      ).get(from, to) as { c: number }).c;
      const solved = (await db.prepare(
        "SELECT COUNT(*) as c FROM tickets WHERE solved_at >= ? AND solved_at < ?"
      ).get(from, to) as { c: number }).c;
      monthlyTrend.push({ month: label, created, solved });
    }

    const ticketTotal = ticketByStatus.reduce((s, r) => s + r.count, 0);

    return NextResponse.json({
      ok: true,
      data: {
        todos: {
          total: todoTotal,
          done: todoDone,
          overdue: overdueRow.count,
          byStatus: todoByStatus,
          byPriority: todoByPriority,
          byAssignee: todoByAssignee,
        },
        tickets: {
          total: ticketTotal,
          byStatus: ticketByStatus,
          byPriority: ticketByPriority,
          byAssignee: ticketByAssignee,
          slaBreaches: slaBreachRow.count,
          resolution: {
            count: resolutionRow.solved_count,
            avgHours: resolutionRow.avg_hours,
            minHours: resolutionRow.min_hours,
            maxHours: resolutionRow.max_hours,
            buckets: resBuckets,
          },
          monthlyTrend,
        },
      },
    });
  } catch (error) {
    console.error("İş takibi rapor hatası:", error);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
