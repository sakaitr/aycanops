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
    if (!hasPermission(user, "fleet_accidents:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const now = nowIso();

    const existing = await db.prepare(`SELECT id FROM vehicle_accidents WHERE id = ?`).get(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    if (body.action === "durum-degistir") {
      await db.prepare(`UPDATE vehicle_accidents SET durum = ?, updated_at = ? WHERE id = ?`)
        .run(body.durum, now, id);
      return NextResponse.json({ ok: true });
    }

    await db.prepare(
      `UPDATE vehicle_accidents SET
         driver_id = ?, tarih = ?, arac_km = ?, kaza_turu = ?, kaza_sekli = ?,
         belge_no = ?, kusur_orani = ?, aciklama = ?, durum = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      body.driver_id || null, body.tarih, body.arac_km || null, body.kaza_turu || null, body.kaza_sekli || null,
      body.belge_no || null, body.kusur_orani || null, body.aciklama || null, body.durum || "aktif", now, id,
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
    if (!hasPermission(user, "fleet_accidents:delete"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    await db.prepare(`DELETE FROM vehicle_accidents WHERE id = ?`).run(id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
