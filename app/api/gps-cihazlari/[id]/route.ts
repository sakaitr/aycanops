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
    if (!hasPermission(user, "gps_devices:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const now = nowIso();

    const existing = await db.prepare(`SELECT id FROM gps_cihazlari WHERE id = ?`).get(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    if (body.action === "durum-degistir") {
      await db.prepare(`UPDATE gps_cihazlari SET is_active = ?, updated_at = ? WHERE id = ?`)
        .run(body.is_active ? 1 : 0, now, id);
      return NextResponse.json({ ok: true });
    }

    if (!body.imei?.trim()) return NextResponse.json({ ok: false, error: "IMEI zorunludur" }, { status: 400 });
    const dup = await db.prepare("SELECT id FROM gps_cihazlari WHERE imei = ? AND id != ?").get(body.imei.trim(), id);
    if (dup) return NextResponse.json({ ok: false, error: "Bu IMEI başka bir cihazda kayıtlı" }, { status: 409 });

    await db.prepare(
      `UPDATE gps_cihazlari SET
         gps_saglayici = ?, gps_id = ?, gsm_no = ?, imei = ?, vehicle_id = ?,
         atama_tarihi = ?, atama_turu = ?, notlar = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      body.gps_saglayici || null, body.gps_id || null, body.gsm_no || null, body.imei.trim(),
      body.vehicle_id || null, body.atama_tarihi || null, body.atama_turu || "kalici", body.notlar || null, now, id,
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
    if (!hasPermission(user, "gps_devices:delete"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    await db.prepare(`DELETE FROM gps_cihazlari WHERE id = ?`).run(id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
