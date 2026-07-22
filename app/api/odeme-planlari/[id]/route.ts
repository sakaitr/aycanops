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
    if (!hasPermission(user, "passengers:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const db = getDb();

    const existing = await db.prepare(`SELECT id FROM odeme_planlari WHERE id = ?`).get(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    await db.prepare(
      `UPDATE odeme_planlari SET plan_adi = ?, toplam_tutar = ?, taksit_sayisi = ?, aciklama = ?, is_active = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      body.plan_adi, body.toplam_tutar || null, body.taksit_sayisi || null,
      body.aciklama || null, body.is_active !== undefined ? (body.is_active ? 1 : 0) : 1,
      nowIso(), id,
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
    if (!hasPermission(user, "passengers:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    await db.prepare(`UPDATE odeme_planlari SET is_active = 0, updated_at = ? WHERE id = ?`).run(nowIso(), id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
