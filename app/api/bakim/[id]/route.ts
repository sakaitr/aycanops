import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { hasPermission } from "@/lib/permissions";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "maintenance:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { id } = await params;
    const db = getDb();
    const row = await db.prepare(
      `SELECT m.*, c.name AS company_name, v.plate AS vehicle_plate, u.full_name AS creator_name
       FROM vehicle_maintenance m
       LEFT JOIN companies c ON c.id = m.company_id
       LEFT JOIN vehicles v ON v.id = m.vehicle_id
       LEFT JOIN users u ON u.id = m.created_by
       WHERE m.id = ?`
    ).get<any>(id);
    if (!row) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });
    return NextResponse.json({ ok: true, data: row });
  } catch (e) { return apiError(e); }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "maintenance:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
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
    const now = new Date().toISOString();

    await db.prepare(
      `UPDATE vehicle_maintenance SET
         vehicle_id = ?, plate = ?, company_id = ?, type = ?,
         maintenance_date = ?, km_at_service = ?, next_service_km = ?,
         next_service_date = ?, cost = ?, technician = ?, notes = ?, receipt_url = ?,
         updated_at = ?
       WHERE id = ?`
    ).run(
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
      now,
      id,
    );

    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "maintenance:close"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { id } = await params;
    const db = getDb();
    await db.prepare("DELETE FROM vehicle_maintenance WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
