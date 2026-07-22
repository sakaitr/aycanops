import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "anketler:respond"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    const anket = await db.prepare(`SELECT * FROM anketler WHERE id = ?`).get<any>(id);
    if (!anket) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });
    if (!anket.is_active) return NextResponse.json({ ok: false, error: "Bu anket artık aktif değil" }, { status: 400 });

    const existing = await db.prepare(
      `SELECT id FROM anket_yanitlari WHERE anket_id = ? AND yanit_veren_id = ?`
    ).get(id, user.id);
    if (existing) return NextResponse.json({ ok: false, error: "Bu anketi zaten yanıtladınız" }, { status: 409 });

    const body = await req.json();
    const sorular: string[] = JSON.parse(anket.sorular);
    const yanitlar: string[] = Array.isArray(body.yanitlar) ? body.yanitlar : [];
    if (yanitlar.length !== sorular.length)
      return NextResponse.json({ ok: false, error: "Tüm sorular yanıtlanmalı" }, { status: 400 });

    const yanitId = uuidv4();
    const now = nowIso();
    await db.prepare(
      `INSERT INTO anket_yanitlari (id, anket_id, yanit_veren_id, yanitlar, created_at) VALUES (?,?,?,?,?)`
    ).run(yanitId, id, user.id, JSON.stringify(yanitlar), now);

    return NextResponse.json({ ok: true, data: { id: yanitId } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
