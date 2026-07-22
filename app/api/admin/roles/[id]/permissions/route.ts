import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { loadPermissionsCache } from "@/lib/permissions-loader";
import { apiError } from "@/lib/api-error";

const ALL_KEYS = new Set(
  Object.entries(PERMISSIONS).flatMap(([resource, actions]) => actions.map((a) => `${resource}:${a}`))
);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "users:permissions"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    const role = await db.prepare("SELECT name FROM roles WHERE id = ?").get(id) as { name: string } | undefined;
    if (!role) return NextResponse.json({ ok: false, error: "Rol bulunamadı" }, { status: 404 });

    const rows = await db.prepare("SELECT permission_key FROM role_permissions WHERE role_name = ?").all(role.name) as { permission_key: string }[];
    return NextResponse.json({ ok: true, data: rows.map((r) => r.permission_key) });
  } catch (e) { return apiError(e); }
}

// PUT: rolün tüm izin setini gönderilen listeyle değiştirir (tam replace)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "users:permissions"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const keys: string[] = Array.isArray(body.permissions) ? body.permissions : [];
    const invalid = keys.filter((k) => !ALL_KEYS.has(k));
    if (invalid.length > 0) {
      return NextResponse.json({ ok: false, error: `Geçersiz izin anahtarı: ${invalid.join(", ")}` }, { status: 400 });
    }

    const db = getDb();
    const role = await db.prepare("SELECT name FROM roles WHERE id = ?").get(id) as { name: string } | undefined;
    if (!role) return NextResponse.json({ ok: false, error: "Rol bulunamadı" }, { status: 404 });

    await db.prepare("DELETE FROM role_permissions WHERE role_name = ?").run(role.name);
    for (const key of keys) {
      await db.prepare("INSERT IGNORE INTO role_permissions (role_name, permission_key) VALUES (?, ?)").run(role.name, key);
    }

    await loadPermissionsCache();
    return NextResponse.json({ ok: true, data: keys });
  } catch (e) { return apiError(e); }
}
