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
    if (!hasPermission(user, "fuel_cards:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const now = nowIso();

    const existing = await db.prepare(`SELECT id FROM yakit_kartlari WHERE id = ?`).get(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    if (body.action === "durum-degistir") {
      await db.prepare(`UPDATE yakit_kartlari SET is_active = ?, updated_at = ? WHERE id = ?`)
        .run(body.is_active ? 1 : 0, now, id);
      return NextResponse.json({ ok: true });
    }

    if (!body.kart_no?.trim()) return NextResponse.json({ ok: false, error: "Kart no zorunludur" }, { status: 400 });
    const dup = await db.prepare("SELECT id FROM yakit_kartlari WHERE kart_no = ? AND id != ?").get(body.kart_no.trim(), id);
    if (dup) return NextResponse.json({ ok: false, error: "Bu kart no başka bir kartta kayıtlı" }, { status: 409 });

    await db.prepare(
      `UPDATE yakit_kartlari SET
         kart_no = ?, firma = ?, vehicle_id = ?, isleten_id = ?, limit_turu = ?, limit_degeri = ?,
         kart_tipi = ?, notlar = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      body.kart_no.trim(), body.firma || "Diger", body.vehicle_id || null, body.isleten_id || null,
      body.limit_turu || "sinirsiz", body.limit_degeri || null, body.kart_tipi || "normal", body.notlar || null, now, id,
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
    if (!hasPermission(user, "fuel_cards:delete"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    await db.prepare(`DELETE FROM yakit_kartlari WHERE id = ?`).run(id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
