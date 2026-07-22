import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "anketler:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    const anket = await db.prepare(`SELECT * FROM anketler WHERE id = ?`).get(id);
    if (!anket) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    let yanitlar: any[] = [];
    if (hasPermission(user, "anketler:create")) {
      yanitlar = await db.prepare(
        `SELECT ay.*, u.full_name AS yanit_veren_adi
         FROM anket_yanitlari ay
         LEFT JOIN users u ON u.id = ay.yanit_veren_id
         WHERE ay.anket_id = ?
         ORDER BY ay.created_at DESC`
      ).all(id);
    }

    return NextResponse.json({ ok: true, data: { ...anket, yanitlar } });
  } catch (e) { return apiError(e); }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "anketler:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const existing = await db.prepare(`SELECT id FROM anketler WHERE id = ?`).get(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    await db.prepare(`UPDATE anketler SET is_active = ? WHERE id = ?`)
      .run(body.is_active ? 1 : 0, id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "anketler:delete"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    await db.prepare(`DELETE FROM anket_yanitlari WHERE anket_id = ?`).run(id);
    await db.prepare(`DELETE FROM anketler WHERE id = ?`).run(id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
