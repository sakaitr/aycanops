import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { validateApiKey } from "@/lib/api-key";
import { apiError } from "@/lib/api-error";

// GET /api/v1/trips — Public API: sefer/transfer listesi
export async function GET(req: NextRequest) {
  try {
    const key = await validateApiKey(req);
    if (!key) {
      return NextResponse.json({ error: "Geçersiz veya eksik API anahtarı" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get("date_from") || new Date().toISOString().slice(0, 10);
    const dateTo = searchParams.get("date_to") || dateFrom;
    const companyId = searchParams.get("company_id");
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);

    const db = getDb();
    const conditions: string[] = ["t.trip_date >= ?", "t.trip_date <= ?"];
    const params: unknown[] = [dateFrom, dateTo];

    if (companyId) { conditions.push("t.company_id = ?"); params.push(companyId); }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const rows = await db.prepare(`
      SELECT
        t.id, t.trip_date, t.departure_time, t.arrival_time,
        t.origin, t.destination, t.status, t.seat_count,
        t.passenger_count, t.notes,
        v.plate AS vehicle_plate, v.brand AS vehicle_brand, v.model AS vehicle_model,
        u.full_name AS driver_name,
        c.name AS company_name
      FROM trips t
      LEFT JOIN vehicles v ON v.id = t.vehicle_id
      LEFT JOIN users u ON u.id = t.driver_id
      LEFT JOIN companies c ON c.id = t.company_id
      ${where}
      ORDER BY t.trip_date DESC, t.departure_time DESC
      LIMIT ?
    `).all(...params, limit);

    return NextResponse.json({
      ok: true,
      count: (rows as unknown[]).length,
      date_from: dateFrom,
      date_to: dateTo,
      data: rows,
    });
  } catch (e) {
    return apiError(e);
  }
}
