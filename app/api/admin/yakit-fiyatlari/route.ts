import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

const YAKIT_TURLERI = ["benzin", "motorin", "lpg", "elektrik"];

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "yakit_fiyatlari:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const yakit_turu = searchParams.get("yakit_turu") || "";
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (yakit_turu) { conditions.push("yf.yakit_turu = ?"); params.push(yakit_turu); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await getDb().prepare(
      `SELECT yf.*, u.full_name AS creator_name
       FROM yakit_fiyatlari yf
       LEFT JOIN users u ON u.id = yf.created_by
       ${where}
       ORDER BY yf.gecerlilik_tarihi DESC, yf.created_at DESC`
    ).all(...params);
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "yakit_fiyatlari:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    if (!YAKIT_TURLERI.includes(body.yakit_turu))
      return NextResponse.json({ ok: false, error: "Geçersiz yakıt türü" }, { status: 400 });
    if (!body.fiyat || Number(body.fiyat) <= 0)
      return NextResponse.json({ ok: false, error: "Geçerli bir fiyat girin" }, { status: 400 });
    if (!body.gecerlilik_tarihi)
      return NextResponse.json({ ok: false, error: "Geçerlilik tarihi zorunludur" }, { status: 400 });

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();
    await db.prepare(
      `INSERT INTO yakit_fiyatlari (id, yakit_turu, fiyat, gecerlilik_tarihi, created_by, created_at)
       VALUES (?,?,?,?,?,?)`
    ).run(id, body.yakit_turu, Number(body.fiyat), body.gecerlilik_tarihi, user.id, now);

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "yakit_fiyatlari:delete"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "id zorunludur" }, { status: 400 });

    await getDb().prepare(`DELETE FROM yakit_fiyatlari WHERE id = ?`).run(id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
