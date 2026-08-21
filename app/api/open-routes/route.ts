import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "routes:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // 'open' | 'closed' | null (all)

    const db = getDb();
    let sql = `
      SELECT or2.*, c.name AS company_name, r.name AS route_name, v.plate AS vehicle_plate, u.full_name AS creator_name
      FROM open_routes or2
      LEFT JOIN companies c ON c.id = or2.company_id
      LEFT JOIN routes r ON r.id = or2.route_id
      LEFT JOIN vehicles v ON v.id = or2.vehicle_id
      LEFT JOIN users u ON u.id = or2.created_by
    `;
    const params: string[] = [];
    if (status) {
      sql += " WHERE or2.status = ?";
      params.push(status);
    }
    sql += " ORDER BY or2.created_at DESC";

    const rows = await db.prepare(sql).all(...params);
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "routes:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await request.json();
    const { company_id, route_id, vehicle_id, vehicle_assignment_status, plate_note, name, distance_km, duration_min, price, notes, calisma_gun_sayisi, giris_saati, cikis_saati } = body;

    if (!company_id || !name?.trim()) {
      return NextResponse.json({ ok: false, error: "Firma ve güzergah adı zorunludur" }, { status: 400 });
    }

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();

    await db.prepare(`
      INSERT INTO open_routes (id, company_id, route_id, supplier_id, vehicle_id, vehicle_assignment_status, name, distance_km, duration_min, calisma_gun_sayisi, giris_saati, cikis_saati, price, plate_note, notes, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
    `).run(
      id, company_id, route_id || null, null, vehicle_id || null, vehicle_assignment_status || "searching", name.trim(),
      distance_km || null, duration_min || null, calisma_gun_sayisi || null, giris_saati || null, cikis_saati || null,
      price || null, plate_note || null, notes || null,
      user.id, now, now
    );

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
