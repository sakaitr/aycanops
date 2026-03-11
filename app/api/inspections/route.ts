import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { inspectionCreateSchema } from "@/lib/schemas";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const vehicle_id = searchParams.get("vehicle_id");
    const company_id = searchParams.get("company_id");
    const db = getDb();
    let sql = `SELECT i.*, v.plate as vehicle_plate, v.brand, v.model,
                      u.full_name as inspector_name,
                      i.company_vehicle_plate,
                      cv.company_id,
                      c.name as company_name
               FROM inspections i
               LEFT JOIN vehicles v ON v.id = i.vehicle_id
               LEFT JOIN company_vehicles cv ON cv.id = i.company_vehicle_id
               LEFT JOIN companies c ON c.id = cv.company_id
               LEFT JOIN users u ON u.id = i.inspector_id
               WHERE 1=1`;
    const args: unknown[] = [];
    if (vehicle_id) { sql += " AND i.vehicle_id = ?"; args.push(vehicle_id); }
    if (company_id) { sql += " AND cv.company_id = ?"; args.push(company_id); }
    sql += " ORDER BY i.inspection_date DESC, i.created_at DESC";
    const data = await db.prepare(sql).all(...args);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    const body = await req.json();
    const parsed = inspectionCreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const { vehicle_id, company_vehicle_id, inspection_date, type, result, checklist, notes } = parsed.data;
    if (!vehicle_id && !company_vehicle_id)
      return NextResponse.json({ ok: false, error: "Araç seçimi zorunlu" }, { status: 400 });

    const db = getDb();
    const now = nowIso();
    const id = uuidv4();

    // Auto-compute result from checklist
    const items: { ok: boolean | null; note?: string }[] = checklist || [];
    const allEvaluated = items.length > 0 && items.every(c => c.ok !== null);
    const anyFail = items.some(c => c.ok === false);
    const anyFailWithNote = items.some(c => c.ok === false && c.note?.trim());

    let autoResult = result || "pending";
    if (allEvaluated) {
      if (!anyFail) {
        autoResult = "pass";
      } else if (anyFailWithNote && result === "conditional") {
        autoResult = "conditional";
      } else {
        autoResult = "fail";
      }
    }

    // Resolve or create vehicle record for company vehicles (needed for FK)
    let resolvedVehicleId = vehicle_id || null;
    let resolvedCompVehicleId = company_vehicle_id || null;
    let compVehiclePlate: string | null = null;

    if (company_vehicle_id && !vehicle_id) {
      const cv = await db.prepare("SELECT * FROM company_vehicles WHERE id = ?").get(company_vehicle_id) as { plate: string } | undefined;
      if (!cv) return NextResponse.json({ ok: false, error: "Firma aracı bulunamadı" }, { status: 404 });
      compVehiclePlate = cv.plate;

      // Find or create in vehicles table so FK is satisfied
      const existing = await db.prepare("SELECT id FROM vehicles WHERE plate = ?").get(cv.plate) as { id: string } | undefined;
      if (existing) {
        resolvedVehicleId = existing.id;
      } else {
        const newVid = uuidv4();
        await db.prepare(
          `INSERT INTO vehicles (id, plate, type, capacity, status_code, created_by, created_at, updated_at)
           VALUES (?, ?, 'minibus', 0, 'active', ?, ?, ?)`
        ).run(newVid, cv.plate, user.id, now, now);
        resolvedVehicleId = newVid;
      }
    }

    await db.prepare(
      `INSERT INTO inspections (id, vehicle_id, company_vehicle_id, company_vehicle_plate, inspection_date, inspector_id, type, result, checklist_json, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, resolvedVehicleId, resolvedCompVehicleId, compVehiclePlate,
      inspection_date, user.id, type || "routine", autoResult,
      checklist ? JSON.stringify(checklist) : null, notes || null, now, now);

    return NextResponse.json({ ok: true, data: { id } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
