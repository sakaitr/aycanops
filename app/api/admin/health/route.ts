import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user || user.role !== "admin") {
      return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    }

    const db = getDb();

    // DB ping
    const dbPing = await db
      .prepare("SELECT 1 AS ok")
      .get<{ ok: number }>();

    // Migration count
    const migrationRow = await db
      .prepare("SELECT COUNT(*) AS cnt FROM schema_migrations")
      .get<{ cnt: number }>();

    // Uptime
    const uptimeRow = await db
      .prepare("SELECT VARIABLE_VALUE AS uptime FROM performance_schema.global_status WHERE VARIABLE_NAME = 'Uptime'")
      .get<{ uptime: string }>().catch(() => undefined);

    // Row counts
    const counts: Record<string, number> = {};
    for (const table of ["users", "companies", "vehicles", "tickets", "todos", "trips"]) {
      const row = await db
        .prepare(`SELECT COUNT(*) AS cnt FROM ${table}`)
        .get<{ cnt: number }>();
      counts[table] = row?.cnt ?? 0;
    }

    return NextResponse.json({
      ok: true,
      data: {
        db: dbPing?.ok === 1 ? "up" : "down",
        migrations: migrationRow?.cnt ?? 0,
        db_uptime_seconds: uptimeRow ? Number(uptimeRow.uptime) : null,
        node_uptime_seconds: Math.floor(process.uptime()),
        node_version: process.version,
        env: process.env.NODE_ENV,
        counts,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (e) {
    console.error("Health check error:", e);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
