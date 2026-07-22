import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

// Aggregated vehicle detail: vehicle + documents + maintenance + inspections + driver + driver_assignments
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "vehicles:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();

    // ── Vehicle base ──────────────────────────────────────────────────────────
    const vehicle = await db.prepare(
      `SELECT v.*, u.full_name AS creator_name, i.unvan AS ruhsat_sahibi_unvan
       FROM vehicles v
       LEFT JOIN users u ON u.id = v.created_by
       LEFT JOIN isleten i ON i.id = v.ruhsat_sahibi_id
       WHERE v.id = ?`
    ).get(id) as any;

    if (!vehicle) return NextResponse.json({ ok: false, error: "Araç bulunamadı" }, { status: 404 });

    // ── Firma atamaları (company_vehicles) ────────────────────────────────────
    const companies = await db.prepare(
      `SELECT c.id AS company_id, c.name AS company_name, cv.is_active
       FROM company_vehicles cv
       JOIN companies c ON c.id = cv.company_id
       WHERE cv.plate = ?
       ORDER BY cv.is_active DESC, c.name ASC`
    ).all(vehicle.plate) as any[];

    // ── Belgeler ──────────────────────────────────────────────────────────────
    const documents = await db.prepare(
      `SELECT * FROM vehicle_documents WHERE vehicle_id = ? ORDER BY expiry_date ASC`
    ).all(id) as any[];

    // ── Bakım ─────────────────────────────────────────────────────────────────
    const maintenance = await db.prepare(
      `SELECT m.*, c.name AS company_name
       FROM vehicle_maintenance m
       LEFT JOIN companies c ON c.id = m.company_id
       WHERE m.vehicle_id = ?
       ORDER BY m.maintenance_date DESC
       LIMIT 50`
    ).all(id) as any[];

    // ── Bakım toplam maliyet ───────────────────────────────────────────────────
    const maintenanceCost = await db.prepare(
      `SELECT COALESCE(SUM(cost), 0) AS total FROM vehicle_maintenance WHERE vehicle_id = ?`
    ).get(id) as { total: number };

    // ── Denetimler ────────────────────────────────────────────────────────────
    const inspections = await db.prepare(
      `SELECT i.*, u.full_name AS inspector_name
       FROM inspections i
       LEFT JOIN users u ON u.id = i.inspector_id
       WHERE i.vehicle_id = ?
       ORDER BY i.inspection_date DESC
       LIMIT 50`
    ).all(id) as any[];

    // ── Atanmış sürücü (drivers tablosu) ────────────────────────────────────
    let currentDriver: any = null;
    if (vehicle.driver_id) {
      currentDriver = await db.prepare(
        `SELECT id, name, phone, email, license_class, license_expiry, src_expiry, psiko_expiry, health_expiry, status
         FROM drivers WHERE id = ?`
      ).get(vehicle.driver_id) as any;
    }

    // ── Sürücü atama geçmişi ──────────────────────────────────────────────────
    const driverAssignments = await db.prepare(
      `SELECT da.id, da.driver_id, da.assigned_at, da.unassigned_at, da.note,
              d.name AS driver_name, d.phone AS driver_phone
       FROM driver_assignments da
       LEFT JOIN drivers d ON d.id = da.driver_id
       WHERE da.vehicle_id = ?
       ORDER BY da.assigned_at DESC
       LIMIT 30`
    ).all(id) as any[];

    return NextResponse.json({
      ok: true,
      data: {
        ...vehicle,
        companies,
        documents,
        maintenance,
        maintenance_total_cost: Number(maintenanceCost.total),
        inspections,
        current_driver: currentDriver,
        driver_assignments: driverAssignments,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
