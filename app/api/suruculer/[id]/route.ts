import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "drivers:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();

    const driver = await db.prepare(
      `SELECT d.*, c.name AS company_name
       FROM drivers d
       LEFT JOIN companies c ON c.id = d.company_id
       WHERE d.id = ?`
    ).get(id) as any;

    if (!driver) return NextResponse.json({ ok: false, error: "Sürücü bulunamadı" }, { status: 404 });

    // Current vehicle
    const currentVehicle = await db.prepare(
      `SELECT id, plate, type, brand, model, status_code FROM vehicles WHERE driver_id = ? AND status_code = 'active' LIMIT 1`
    ).get(id) as any;

    // Sicil kayıtları (son 50)
    const records = await db.prepare(
      `SELECT dr.*, v.plate AS vehicle_plate
       FROM driver_records dr
       LEFT JOIN vehicles v ON v.id = dr.vehicle_id
       WHERE dr.driver_name = ?
       ORDER BY dr.incident_date DESC
       LIMIT 50`
    ).all(driver.name) as any[];

    // Toplam puan hesapla
    const deductionRows = await db.prepare(
      `SELECT SUM(CASE severity WHEN 1 THEN 5 WHEN 2 THEN 15 WHEN 3 THEN 25 WHEN 4 THEN 40 ELSE 0 END) AS total
       FROM driver_records WHERE driver_name = ?`
    ).get(driver.name) as any;
    const score = Math.max(0, 100 - (deductionRows?.total ?? 0));

    // Araç atama geçmişi
    const assignments = await db.prepare(
      `SELECT da.*, v.plate, v.type, v.brand, v.model
       FROM driver_assignments da
       LEFT JOIN vehicles v ON v.id = da.vehicle_id
       WHERE da.driver_id = ?
       ORDER BY da.assigned_at DESC
       LIMIT 50`
    ).all(id) as any[];

    // Transferler (sürücü adıyla eşleşen)
    const transfers = await db.prepare(
      `SELECT t.id, t.title, t.status, t.transfer_date, t.transfer_time,
              t.pickup_location, t.dropoff_location, c.name AS company_name
       FROM transfers t
       LEFT JOIN companies c ON c.id = t.company_id
       WHERE t.driver_name = ?
       ORDER BY t.transfer_date DESC
       LIMIT 30`
    ).all(driver.name) as any[];

    return NextResponse.json({
      ok: true,
      data: { ...driver, score, currentVehicle, records, assignments, transfers },
    });
  } catch (e) { return apiError(e); }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "drivers:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const name = (body.name || "").trim();
    if (!name) return NextResponse.json({ ok: false, error: "Sürücü adı zorunludur" }, { status: 400 });

    const db = getDb();
    const now = nowIso();

    const existing = await db.prepare("SELECT id FROM drivers WHERE id = ?").get(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Sürücü bulunamadı" }, { status: 404 });

    await db.prepare(
      `UPDATE drivers SET
         name = ?, phone = ?, email = ?, tc_no = ?, birth_date = ?,
         license_number = ?, license_class = ?,
         license_expiry = ?, src_expiry = ?, psiko_expiry = ?, health_expiry = ?,
         photo_url = ?, notes = ?, status = ?, company_id = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      name,
      body.phone || null,
      body.email || null,
      body.tc_no || null,
      body.birth_date || null,
      body.license_number || null,
      body.license_class || null,
      body.license_expiry || null,
      body.src_expiry || null,
      body.psiko_expiry || null,
      body.health_expiry || null,
      body.photo_url || null,
      body.notes || null,
      body.status || "aktif",
      body.company_id || null,
      now,
      id,
    );

    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "drivers:deactivate"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();

    // Soft delete: pasife al
    await db.prepare(
      `UPDATE drivers SET status = 'pasif', updated_at = ? WHERE id = ?`
    ).run(nowIso(), id);

    // Araçtan bağı kaldır
    await db.prepare(
      `UPDATE vehicles SET driver_id = NULL, updated_at = ? WHERE driver_id = ?`
    ).run(nowIso(), id);

    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
