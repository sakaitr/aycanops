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
    if (!hasPermission(user, "arac_gruplari:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const is_active = searchParams.get("is_active");
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (is_active !== null && is_active !== "") { conditions.push("is_active = ?"); params.push(is_active === "1" ? 1 : 0); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await getDb().prepare(
      `SELECT * FROM arac_gruplari ${where} ORDER BY grup_adi ASC`
    ).all(...params);
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "arac_gruplari:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    if (!body.grup_adi?.trim()) return NextResponse.json({ ok: false, error: "Grup adı zorunludur" }, { status: 400 });

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();
    await db.prepare(
      `INSERT INTO arac_gruplari (id, grup_adi, aciklama, is_active, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?)`
    ).run(id, body.grup_adi.trim(), body.aciklama || null, 1, user.id, now, now);

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
