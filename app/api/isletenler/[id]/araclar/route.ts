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
    if (!hasPermission(user, "isleten:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();

    const rows = await db.prepare(
      `SELECT ai.*,
              v.plate, v.brand, v.model, v.year,
              v.status_code AS vehicle_status
       FROM arac_isleten ai
       JOIN vehicles v ON v.id = ai.vehicle_id
       WHERE ai.isleten_id = ?
       ORDER BY ai.bitis_tarihi IS NULL DESC, ai.baslangic_tarihi DESC`
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
    if (!hasPermission(user, "isleten:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();

    if (!body.vehicle_id) return NextResponse.json({ ok: false, error: "Araç seçiniz" }, { status: 400 });
    if (!body.baslangic_tarihi) return NextResponse.json({ ok: false, error: "Başlangıç tarihi zorunludur" }, { status: 400 });

    const db = getDb();

    // Close any existing open assignment for this vehicle
    const now = nowIso();
    await db.prepare(
      `UPDATE arac_isleten SET bitis_tarihi = ?, islem_turu = 'devir'
       WHERE vehicle_id = ? AND bitis_tarihi IS NULL`
    ).run(body.baslangic_tarihi, body.vehicle_id);

    const rowId = uuidv4();
    await db.prepare(
      `INSERT INTO arac_isleten
         (id, vehicle_id, isleten_id, baslangic_tarihi, bitis_tarihi, islem_turu, aciklama, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(
      rowId, body.vehicle_id, id,
      body.baslangic_tarihi,
      body.bitis_tarihi || null,
      body.islem_turu || "atama",
      body.aciklama || null,
      user.id, now,
    );

    return NextResponse.json({ ok: true, data: { id: rowId } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
