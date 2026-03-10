import { NextResponse } from "next/server";
import path from "path";

export async function GET() {
  const dbPath = path.join(process.cwd(), "data", "opsdesk.sqlite");
  let bsqError: string | null = null;
  let bsqStack: string | null = null;

  // Test better-sqlite3 directly to get real error
  try {
    const Database = (await import("better-sqlite3")).default;
    const db = new Database(dbPath);
    db.close();
  } catch (e: unknown) {
    const err = e as Error & { code?: string };
    bsqError = err?.message || String(e);
    bsqStack = err?.stack ?? null;
  }

  try {
    const { getDb } = await import("@/lib/db");
    const db = getDb();
    const result = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
    return NextResponse.json({ ok: true, users: result.count, node: process.version, cwd: process.cwd(), dbPath });
  } catch (error: unknown) {
    const err = error as Error & { code?: string };
    return NextResponse.json({
      ok: false,
      error: err?.message || String(error),
      code: err?.code,
      bsqError,
      bsqStack,
      node: process.version,
      cwd: process.cwd(),
      dbPath,
    }, { status: 500 });
  }
}
