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
    if (!hasPermission(user, "anketler:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const is_active = searchParams.get("is_active");
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (is_active !== null && is_active !== "") { conditions.push("a.is_active = ?"); params.push(is_active === "1" ? 1 : 0); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await getDb().prepare(
      `SELECT a.*, u.full_name AS creator_name,
              (SELECT COUNT(*) FROM anket_yanitlari ay WHERE ay.anket_id = a.id) AS yanit_sayisi,
              (SELECT COUNT(*) FROM anket_yanitlari ay WHERE ay.anket_id = a.id AND ay.yanit_veren_id = ?) AS ben_yanitladim
       FROM anketler a
       LEFT JOIN users u ON u.id = a.created_by
       ${where}
       ORDER BY a.baslangic_tarihi DESC, a.created_at DESC`
    ).all(user.id, ...params);
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "anketler:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    if (!body.baslik?.trim()) return NextResponse.json({ ok: false, error: "Başlık zorunludur" }, { status: 400 });
    const sorular: string[] = Array.isArray(body.sorular) ? body.sorular.map((s: string) => s.trim()).filter(Boolean) : [];
    if (sorular.length === 0) return NextResponse.json({ ok: false, error: "En az bir soru ekleyin" }, { status: 400 });
    if (!body.baslangic_tarihi || !body.bitis_tarihi)
      return NextResponse.json({ ok: false, error: "Başlangıç/bitiş tarihi zorunludur" }, { status: 400 });
    if (body.bitis_tarihi < body.baslangic_tarihi)
      return NextResponse.json({ ok: false, error: "Bitiş tarihi başlangıçtan önce olamaz" }, { status: 400 });

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();
    await db.prepare(
      `INSERT INTO anketler (id, baslik, sorular, hedef_grup, baslangic_tarihi, bitis_tarihi, is_active, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(id, body.baslik.trim(), JSON.stringify(sorular), body.hedef_grup || null, body.baslangic_tarihi, body.bitis_tarihi, 1, user.id, now);

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
