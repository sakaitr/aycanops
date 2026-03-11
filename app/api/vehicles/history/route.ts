import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/**
 * GET /api/vehicles/history?vehicle_id=<uuid>&limit=30
 * Returns arrival history + last inspection for a company vehicle.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const url = new URL(req.url);
    const vehicle_id = url.searchParams.get("vehicle_id");
    const limit = Math.min(Number(url.searchParams.get("limit") || "30"), 90);

    if (!vehicle_id) return NextResponse.json({ ok: false, error: "vehicle_id gerekli" }, { status: 400 });

    const db = getDb();

    // Vehicle info + company
    const vehicle = await db.prepare(`
      SELECT cv.id, cv.plate, cv.driver_name, cv.notes, cv.is_active,
             c.id AS company_id, c.name AS company_name
      FROM company_vehicles cv
      JOIN companies c ON c.id = cv.company_id
      WHERE cv.id = ?
    `).get(vehicle_id) as any;

    if (!vehicle) return NextResponse.json({ ok: false, error: "Araç bulunamadı" }, { status: 404 });

    // allowed_companies enforcement
    if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(vehicle.company_id)) {
        return NextResponse.json({ ok: false, error: "Bu araca erişim yetkiniz yok" }, { status: 403 });
      }
    }

    // Arrival history
    const arrivals = await db.prepare(`
      SELECT va.id, va.arrival_date, va.arrived_at,
             ROUND(COALESCE(va.latitude, 0), 6) AS latitude,
             ROUND(COALESCE(va.longitude, 0), 6) AS longitude,
             u.full_name AS recorded_by_name
      FROM vehicle_arrivals va
      LEFT JOIN users u ON u.id = va.recorded_by
      WHERE va.vehicle_id = ?
      ORDER BY va.arrived_at DESC
      LIMIT ?
    `).all(vehicle_id, limit) as any[];

    // Last inspection
    const lastInspection = await db.prepare(`
      SELECT i.inspection_date, i.type, i.result, u.full_name AS inspector_name
      FROM inspections i
      LEFT JOIN users u ON u.id = i.inspector_id
      WHERE i.company_vehicle_id = ?
      ORDER BY i.inspection_date DESC
      LIMIT 1
    `).get(vehicle_id) as any;

    // Stats
    const stats = await db.prepare(`
      SELECT
        COUNT(*) AS total_arrivals,
        COUNT(CASE WHEN va.arrival_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1 END) AS last_30_days,
        MIN(va.arrival_date) AS first_arrival,
        MAX(va.arrival_date) AS last_arrival
      FROM vehicle_arrivals va
      WHERE va.vehicle_id = ?
    `).get(vehicle_id) as any;

    return NextResponse.json({
      ok: true,
      data: {
        vehicle,
        arrivals,
        last_inspection: lastInspection || null,
        stats,
      },
    });
  } catch (err) {
    console.error("Vehicle history error:", err);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
