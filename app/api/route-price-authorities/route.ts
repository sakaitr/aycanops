import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";
import { routePriceAuthorityUpdateSchema } from "@/lib/schemas";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "route_price_authorities:read")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const rows = await getDb().prepare(
      `SELECT u.id AS user_id, u.username, u.full_name, u.role, u.is_active,
              CASE WHEN u.username='admin' THEN 1 ELSE COALESCE(rpa.can_request, 0) END AS can_request,
              CASE WHEN u.username='admin' THEN 1 ELSE COALESCE(rpa.can_approve, 0) END AS can_approve,
              CASE WHEN u.username='admin' THEN 1 ELSE 0 END AS locked,
              rpa.updated_at
       FROM users u
       LEFT JOIN route_price_authorities rpa ON rpa.user_id = u.id
       WHERE u.is_active = 1
       ORDER BY CASE u.username WHEN 'admin' THEN 0 ELSE 1 END, u.full_name ASC`
    ).all();
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "route_price_authorities:update")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const parsed = routePriceAuthorityUpdateSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const data = parsed.data;
    const db = getDb();
    const target = await db.prepare("SELECT username FROM users WHERE id = ? LIMIT 1").get(data.user_id) as { username: string } | undefined;
    if (!target) return NextResponse.json({ ok: false, error: "Kullanıcı bulunamadı" }, { status: 404 });
    if (target.username === "admin") return NextResponse.json({ ok: false, error: "admin kullanıcısı kilitlidir" }, { status: 423 });
    const now = nowIso();
    await db.prepare(
      `INSERT INTO route_price_authorities (user_id, can_request, can_approve, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE can_request=VALUES(can_request), can_approve=VALUES(can_approve), updated_by=VALUES(updated_by), updated_at=VALUES(updated_at)`
    ).run(data.user_id, data.can_request ? 1 : 0, data.can_approve ? 1 : 0, user.id, now);
    await logAudit({ actorUserId: user.id, action: "route_price_authority.update", entityType: "route_price_authorities", entityId: data.user_id, details: data });
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
