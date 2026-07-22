import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "routes:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const company_id = searchParams.get("company_id") || "";

    const db = getDb();
    // Firmaya özel taglar + genel (company_id NULL) taglar birlikte gelir
    const rows = company_id
      ? await db.prepare(`SELECT * FROM route_tags WHERE company_id = ? OR company_id IS NULL ORDER BY name ASC`).all(company_id)
      : await db.prepare(`SELECT * FROM route_tags ORDER BY name ASC`).all();

    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "routes:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const name = (body.name || "").trim();
    if (!name) return NextResponse.json({ ok: false, error: "Tag adı zorunludur" }, { status: 400 });

    const db = getDb();

    // Aynı isimli tag zaten varsa onu döndür (create-or-get)
    const existing = await db.prepare(
      `SELECT id FROM route_tags WHERE name = ? AND (company_id <=> ?)`
    ).get<{ id: string }>(name, body.company_id || null);
    if (existing) return NextResponse.json({ ok: true, data: { id: existing.id } });

    const id = uuidv4();
    const now = nowIso();
    await db.prepare(
      `INSERT INTO route_tags (id, company_id, name, color, created_by, created_at) VALUES (?,?,?,?,?,?)`
    ).run(id, body.company_id || null, name, body.color || null, user.id, now);

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
