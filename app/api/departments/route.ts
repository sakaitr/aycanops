import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isAtLeast } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { departmentSchema } from "@/lib/schemas";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const db = getDb();
    const data = await db.prepare(`
      SELECT d.id, d.name, d.is_active, d.created_at,
             COUNT(u.id) as user_count
      FROM departments d
      LEFT JOIN users u ON u.department_id = d.id AND u.is_active = 1
      WHERE d.is_active = 1
      GROUP BY d.id
      ORDER BY d.name ASC
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
    if (!isAtLeast(user.role, "yonetici")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    const parsed = departmentSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const { name } = parsed.data;
    const db = getDb();
    const now = nowIso();
    const id = uuidv4();
    await db.prepare("INSERT INTO departments (id, name, is_active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run(id, name.trim(), now, now);
    return NextResponse.json({ ok: true, data: { id } });
  } catch (e: any) {
    if (e?.message?.includes("UNIQUE")) return NextResponse.json({ ok: false, error: "Bu departman zaten kayıtlı" }, { status: 409 });
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
