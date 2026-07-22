import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { vehicleCreateSchema } from "@/lib/schemas";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "vehicles:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(9999, Math.max(1, parseInt(searchParams.get("limit") || "100")));
    const offset = (page - 1) * limit;
    const db = getDb();

    const countRow = await db.prepare("SELECT COUNT(*) as total FROM vehicles").get() as { total: number };
    const total = countRow.total;

    const data = await db.prepare(
      `SELECT v.*, u.full_name as creator_name FROM vehicles v
       LEFT JOIN users u ON u.id = v.created_by
       ORDER BY v.plate ASC LIMIT ? OFFSET ?`
    ).all(limit, offset) as any[];

    const plates = data.map((v: any) => v.plate);
    const vehicleIds = data.map((v: any) => v.id);
    let assignments: any[] = [];
    if (plates.length > 0) {
      assignments = await db.prepare(
        `SELECT cv.plate, c.id AS company_id, c.name AS company_name, cv.driver_name AS cv_driver_name
         FROM company_vehicles cv
         JOIN companies c ON c.id = cv.company_id
         WHERE cv.is_active = 1 AND cv.plate IN (${plates.map(() => "?").join(",")})
         ORDER BY c.name ASC`
      ).all(...plates) as any[];
    }

    // Min document expiry per vehicle
    const expiryMap: Record<string, string | null> = {};
    if (vehicleIds.length > 0) {
      const expiries = await db.prepare(
        `SELECT vehicle_id, MIN(expiry_date) as min_expiry FROM vehicle_documents
         WHERE vehicle_id IN (${vehicleIds.map(() => "?").join(",")}) AND expiry_date IS NOT NULL
         GROUP BY vehicle_id`
      ).all(...vehicleIds) as any[];
      for (const e of expiries) { expiryMap[e.vehicle_id] = e.min_expiry; }
    }

    // Group by plate
    const assignmentMap: Record<string, { company_id: string; company_name: string }[]> = {};
    for (const a of assignments) {
      if (!assignmentMap[a.plate]) assignmentMap[a.plate] = [];
      assignmentMap[a.plate].push({ company_id: a.company_id, company_name: a.company_name });
    }

    const result = data.map(v => ({ ...v, companies: assignmentMap[v.plate] || [], min_doc_expiry: expiryMap[v.id] ?? null }));
    return NextResponse.json({ ok: true, data: result, meta: { total, page, limit, pages: Math.ceil(total / limit) } });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "vehicles:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const raw = await req.json();
    const parsed = vehicleCreateSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const { plate, type, capacity, brand, model, year, driver_id, driver_name, driver_phone, route_name, status_code, notes, ruhsat_sahibi_id } = parsed.data;
    const db = getDb();
    const now = nowIso();
    const id = uuidv4();
    await db.prepare(
      `INSERT INTO vehicles (id, supplier_id, plate, type, capacity, brand, model, year, driver_id, driver_name, driver_phone, route_name, status_code, notes, ruhsat_sahibi_id, created_by, created_at, updated_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, plate.toUpperCase(), type || "minibus", capacity || 14, brand || null, model || null, year || null,
      driver_id || null, driver_name || null, driver_phone || null, route_name || null, status_code || "active", notes || null,
      ruhsat_sahibi_id || null, user.id, now, now);
    // If driver is assigned, record in driver_assignments
    if (driver_id) {
      await db.prepare(
        `INSERT INTO driver_assignments (vehicle_id, driver_id, assigned_at, created_by) VALUES (?, ?, ?, ?)`
      ).run(id, driver_id, now, user.id);
    }
    return NextResponse.json({ ok: true, data: { id } });
  } catch (e) { return apiError(e); }
}
