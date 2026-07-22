import { NextRequest, NextResponse } from "next/server";
import { requirePortalUser } from "@/lib/portal-auth";
import { getDb } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { istanbulHourMinute } from "@/lib/time";

// Haftalık giriş kontrolleri: ?week=YYYY-MM-DD (haftanın pazartesi tarihi)
export async function GET(req: NextRequest) {
  try {
    const portalUser = await requirePortalUser();
    if (!portalUser) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    // week = "2026-04-20" (pazartesi) - verilmezse bu haftanın pazartesisi
    let weekStart = searchParams.get("week") || "";
    if (!weekStart) {
      const now = new Date();
      const day = now.getDay(); // 0=sun
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((day + 6) % 7));
      weekStart = monday.toISOString().slice(0, 10);
    }

    // Pazartesiden Cumaya 5 gün
    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      days.push(d.toISOString().slice(0, 10));
    }

    const db = getDb();
    const cid = portalUser.company_id;

    // Firmaya ait aktif araçlar
    const vehicles = await db
      .prepare(
        `SELECT cv.id, cv.plate, cv.driver_name, cv.route_name
         FROM company_vehicles cv
         WHERE cv.company_id = ? AND cv.is_active = 1
         ORDER BY cv.plate ASC`
      )
      .all<any>(cid);

    // O haftadaki araç varışları
    const rows = await db
      .prepare(
        `SELECT va.id, va.vehicle_id, va.arrival_date, va.arrived_at, va.shift
         FROM vehicle_arrivals va
         JOIN company_vehicles cv ON cv.id = va.vehicle_id
         WHERE cv.company_id = ?
           AND va.arrival_date >= ?
           AND va.arrival_date <= ?
         ORDER BY va.arrival_date ASC, va.arrived_at ASC`
      )
      .all<any>(cid, days[0], days[6]);

    // Vardiya toleransına göre gecikme hesapla
    const shifts = await db
      .prepare("SELECT shift_name, expected_time, tolerance_late FROM company_shifts WHERE company_id = ? AND active = 1")
      .all<any>(cid);
    const shiftByName = new Map(shifts.map((s: any) => [s.shift_name, s]));

    for (const row of rows) {
      const shift = shiftByName.get(row.shift || "sabah");
      if (!shift || !row.arrived_at) { row.delayed = false; continue; }
      const arrived = new Date(row.arrived_at);
      const { hour, minute } = istanbulHourMinute(arrived);
      const arrivedMin = hour * 60 + minute;
      const [eh, em] = shift.expected_time.split(":").map(Number);
      const expectedMin = eh * 60 + em;
      row.delayed = arrivedMin - expectedMin > (shift.tolerance_late ?? 10);
    }

    return NextResponse.json({
      ok: true,
      data: { days, rows, vehicles },
    });
  } catch (e) {
    return apiError(e);
  }
}
