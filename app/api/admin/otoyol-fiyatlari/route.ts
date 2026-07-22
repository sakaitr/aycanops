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
    if (!hasPermission(user, "otoyol_fiyatlari:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const guzergah_adi = searchParams.get("guzergah_adi") || "";
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (guzergah_adi) { conditions.push("of.guzergah_adi LIKE ?"); params.push(`%${guzergah_adi}%`); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await getDb().prepare(
      `SELECT of.*, u.full_name AS creator_name
       FROM otoyol_kopru_fiyatlari of
       LEFT JOIN users u ON u.id = of.created_by
       ${where}
       ORDER BY of.gecerlilik_tarihi DESC, of.created_at DESC`
    ).all(...params);
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "otoyol_fiyatlari:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    if (!body.guzergah_adi?.trim()) return NextResponse.json({ ok: false, error: "Güzergah adı zorunludur" }, { status: 400 });
    if (!body.fiyat || Number(body.fiyat) <= 0)
      return NextResponse.json({ ok: false, error: "Geçerli bir fiyat girin" }, { status: 400 });
    if (!body.gecerlilik_tarihi)
      return NextResponse.json({ ok: false, error: "Geçerlilik tarihi zorunludur" }, { status: 400 });

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();
    await db.prepare(
      `INSERT INTO otoyol_kopru_fiyatlari (id, guzergah_adi, yon, fiyat, arac_sinifi, gecerlilik_tarihi, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(id, body.guzergah_adi.trim(), body.yon || "tek_yon", Number(body.fiyat), body.arac_sinifi || null, body.gecerlilik_tarihi, user.id, now);

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "otoyol_fiyatlari:delete"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "id zorunludur" }, { status: 400 });

    await getDb().prepare(`DELETE FROM otoyol_kopru_fiyatlari WHERE id = ?`).run(id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
