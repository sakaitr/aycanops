import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "fleet_tires:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const vehicle_id = searchParams.get("vehicle_id") || "";
    const limit = Math.min(500, parseInt(searchParams.get("limit") || "100"));

    const db = getDb();
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (vehicle_id) { conditions.push("t.vehicle_id = ?"); params.push(vehicle_id); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await db.prepare(
      `SELECT t.*, v.plate
       FROM vehicle_tires t
       JOIN vehicles v ON v.id = t.vehicle_id
       ${where}
       ORDER BY t.degisim_tarihi DESC
       LIMIT ?`
    ).all(...params, limit);

    const totalsRow = await db.prepare(
      `SELECT COUNT(*) AS total, COALESCE(SUM(t.tutar), 0) AS total_amount
       FROM vehicle_tires t
       JOIN vehicles v ON v.id = t.vehicle_id
       ${where}`
    ).get(...params) as { total: number; total_amount: number };

    return NextResponse.json({
      ok: true,
      data: rows,
      meta: { total: Number(totalsRow.total), total_amount: Number(totalsRow.total_amount) },
    });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "fleet_tires:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    if (!body.vehicle_id) return NextResponse.json({ ok: false, error: "Araç seçiniz" }, { status: 400 });
    if (!body.degisim_tarihi) return NextResponse.json({ ok: false, error: "Değişim tarihi zorunludur" }, { status: 400 });

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();

    const adet = parseInt(body.adet || "4");
    const birimFiyat = parseFloat(body.birim_fiyat || "0");
    const tutar = Math.round(adet * birimFiyat * 100) / 100;

    await db.prepare(
      `INSERT INTO vehicle_tires
         (id, vehicle_id, degisim_tarihi, arac_km, lastik_turu, lastik_ebadi,
          adet, birim_fiyat, tutar, aciklama, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id, body.vehicle_id, body.degisim_tarihi, body.arac_km || null,
      body.lastik_turu || null, body.lastik_ebadi || null,
      adet, birimFiyat || null, tutar, body.aciklama || null,
      user.id, now,
    );

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
