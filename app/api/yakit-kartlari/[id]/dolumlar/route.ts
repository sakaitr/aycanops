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
    if (!hasPermission(user, "fuel_cards:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    const rows = await db.prepare(
      `SELECT * FROM yakit_dolumlar WHERE kart_id = ? ORDER BY dolum_tarihi DESC`
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
    if (!hasPermission(user, "fuel_cards:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    if (!body.dolum_tarihi) return NextResponse.json({ ok: false, error: "Dolum tarihi zorunludur" }, { status: 400 });

    const db = getDb();
    const kart = await db.prepare("SELECT id FROM yakit_kartlari WHERE id = ?").get(id);
    if (!kart) return NextResponse.json({ ok: false, error: "Kart bulunamadı" }, { status: 404 });

    const rowId = uuidv4();
    const now = nowIso();
    const miktar = body.miktar_litre ? Number(body.miktar_litre) : null;
    const birimFiyat = body.birim_fiyat ? Number(body.birim_fiyat) : null;
    const tutar = body.tutar ? Number(body.tutar) : (miktar && birimFiyat ? Math.round(miktar * birimFiyat * 100) / 100 : null);

    await db.prepare(
      `INSERT INTO yakit_dolumlar
         (id, kart_id, dolum_tarihi, dolum_yeri, miktar_litre, onceki_km, son_km, birim_fiyat, tutar, notlar, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      rowId, id, body.dolum_tarihi, body.dolum_yeri || null, miktar, body.onceki_km || null, body.son_km || null,
      birimFiyat, tutar, body.notlar || null, user.id, now,
    );

    return NextResponse.json({ ok: true, data: { id: rowId } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
