import fs from "fs";
import path from "path";
import { getDb } from "./db";

const MIGRATIONS_TABLE = "migrations";

async function ensureMigrationsTable() {
  const db = getDb();
  await db.exec(
    `CREATE TABLE IF NOT EXISTS \`${MIGRATIONS_TABLE}\` (
      id VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at VARCHAR(30) NOT NULL
    )`
  );
}

function listMigrationFiles(migrationsDir: string): string[] {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

export async function runMigrations(baseDir: string): Promise<void> {
  const db = getDb();
  const migrationsDir = path.join(baseDir, "migrations");
  await ensureMigrationsTable();

  const appliedRows = await db
    .prepare(`SELECT id FROM \`${MIGRATIONS_TABLE}\``)
    .all<{ id: string }>();
  const applied = new Set(appliedRows.map((row) => row.id));

  const files = listMigrationFiles(migrationsDir);
  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }
    try {
      const raw = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      // Strip UTF-8 BOM if present
      const sql = raw.replace(/^\uFEFF/, "");
      if (!sql || sql.trim().length === 0) {
        console.warn(`Migration file ${file} is empty, skipping`);
        continue;
      }
      const now = new Date().toISOString();
      // execScript handles multi-statement SQL files
      await db.execScript(sql);
      await db.prepare(
        `INSERT INTO \`${MIGRATIONS_TABLE}\` (id, applied_at) VALUES (?, ?)`
      ).run(file, now);
      console.log(`Migration ${file} applied successfully`);
    } catch (error) {
      console.error(`Migration ${file} failed:`, error);
      throw new Error(`Migration failed: ${file}`);
    }
  }
}
