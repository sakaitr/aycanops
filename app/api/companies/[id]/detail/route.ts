import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    const { id } = await params;

    // allowed_companies enforcement
    if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(id)) {
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
      }
    }

    const db = getDb();

    const company = await db.prepare(
      `SELECT c.*, u.full_name AS responsible_name
       FROM companies c
       LEFT JOIN users u ON u.id = c.responsible_id
       WHERE c.id = ?`
    ).get(id);
    if (!company) return NextResponse.json({ ok: false, error: "Firma bulunamadı" }, { status: 404 });

    // Company-assigned vehicles (company_vehicles)
    const vehicles = await db.prepare(
      `SELECT cv.*, d.name AS driver_name_from_drivers
       FROM company_vehicles cv
       LEFT JOIN vehicles v ON v.plate = cv.plate
       LEFT JOIN drivers d ON d.id = v.driver_id
       WHERE cv.company_id = ?
       ORDER BY cv.sort_order ASC, cv.plate ASC`
    ).all(id);

    // Responsible persons (from company_responsible junction)
    const responsibles = await db.prepare(
      `SELECT cr.id, cr.user_id, cr.created_at,
              u.full_name, u.username, u.role
       FROM company_responsible cr
       JOIN users u ON u.id = cr.user_id
       WHERE cr.company_id = ?
       ORDER BY u.full_name ASC`
    ).all(id);

    // Passengers (personeller)
    const passengers = await db.prepare(
      `SELECT id, full_name, phone, email, type, status, pickup_address, created_at
       FROM passengers WHERE company_id = ? ORDER BY full_name ASC`
    ).all(id);

    // Recent transfers
    const transfers = await db.prepare(
      `SELECT id, title, status, transfer_date, transfer_time,
              pickup_location, dropoff_location, passenger_count, driver_name, vehicle_id
       FROM transfers WHERE company_id = ?
       ORDER BY transfer_date DESC, transfer_time DESC LIMIT 50`
    ).all(id);

    // Aggregates
    const transferCount = (await db.prepare(
      `SELECT COUNT(*) as cnt FROM transfers WHERE company_id = ?`
    ).get(id) as { cnt: number } | undefined)?.cnt ?? 0;

    const passengerCount = (await db.prepare(
      `SELECT COUNT(*) as cnt FROM passengers WHERE company_id = ?`
    ).get(id) as { cnt: number } | undefined)?.cnt ?? 0;

    return NextResponse.json({
      ok: true,
      data: {
        ...(company as object),
        vehicles,
        responsibles,
        passengers,
        transfers,
        vehicle_count: (vehicles as unknown[]).length,
        transfer_count: transferCount,
        passenger_count: passengerCount,
      },
    });
  } catch (e) { return apiError(e); }
}
