import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_kategori_grubu:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const db = getDb();
    const rows = await db.prepare(
      `SELECT g.*,
              (SELECT COUNT(*) FROM finans_kategori_grup_uyelik u WHERE u.grup_id = g.id) AS kategori_sayisi,
              (SELECT COUNT(*) FROM finans_kategori_grup_kullanici k WHERE k.grup_id = g.id) AS kullanici_sayisi
       FROM finans_kategori_grubu g ORDER BY g.ad ASC`
    ).all();
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_kategori_grubu:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { ad } = await req.json();
    if (!ad?.trim()) return NextResponse.json({ ok: false, error: "Grup adı zorunlu" }, { status: 400 });

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();
    await db.prepare(
      "INSERT INTO finans_kategori_grubu (id, ad, created_at, updated_at) VALUES (?, ?, ?, ?)"
    ).run(id, ad.trim(), now, now);

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
