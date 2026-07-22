import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { loadPermissionsCache } from "@/lib/permissions-loader";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "users:permissions"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const db = getDb();
    const roles = await db.prepare(
      `SELECT r.id, r.name, r.label, r.hierarchy_level, r.is_system,
              (SELECT COUNT(*) FROM role_permissions rp WHERE rp.role_name = r.name) AS permission_count,
              (SELECT COUNT(*) FROM users u WHERE u.role = r.name) AS user_count
       FROM roles r ORDER BY r.hierarchy_level ASC, r.label ASC`
    ).all();

    return NextResponse.json({ ok: true, data: roles, catalog: PERMISSIONS });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "users:permissions"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    const name = String(body.name || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    const label = String(body.label || "").trim();
    const hierarchy_level = Number.isFinite(body.hierarchy_level) ? Number(body.hierarchy_level) : 0;

    if (!name) return NextResponse.json({ ok: false, error: "Rol adı zorunlu" }, { status: 400 });
    if (!label) return NextResponse.json({ ok: false, error: "Görünen ad zorunlu" }, { status: 400 });

    const db = getDb();
    const existing = await db.prepare("SELECT id FROM roles WHERE name = ?").get(name);
    if (existing) return NextResponse.json({ ok: false, error: "Bu rol adı zaten kullanılıyor" }, { status: 409 });

    const id = uuidv4();
    const now = nowIso();
    await db.prepare(
      "INSERT INTO roles (id, name, label, hierarchy_level, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)"
    ).run(id, name, label, hierarchy_level, now, now);

    // İsteğe bağlı: başka bir rolden izin kopyala (clone_from)
    if (body.clone_from) {
      const source = await db.prepare("SELECT permission_key FROM role_permissions WHERE role_name = ?").all(body.clone_from) as { permission_key: string }[];
      for (const row of source) {
        await db.prepare("INSERT IGNORE INTO role_permissions (role_name, permission_key) VALUES (?, ?)").run(name, row.permission_key);
      }
    }

    await loadPermissionsCache();
    return NextResponse.json({ ok: true, data: { id, name } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
