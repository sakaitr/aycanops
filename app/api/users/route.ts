import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hashPassword } from "@/lib/auth";
import { isAtLeast } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { userCreateSchema } from "@/lib/schemas";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const simple = new URL(req.url).searchParams.get("simple") === "1";

    // simple=1 returns id+full_name for yetkili+ (for dropdowns)
    if (simple) {
      if (!isAtLeast(user.role, "yetkili")) {
        return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
      }
      const db = getDb();
      const data = await db.prepare(
        "SELECT id, full_name, role FROM users WHERE is_active = 1 ORDER BY full_name ASC"
      ).all();
      return NextResponse.json({ ok: true, data });
    }

    if (user.role !== "admin") return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const db = getDb();
    const data = await db.prepare(`
      SELECT u.id, u.username, u.full_name, u.role, u.is_active,
             u.department_id, d.name as department_name,
             u.allowed_pages, u.allowed_companies,
             u.created_at, u.updated_at
      FROM users u
      LEFT JOIN departments d ON d.id = u.department_id
      ORDER BY
        CASE u.role WHEN 'admin' THEN 0 WHEN 'yonetici' THEN 1 WHEN 'yetkili' THEN 2 ELSE 3 END,
        u.full_name ASC
    `).all();
    return NextResponse.json({ ok: true, data });
  } catch {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (user.role !== "admin") return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    const parsed = userCreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const { username, password, full_name, role, department_id } = parsed.data;

    const db = getDb();
    const now = nowIso();
    const id = uuidv4();
    const hash = hashPassword(password);

    await db.prepare(
      "INSERT INTO users (id, username, password_hash, full_name, role, department_id, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)"
    ).run(id, username.trim().toLowerCase(), hash, full_name.trim(), role, department_id || null, now, now);

    return NextResponse.json({ ok: true, data: { id } });
  } catch (e: any) {
    if (e?.message?.includes("UNIQUE")) return NextResponse.json({ ok: false, error: "Bu kullanıcı adı zaten kayıtlı" }, { status: 409 });
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
