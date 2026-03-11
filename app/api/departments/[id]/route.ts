import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isAtLeast } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { departmentSchema } from "@/lib/schemas";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!isAtLeast(user.role, "yonetici")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const parsed = departmentSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const { name } = parsed.data;

    const db = getDb();
    const existing = await db.prepare("SELECT id FROM departments WHERE id = ?").get(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Departman bulunamadı" }, { status: 404 });

    await db.prepare("UPDATE departments SET name = ?, updated_at = ? WHERE id = ?").run(name.trim(), nowIso(), id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message?.includes("UNIQUE")) return NextResponse.json({ ok: false, error: "Bu departman adı zaten mevcut" }, { status: 409 });
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (user.role !== "admin") return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    const existing = await db.prepare("SELECT id FROM departments WHERE id = ?").get(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Departman bulunamadı" }, { status: 404 });

    const userCount = (await db.prepare("SELECT COUNT(*) as n FROM users WHERE department_id = ? AND is_active = 1").get(id) as any).n;
    if (userCount > 0) return NextResponse.json({ ok: false, error: `Bu departmanda ${userCount} aktif kullanıcı var. Önce kullanıcıları taşıyın.` }, { status: 409 });

    await db.prepare("UPDATE departments SET is_active = 0, updated_at = ? WHERE id = ?").run(nowIso(), id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
