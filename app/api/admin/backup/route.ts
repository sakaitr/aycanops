import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";

// mysql2 döndürür: DATE/DATETIME -> Date nesnesi (dateStrings kapalı), JSON kolon ->
// zaten parse edilmiş obje, BLOB -> Buffer. Üçü de String(v) ile bozuk SQL üretir
// (örn. "Mon Sep 14 2026..." geçerli DATE literal değil) — hepsi burada elle çevrilir.
function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `'${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())} ${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}'`;
  }
  if (Buffer.isBuffer(v)) return `0x${v.toString("hex")}`;
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

// Tablo listesi elle tutulmuyordu; şema büyüdükçe (cetele/hakediş/mutabakat/
// route_plans/financial_snapshots gibi) sessizce eskiyip yedeğin dışında kalıyordu.
// information_schema'dan o anki gerçek tablo listesi okunur — asla eskimez.
// FK check'ler kapalı yüklendiğinden tablo sırası önemli değil.
export async function GET() {
  try {
    const user = await requireUser();
    if (!user || !hasPermission(user, "settings:update")) {
      return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 403 });
    }

    const db = getDb();
    const tables = await db.prepare(
      `SELECT TABLE_NAME AS name FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
       ORDER BY TABLE_NAME`
    ).all<{ name: string }>();

    const lines: string[] = [
      "-- AycanOps MySQL Backup",
      `-- Generated: ${new Date().toISOString()}`,
      "-- Full dump: every base table in the current database at backup time.",
      "",
      "SET FOREIGN_KEY_CHECKS=0;",
      "",
    ];

    for (const { name: table } of tables) {
      const rows = await db.prepare(`SELECT * FROM \`${table}\``).all<Record<string, unknown>>();
      if (rows.length === 0) continue;

      lines.push(`-- Table: ${table} (${rows.length} rows)`);
      for (const row of rows) {
        const cols = Object.keys(row).map(c => `\`${c}\``).join(", ");
        const vals = Object.values(row).map(sqlLiteral).join(", ");
        lines.push(`INSERT IGNORE INTO \`${table}\` (${cols}) VALUES (${vals});`);
      }
      lines.push("");
    }

    lines.push("SET FOREIGN_KEY_CHECKS=1;");

    const sql = lines.join("\n");
    const dateStr = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `aycanops_backup_${dateStr}.sql`;

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
