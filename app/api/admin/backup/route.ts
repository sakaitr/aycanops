import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

// Tables to export (in dependency order so import is safe)
const TABLES = [
  "departments", "users", "sessions",
  "worklog_statuses", "ticket_statuses", "priorities", "sla_rules",
  "categories", "tags",
  "worklogs", "worklog_items",
  "tickets", "ticket_comments", "ticket_actions",
  "todos", "todo_templates",
  "companies", "vehicles", "company_vehicles",
  "routes", "trips", "entry_controls",
  "vehicle_arrivals", "driver_records", "driver_evaluations",
  "inspections", "audit_logs", "rate_limits",
];

export async function GET() {
  try {
    const user = await requireUser();
    if (!user || user.role !== "admin") {
      return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 403 });
    }

    const db = getDb();
    const lines: string[] = [
      "-- OpsDesk MySQL Backup",
      `-- Generated: ${new Date().toISOString()}`,
      "",
      "SET FOREIGN_KEY_CHECKS=0;",
      "",
    ];

    for (const table of TABLES) {
      try {
        const rows = await db.prepare(`SELECT * FROM \`${table}\``).all<Record<string, unknown>>();
        if (rows.length === 0) continue;

        lines.push(`-- Table: ${table}`);
        for (const row of rows) {
          const cols = Object.keys(row).map(c => `\`${c}\``).join(", ");
          const vals = Object.values(row).map(v => {
            if (v === null || v === undefined) return "NULL";
            if (typeof v === "number" || typeof v === "boolean") return String(v);
            return `'${String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
          }).join(", ");
          lines.push(`INSERT IGNORE INTO \`${table}\` (${cols}) VALUES (${vals});`);
        }
        lines.push("");
      } catch {
        // Table might not exist in this schema version
      }
    }

    lines.push("SET FOREIGN_KEY_CHECKS=1;");

    const sql = lines.join("\n");
    const dateStr = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `opsdesk_backup_${dateStr}.sql`;

    return new NextResponse(sql, {
      status: 200,
      headers: {
        "Content-Type": "application/sql",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("Backup error:", err);
    return NextResponse.json({ ok: false, error: "Yedek alınamadı" }, { status: 500 });
  }
}
