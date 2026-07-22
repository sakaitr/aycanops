import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { loadPermissionsCache } from "@/lib/permissions-loader";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "users:permissions"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const db = getDb();

    const role = await db.prepare("SELECT * FROM roles WHERE id = ?").get(id) as { name: string; is_system: number } | undefined;
    if (!role) return NextResponse.json({ ok: false, error: "Rol bulunamadı" }, { status: 404 });

    const label = body.label !== undefined ? String(body.label).trim() : undefined;
    const hierarchy_level = body.hierarchy_level !== undefined && Number.isFinite(body.hierarchy_level) ? Number(body.hierarchy_level) : undefined;

    if (label === "") return NextResponse.json({ ok: false, error: "Görünen ad boş olamaz" }, { status: 400 });

    const now = nowIso();
    await db.prepare(
      "UPDATE roles SET label = COALESCE(?, label), hierarchy_level = COALESCE(?, hierarchy_level), updated_at = ? WHERE id = ?"
    ).run(label ?? null, hierarchy_level ?? null, now, id);

    await loadPermissionsCache();
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "users:permissions"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();

    const role = await db.prepare("SELECT name, is_system FROM roles WHERE id = ?").get(id) as { name: string; is_system: number } | undefined;
    if (!role) return NextResponse.json({ ok: false, error: "Rol bulunamadı" }, { status: 404 });
    if (role.is_system) return NextResponse.json({ ok: false, error: "Sistem rolleri silinemez" }, { status: 400 });

    const userCount = await db.prepare("SELECT COUNT(*) AS total FROM users WHERE role = ?").get(role.name) as { total: number };
    if (Number(userCount.total) > 0) {
      return NextResponse.json({ ok: false, error: "Bu role atanmış kullanıcılar var, önce onları başka role taşıyın" }, { status: 400 });
    }

    await db.prepare("DELETE FROM role_permissions WHERE role_name = ?").run(role.name);
    await db.prepare("DELETE FROM roles WHERE id = ?").run(id);

    await loadPermissionsCache();
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
