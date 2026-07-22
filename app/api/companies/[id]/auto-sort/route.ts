import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "routes:optimize"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id: companyId } = await params;
    const db = getDb();

    // Yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    // Get all active vehicles for this company
    const allVehicles = await db.prepare(
      `SELECT id FROM company_vehicles WHERE company_id = ? AND is_active = 1 ORDER BY sort_order ASC, plate ASC`
    ).all(companyId) as { id: string }[];

    if (allVehicles.length === 0) return NextResponse.json({ ok: true, updated: 0 });

    // Get yesterday's arrivals ordered by arrival time
    const arrivals = await db.prepare(
      `SELECT va.vehicle_id, va.arrived_at
       FROM vehicle_arrivals va
       WHERE va.company_id = ? AND va.arrival_date = ?
       ORDER BY va.arrived_at ASC`
    ).all(companyId, yesterdayStr) as { vehicle_id: string; arrived_at: string }[];

    const arrivedIds = arrivals.map(a => a.vehicle_id);

    // Build new sort order: arrived vehicles first (by arrival time), then the rest
    const arrivedVehicles = allVehicles.filter(v => arrivedIds.includes(v.id))
      .sort((a, b) => arrivedIds.indexOf(a.id) - arrivedIds.indexOf(b.id));
    const notArrivedVehicles = allVehicles.filter(v => !arrivedIds.includes(v.id));

    const ordered = [...arrivedVehicles, ...notArrivedVehicles];

    // Update sort_order for each vehicle
    for (let i = 0; i < ordered.length; i++) {
      await db.prepare(
        `UPDATE company_vehicles SET sort_order = ? WHERE id = ?`
      ).run(i + 1, ordered[i].id);
    }

    return NextResponse.json({ ok: true, updated: ordered.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
