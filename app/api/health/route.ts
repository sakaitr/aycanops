import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { getDb } = await import("@/lib/db");
    const db = getDb();
    const result = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
    return NextResponse.json({ ok: true, users: result.count, node: process.version, cwd: process.cwd() });
  } catch (error: unknown) {
    const err = error as Error & { code?: string };
    return NextResponse.json({
      ok: false,
      error: err?.message || String(error),
      code: err?.code,
      node: process.version,
      cwd: process.cwd(),
    }, { status: 500 });
  }
}
