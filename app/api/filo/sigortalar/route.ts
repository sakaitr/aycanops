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
    if (!hasPermission(user, "fleet_insurances:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const vehicle_id = searchParams.get("vehicle_id") || "";
    const limit = Math.min(500, parseInt(searchParams.get("limit") || "100"));

    const db = getDb();
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (vehicle_id) { conditions.push("i.vehicle_id = ?"); params.push(vehicle_id); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await db.prepare(
      `SELECT i.*, v.plate,
              DATEDIFF(i.bitis_tarihi, CURDATE()) AS kalan_gun
       FROM vehicle_insurances i
       JOIN vehicles v ON v.id = i.vehicle_id
       ${where}
       ORDER BY i.bitis_tarihi ASC
       LIMIT ?`
    ).all(...params, limit);

    const totalsRow = await db.prepare(
      `SELECT COUNT(*) AS total
       FROM vehicle_insurances i
       JOIN vehicles v ON v.id = i.vehicle_id
       ${where}`
    ).get(...params) as { total: number };

    return NextResponse.json({ ok: true, data: rows, meta: { total: Number(totalsRow.total) } });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "fleet_insurances:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    if (!body.vehicle_id) return NextResponse.json({ ok: false, error: "Araç seçiniz" }, { status: 400 });
    if (!body.police_no?.trim()) return NextResponse.json({ ok: false, error: "Poliçe numarası zorunludur" }, { status: 400 });
    if (!body.sigorta_turu) return NextResponse.json({ ok: false, error: "Sigorta türü zorunludur" }, { status: 400 });
    if (!body.baslangic_tarihi || !body.bitis_tarihi)
      return NextResponse.json({ ok: false, error: "Başlangıç/bitiş tarihi zorunludur" }, { status: 400 });

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();

    await db.prepare(
      `INSERT INTO vehicle_insurances
         (id, vehicle_id, police_no, sigorta_turu, sigorta_firmasi, acente_no,
          baslangic_tarihi, bitis_tarihi, prim_tutari, aciklama, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id, body.vehicle_id, body.police_no.trim(), body.sigorta_turu,
      body.sigorta_firmasi || null, body.acente_no || null,
      body.baslangic_tarihi, body.bitis_tarihi, body.prim_tutari || null, body.aciklama || null,
      user.id, now, now,
    );

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
