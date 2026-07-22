import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { hasPermission } from "@/lib/permissions";

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "map:read")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("company_id") || "";
    const routeId = searchParams.get("route_id") || "";
    const db = getDb();

    if (!companyId && !routeId) {
      return NextResponse.json({ ok: true, data: { company_required: true, summary: { routeCount: 0, stopCount: 0, passengerCount: 0, unassignedPassengerCount: 0, vehicleCount: 0, liveVehicleCount: 0 }, routes: [], passengers: [], unassigned_passengers: [], vehicle_locations: [] } });
    }

    const conditions = ["r.is_active = 1"];
    const params: unknown[] = [];
    if (companyId) { conditions.push("r.company_id = ?"); params.push(companyId); }
    if (routeId) { conditions.push("r.id = ?"); params.push(routeId); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const routes = await db.prepare(
      `SELECT r.id, r.name, r.code, r.company_id, c.name AS company_name, r.direction,
              r.morning_departure, r.morning_arrival, r.evening_departure, r.evening_arrival,
              r.stops_json, r.route_geometry, r.vehicle_id, v.plate AS vehicle_plate, v.driver_name, v.driver_phone
       FROM routes r
       LEFT JOIN companies c ON c.id = r.company_id
       LEFT JOIN vehicles v ON v.id = r.vehicle_id
       ${where}
       ORDER BY c.name ASC, r.name ASC
       LIMIT 250`
    ).all(...params) as any[];

    const routeIds = routes.map(r => r.id);
    let passengers: any[] = [];
    if (routeIds.length > 0) {
      passengers = await db.prepare(
        `SELECT p.id, p.full_name, p.phone, p.company_id, p.route_id, p.pickup_address, p.pickup_lat, p.pickup_lng, c.name AS company_name
         FROM passengers p
         LEFT JOIN companies c ON c.id = p.company_id
         WHERE p.status = 'aktif' AND p.pickup_lat IS NOT NULL AND p.pickup_lng IS NOT NULL AND p.route_id IN (${routeIds.map(() => "?").join(",")})
         LIMIT 1000`
      ).all(...routeIds) as any[];
    }

    let unassignedPassengers: any[] = [];
    if (companyId && !routeId) {
      const hiddenRouteCondition = routeIds.length > 0 ? `AND (p.route_id IS NULL OR p.route_id NOT IN (${routeIds.map(() => "?").join(",")}))` : "";
      unassignedPassengers = await db.prepare(
        `SELECT p.id, p.full_name, p.phone, p.company_id, p.route_id, p.pickup_address, p.pickup_lat, p.pickup_lng, c.name AS company_name
         FROM passengers p
         LEFT JOIN companies c ON c.id = p.company_id
         WHERE p.status = 'aktif' AND p.company_id = ? AND p.pickup_lat IS NOT NULL AND p.pickup_lng IS NOT NULL ${hiddenRouteCondition}
         LIMIT 1000`
      ).all(companyId, ...routeIds) as any[];
    }

    const vehicleIds = Array.from(new Set(routes.map(r => r.vehicle_id).filter(Boolean)));
    let vehicleLocations: any[] = [];
    if (vehicleIds.length > 0) {
      vehicleLocations = await db.prepare(
        `SELECT vll.*, v.plate AS vehicle_plate, v.driver_name, v.driver_phone
         FROM vehicle_last_locations vll
         LEFT JOIN vehicles v ON v.id = vll.vehicle_id
         WHERE vll.vehicle_id IN (${vehicleIds.map(() => "?").join(",")})
         ORDER BY vll.recorded_at DESC`
      ).all(...vehicleIds) as any[];
    }
    const locationMap = new Map(vehicleLocations.map(location => [location.vehicle_id, location]));

    const routeData = routes.map((route, index) => ({
      ...route,
      color: ["#38bdf8", "#34d399", "#f59e0b", "#a78bfa", "#fb7185", "#22c55e"][index % 6],
      stops: parseJson(route.stops_json, []),
      geometry: parseJson(route.route_geometry, null),
      passengers: passengers.filter(p => p.route_id === route.id),
      vehicle_location: route.vehicle_id ? locationMap.get(route.vehicle_id) || null : null,
    }));

    const summary = {
      routeCount: routeData.length,
      stopCount: routeData.reduce((sum, r) => sum + (Array.isArray(r.stops) ? r.stops.length : 0), 0),
      passengerCount: passengers.length + unassignedPassengers.length,
      assignedPassengerCount: passengers.length,
      unassignedPassengerCount: unassignedPassengers.length,
      vehicleCount: routeData.filter(r => r.vehicle_id).length,
      liveVehicleCount: vehicleLocations.length,
    };

    return NextResponse.json({ ok: true, data: { summary, routes: routeData, passengers, unassigned_passengers: unassignedPassengers, vehicle_locations: vehicleLocations } });
  } catch (e) { return apiError(e); }
}
