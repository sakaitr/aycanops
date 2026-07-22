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
    if (!hasPermission(user, "fleet_breakdowns:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const vehicle_id = searchParams.get("vehicle_id") || "";
    const durum = searchParams.get("durum") || "";
    const limit = Math.min(500, parseInt(searchParams.get("limit") || "100"));

    const db = getDb();
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (vehicle_id) { conditions.push("b.vehicle_id = ?"); params.push(vehicle_id); }
    if (durum) { conditions.push("b.durum = ?"); params.push(durum); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await db.prepare(
      `SELECT b.*, v.plate, d.name AS driver_name
       FROM vehicle_breakdowns b
       JOIN vehicles v ON v.id = b.vehicle_id
       LEFT JOIN drivers d ON d.id = b.driver_id
       ${where}
       ORDER BY b.ariza_tarihi DESC
       LIMIT ?`
    ).all(...params, limit);

    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "fleet_breakdowns:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    if (!body.vehicle_id) return NextResponse.json({ ok: false, error: "Araç seçiniz" }, { status: 400 });
    if (!body.ariza_tarihi) return NextResponse.json({ ok: false, error: "Arıza tarihi zorunludur" }, { status: 400 });

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();

    await db.prepare(
      `INSERT INTO vehicle_breakdowns
         (id, vehicle_id, driver_id, ariza_tarihi, arac_km, ariza_detay,
          bildiren_kisi, bildiren_gorevi, vardiya_amiri, durum, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id, body.vehicle_id, body.driver_id || null, body.ariza_tarihi,
      body.arac_km || null, body.ariza_detay || null,
      body.bildiren_kisi || null, body.bildiren_gorevi || null, body.vardiya_amiri || null,
      "bekliyor", user.id, now, now,
    );

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
