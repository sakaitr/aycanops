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
    if (!hasPermission(user, "routes:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    const rows = await db.prepare(
      `SELECT * FROM route_time_slots WHERE route_id = ? AND is_active = 1 ORDER BY sort_order ASC, giris_saati ASC`
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
    if (!hasPermission(user, "routes:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const ad = (body.ad || "").trim();
    if (!ad) return NextResponse.json({ ok: false, error: "Vardiya adı zorunludur" }, { status: 400 });

    const db = getDb();
    const route = await db.prepare(`SELECT id FROM routes WHERE id = ?`).get(id);
    if (!route) return NextResponse.json({ ok: false, error: "Güzergah bulunamadı" }, { status: 404 });

    const countRow = await db.prepare(`SELECT COUNT(*) AS total FROM route_time_slots WHERE route_id = ? AND is_active = 1`).get<{ total: number }>(id);

    const slotId = uuidv4();
    const now = nowIso();
    await db.prepare(
      `INSERT INTO route_time_slots (id, route_id, ad, giris_saati, cikis_saati, sort_order, is_active, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(
      slotId, id, ad, body.giris_saati || null, body.cikis_saati || null,
      countRow?.total ?? 0, 1, user.id, now,
    );

    return NextResponse.json({ ok: true, data: { id: slotId } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
