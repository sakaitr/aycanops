import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "fleet_penalties:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const now = nowIso();

    const existing = await db.prepare(`SELECT id FROM vehicle_penalties WHERE id = ?`).get(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    // Hızlı "ödendi" işaretleme
    if (body.action === "toggle-odendi") {
      await db.prepare(`UPDATE vehicle_penalties SET odendi = ?, updated_at = ? WHERE id = ?`)
        .run(body.odendi ? 1 : 0, now, id);
      return NextResponse.json({ ok: true });
    }

    await db.prepare(
      `UPDATE vehicle_penalties SET
         driver_id = ?, ceza_tarihi = ?, referans_no = ?, belge_no = ?,
         ceza_puani = ?, ceza_tutari = ?, ceza_turu = ?, odendi = ?, aciklama = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      body.driver_id || null, body.ceza_tarihi, body.referans_no || null, body.belge_no || null,
      body.ceza_puani || null, body.ceza_tutari || null, body.ceza_turu || null,
      body.odendi ? 1 : 0, body.aciklama || null, now, id,
    );

    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "fleet_penalties:delete"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    await db.prepare(`DELETE FROM vehicle_penalties WHERE id = ?`).run(id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
