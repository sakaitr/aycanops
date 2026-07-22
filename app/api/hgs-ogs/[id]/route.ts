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
    if (!hasPermission(user, "hgs_ogs:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const now = nowIso();

    const existing = await db.prepare(`SELECT id FROM hgs_ogs WHERE id = ?`).get(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    if (body.action === "durum-degistir") {
      await db.prepare(`UPDATE hgs_ogs SET is_active = ?, updated_at = ? WHERE id = ?`)
        .run(body.is_active ? 1 : 0, now, id);
      return NextResponse.json({ ok: true });
    }

    if (!body.etiket_no?.trim()) return NextResponse.json({ ok: false, error: "Etiket no zorunludur" }, { status: 400 });

    await db.prepare(
      `UPDATE hgs_ogs SET
         cinsi = ?, musteri_no = ?, vehicle_id = ?, isleten_id = ?, etiket_no = ?, banka = ?,
         bakiye = ?, hesap_acilis_tarihi = ?, notlar = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      body.cinsi || "HGS", body.musteri_no || null, body.vehicle_id || null, body.isleten_id || null,
      body.etiket_no.trim(), body.banka || null, body.bakiye || 0, body.hesap_acilis_tarihi || null, body.notlar || null, now, id,
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
    if (!hasPermission(user, "hgs_ogs:delete"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    await db.prepare(`DELETE FROM hgs_ogs WHERE id = ?`).run(id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
