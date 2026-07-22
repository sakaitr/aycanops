import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(user, "audit:read")) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = 50;
  const offset = (page - 1) * limit;
  const search = searchParams.get("q") || "";
  const entity = searchParams.get("entity") || "";
  const action = searchParams.get("action") || "";

  const db = getDb();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (search) {
    conditions.push("(a.action LIKE ? OR a.entity_type LIKE ? OR u.full_name LIKE ? OR a.entity_id LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (entity) {
    conditions.push("a.entity_type = ?");
    params.push(entity);
  }
  if (action) {
    conditions.push("a.action = ?");
    params.push(action);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await db
    .prepare(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.details_json, a.created_at,
              u.full_name as actor_name, u.username as actor_username, u.role as actor_role
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.actor_user_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as any[];

  const total = (
    (await db.prepare(`SELECT COUNT(*) as c FROM audit_log a LEFT JOIN users u ON u.id=a.actor_user_id ${where}`).get(...params)) as any
  ).c as number;

  // Get distinct entity types and actions for filter dropdowns
  const entityTypes = ((await db.prepare("SELECT DISTINCT entity_type FROM audit_log ORDER BY entity_type").all()) as any[]).map((r) => r.entity_type);
  const actions = ((await db.prepare("SELECT DISTINCT action FROM audit_log ORDER BY action").all()) as any[]).map((r) => r.action);

  return NextResponse.json({
    ok: true,
    data: rows.map((r) => ({
      ...r,
      details: r.details_json ? (() => { try { return JSON.parse(r.details_json); } catch { return null; } })() : null,
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
    entityTypes,
    actions,
  });
}
