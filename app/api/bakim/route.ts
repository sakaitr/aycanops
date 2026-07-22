import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "maintenance:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const db = getDb();
    const { searchParams } = new URL(req.url);
    const vehicle_id = searchParams.get("vehicle_id");
    const company_id = searchParams.get("company_id");
    const type = searchParams.get("type");

    const parts: string[] = ["1=1"];
    const params: any[] = [];
    if (vehicle_id) { parts.push("m.vehicle_id = ?"); params.push(vehicle_id); }
    if (company_id) { parts.push("m.company_id = ?"); params.push(company_id); }
    if (type)       { parts.push("m.type = ?");       params.push(type); }

    const where = parts.join(" AND ");

    const rows = await db.prepare(
      `SELECT m.id, m.vehicle_id, m.plate, m.company_id, m.type, m.maintenance_date,
              m.km_at_service, m.next_service_km, m.next_service_date,
              m.cost, m.technician, m.notes, m.receipt_url, m.status, m.created_by,
              m.created_at, m.updated_at,
              v.plate AS vehicle_plate,
              c.name AS company_name,
              u.full_name AS creator_name
       FROM vehicle_maintenance m
       LEFT JOIN vehicles v ON v.id = m.vehicle_id
       LEFT JOIN companies c ON c.id = m.company_id
       LEFT JOIN users u ON u.id = m.created_by
       WHERE ${where}
       ORDER BY m.maintenance_date DESC, m.created_at DESC`
    ).all(...params);

    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "maintenance:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    const {
      vehicle_id, plate, company_id, type, maintenance_date,
      km_at_service, next_service_km, next_service_date,
      cost, technician, notes, receipt_url,
    } = body;

    if (!vehicle_id?.trim())       return NextResponse.json({ ok: false, error: "Araç seçiniz" }, { status: 400 });
    if (!type?.trim())             return NextResponse.json({ ok: false, error: "Bakım tipi zorunludur" }, { status: 400 });
    if (!maintenance_date?.trim()) return NextResponse.json({ ok: false, error: "Tarih zorunludur" }, { status: 400 });

    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    await db.prepare(
      `INSERT INTO vehicle_maintenance
         (id, vehicle_id, plate, company_id, type, maintenance_date,
          km_at_service, next_service_km, next_service_date,
          cost, technician, notes, receipt_url, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'done', ?, ?, ?)`
    ).run(
      id,
      vehicle_id  || null,
      (plate || "").trim().toUpperCase() || null,
      company_id  || null,
      type.trim(),
      maintenance_date.trim(),
      km_at_service    ? Number(km_at_service)    : null,
      next_service_km  ? Number(next_service_km)  : null,
      next_service_date ? next_service_date.trim() : null,
      cost             ? Number(cost)             : null,
      technician?.trim() || null,
      notes?.trim()   || null,
      receipt_url?.trim() || null,
      user.id,
      now,
      now,
    );

    return NextResponse.json({ ok: true, id });
  } catch (e) { return apiError(e); }
}
