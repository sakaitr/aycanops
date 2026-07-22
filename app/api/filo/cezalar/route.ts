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
    if (!hasPermission(user, "fleet_penalties:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const vehicle_id = searchParams.get("vehicle_id") || "";
    const odendi = searchParams.get("odendi") || "";
    const limit = Math.min(500, parseInt(searchParams.get("limit") || "100"));

    const db = getDb();
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (vehicle_id) { conditions.push("p.vehicle_id = ?"); params.push(vehicle_id); }
    if (odendi !== "") { conditions.push("p.odendi = ?"); params.push(odendi === "1" ? 1 : 0); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await db.prepare(
      `SELECT p.*, v.plate, d.name AS driver_name
       FROM vehicle_penalties p
       JOIN vehicles v ON v.id = p.vehicle_id
       LEFT JOIN drivers d ON d.id = p.driver_id
       ${where}
       ORDER BY p.ceza_tarihi DESC
       LIMIT ?`
    ).all(...params, limit);

    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "fleet_penalties:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    if (!body.vehicle_id) return NextResponse.json({ ok: false, error: "Araç seçiniz" }, { status: 400 });
    if (!body.ceza_tarihi) return NextResponse.json({ ok: false, error: "Ceza tarihi zorunludur" }, { status: 400 });

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();

    await db.prepare(
      `INSERT INTO vehicle_penalties
         (id, vehicle_id, driver_id, ceza_tarihi, referans_no, belge_no,
          ceza_puani, ceza_tutari, ceza_turu, odendi, aciklama, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id, body.vehicle_id, body.driver_id || null, body.ceza_tarihi,
      body.referans_no || null, body.belge_no || null,
      body.ceza_puani || null, body.ceza_tutari || null, body.ceza_turu || null,
      body.odendi ? 1 : 0, body.aciklama || null,
      user.id, now, now,
    );

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
