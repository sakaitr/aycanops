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
    if (!hasPermission(user, "passengers:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();

    const rows = await db.prepare(
      `SELECT sd.*, ro.name AS orijinal_route_name, rg.name AS gecici_route_name
       FROM servis_degisiklikleri sd
       LEFT JOIN routes ro ON ro.id = sd.orijinal_route_id
       LEFT JOIN routes rg ON rg.id = sd.gecici_route_id
       WHERE sd.passenger_id = ?
       ORDER BY sd.baslangic_tarihi DESC`
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
    if (!hasPermission(user, "passengers:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    if (!body.baslangic_tarihi) return NextResponse.json({ ok: false, error: "Başlangıç tarihi zorunludur" }, { status: 400 });
    if (!body.gecici_route_id) return NextResponse.json({ ok: false, error: "Geçici güzergah seçiniz" }, { status: 400 });

    const db = getDb();
    const passenger = await db.prepare(`SELECT id, route_id FROM passengers WHERE id = ?`).get<{ id: string; route_id: string | null }>(id);
    if (!passenger) return NextResponse.json({ ok: false, error: "Yolcu bulunamadı" }, { status: 404 });

    const rowId = uuidv4();
    const now = nowIso();

    await db.prepare(
      `INSERT INTO servis_degisiklikleri
         (id, passenger_id, orijinal_route_id, gecici_route_id, baslangic_tarihi, bitis_tarihi, yon, aciklama, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(
      rowId, id, body.orijinal_route_id || passenger.route_id || null, body.gecici_route_id,
      body.baslangic_tarihi, body.bitis_tarihi || null, body.yon || "her_iki", body.aciklama || null,
      user.id, now,
    );

    return NextResponse.json({ ok: true, data: { id: rowId } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
