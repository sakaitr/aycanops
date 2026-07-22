import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

/**
 * GET /api/sync?since=<ISO string>
 * Verilen tarihten sonra güncellenen tüm kayıtları döner.
 * Client-side Dexie IndexedDB'ye Last Write Wins ile merge edilir.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const since = searchParams.get('since') || new Date(0).toISOString();

    const db = getDb();

    // Araçlar
    const vehicles = await db
      .prepare(
        `SELECT id, plate, type, capacity, brand, model, year,
                driver_name, driver_phone, status_code, notes, updated_at
         FROM vehicles
         WHERE updated_at > ? AND is_deleted = 0
         ORDER BY updated_at ASC
         LIMIT 500`
      )
      .all(since);

    // Güzergahlar
    const routes = await db
      .prepare(
        `SELECT id, name, code, direction,
                morning_departure, morning_arrival, evening_departure, evening_arrival,
                vehicle_id, is_active, notes, updated_at
         FROM routes
         WHERE updated_at > ?
         ORDER BY updated_at ASC
         LIMIT 500`
      )
      .all(since);

    // Seferler (son 30 gün)
    const trips = await db
      .prepare(
        `SELECT id, trip_date, route_id, vehicle_id, direction,
                status_code, passenger_count, notes, updated_at
         FROM trips
         WHERE updated_at > ? AND trip_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
         ORDER BY updated_at ASC
         LIMIT 500`
      )
      .all(since);

    // Firmalar
    const companies = await db
      .prepare(
        `SELECT id, name, is_active, phone, updated_at
         FROM companies
         WHERE updated_at > ?
         ORDER BY updated_at ASC
         LIMIT 200`
      )
      .all(since);

    // Giriş kontroller (son 30 gün)
    const entry_controls = await db
      .prepare(
        `SELECT id, control_date, route_id, planned_count, actual_count, notes, updated_at
         FROM entry_controls
         WHERE updated_at > ? AND control_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
         ORDER BY updated_at ASC
         LIMIT 500`
      )
      .all(since);

    return NextResponse.json({
      ok: true,
      synced_at: new Date().toISOString(),
      data: {
        vehicles,
        routes,
        trips,
        companies,
        entry_controls,
      },
    });
  } catch (e) {
    console.error('[sync] Error:', e);
    return NextResponse.json(
      { ok: false, error: 'Sync hatası' },
      { status: 500 }
    );
  }
}
