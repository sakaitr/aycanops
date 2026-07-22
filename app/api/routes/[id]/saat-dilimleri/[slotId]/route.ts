import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; slotId: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "routes:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id, slotId } = await params;
    const body = await req.json();
    const db = getDb();

    const existing = await db.prepare(`SELECT id FROM route_time_slots WHERE id = ? AND route_id = ?`).get(slotId, id);
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    await db.prepare(
      `UPDATE route_time_slots SET ad = ?, giris_saati = ?, cikis_saati = ? WHERE id = ?`
    ).run(body.ad, body.giris_saati || null, body.cikis_saati || null, slotId);

    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; slotId: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "routes:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id, slotId } = await params;
    const db = getDb();
    await db.prepare(`UPDATE route_time_slots SET is_active = 0 WHERE id = ? AND route_id = ?`).run(slotId, id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
