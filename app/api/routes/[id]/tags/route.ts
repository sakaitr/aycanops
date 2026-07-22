import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "routes:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    const rows = await db.prepare(
      `SELECT rt.id, rt.name, rt.color
       FROM route_tag_links rtl
       JOIN route_tags rt ON rt.id = rtl.tag_id
       WHERE rtl.route_id = ?
       ORDER BY rt.name ASC`
    ).all(id);

    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "routes:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    if (!body.tag_id) return NextResponse.json({ ok: false, error: "tag_id zorunludur" }, { status: 400 });

    const db = getDb();
    await db.prepare(
      `INSERT IGNORE INTO route_tag_links (id, route_id, tag_id, created_at) VALUES (?,?,?,?)`
    ).run(uuidv4(), id, body.tag_id, nowIso());

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) { return apiError(e); }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "routes:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const tagId = searchParams.get("tag_id");
    if (!tagId) return NextResponse.json({ ok: false, error: "tag_id zorunludur" }, { status: 400 });

    const db = getDb();
    await db.prepare(`DELETE FROM route_tag_links WHERE route_id = ? AND tag_id = ?`).run(id, tagId);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
