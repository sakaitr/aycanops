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
    if (!hasPermission(user, "fleet_insurances:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const now = nowIso();

    const existing = await db.prepare(`SELECT id FROM vehicle_insurances WHERE id = ?`).get(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    await db.prepare(
      `UPDATE vehicle_insurances SET
         police_no = ?, sigorta_turu = ?, sigorta_firmasi = ?, acente_no = ?,
         baslangic_tarihi = ?, bitis_tarihi = ?, prim_tutari = ?, aciklama = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      body.police_no, body.sigorta_turu, body.sigorta_firmasi || null, body.acente_no || null,
      body.baslangic_tarihi, body.bitis_tarihi, body.prim_tutari || null, body.aciklama || null, now, id,
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
    if (!hasPermission(user, "fleet_insurances:delete"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    await db.prepare(`DELETE FROM vehicle_insurances WHERE id = ?`).run(id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
