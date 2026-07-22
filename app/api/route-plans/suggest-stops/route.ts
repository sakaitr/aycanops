import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { logAudit } from "@/lib/audit";

type PassengerPoint = {
  id: string;
  full_name: string;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string | null;
};

type LatLng = { lat: number; lng: number };

type RoadSegment = {
  a: LatLng;
  b: LatLng;
  name: string | null;
  ref: string | null;
  highway: string | null;
};

type RoadSnap = {
  lat: number;
  lng: number;
  snapped_to_main_road: boolean;
  snap_distance_m: number;
  road_name: string | null;
  road_ref: string | null;
  road_class: string | null;
};

type OverpassWay = {
  type?: string;
  tags?: { highway?: string; name?: string; ref?: string };
  geometry?: Array<{ lat: number; lon: number }>;
};

const MAIN_ROAD_CLASSES = "trunk|primary|secondary|tertiary|trunk_link|primary_link|secondary_link|tertiary_link";
const ROAD_QUERY_CLASSES = `${MAIN_ROAD_CLASSES}|unclassified|residential`;
const MAIN_ROAD_RE = new RegExp(`^(${MAIN_ROAD_CLASSES})$`);
const roadSegmentCache = new Map<string, RoadSegment[]>();
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];
const ROAD_CLASS_SCORE: Record<string, number> = {
  trunk: -140,
  primary: -120,
  secondary: -90,
  tertiary: -55,
  trunk_link: -100,
  primary_link: -90,
  secondary_link: -70,
  tertiary_link: -45,
  unclassified: 70,
  residential: 140,
};

function distanceMeters(a: LatLng, b: LatLng) {
  const r = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function metersPerLng(lat: number) {
  return 111_320 * Math.max(0.15, Math.cos(lat * Math.PI / 180));
}

function nearestPointOnSegment(point: LatLng, a: LatLng, b: LatLng) {
  const origin = point;
  const mx = metersPerLng(origin.lat);
  const ay = (a.lat - origin.lat) * 111_320;
  const ax = (a.lng - origin.lng) * mx;
  const by = (b.lat - origin.lat) * 111_320;
  const bx = (b.lng - origin.lng) * mx;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((0 - ax) * dx + (0 - ay) * dy) / len2)) : 0;
  const x = ax + t * dx;
  const y = ay + t * dy;
  const snapped = { lat: origin.lat + y / 111_320, lng: origin.lng + x / mx };
  return { point: snapped, distance: distanceMeters(point, snapped) };
}

function buildRoadSegments(ways: OverpassWay[]) {
  const segments: RoadSegment[] = [];
  for (const way of ways) {
    const highway = way.tags?.highway ?? null;
    const geometry = way.geometry ?? [];
    const isNamedCollector = !!(way.tags?.name || way.tags?.ref) && (highway === "unclassified" || highway === "residential");
    if (!highway || (!MAIN_ROAD_RE.test(highway) && !isNamedCollector) || geometry.length < 2) continue;
    for (let i = 1; i < geometry.length; i++) {
      segments.push({
        a: { lat: Number(geometry[i - 1].lat), lng: Number(geometry[i - 1].lon) },
        b: { lat: Number(geometry[i].lat), lng: Number(geometry[i].lon) },
        name: way.tags?.name ?? null,
        ref: way.tags?.ref ?? null,
        highway,
      });
    }
  }
  return segments;
}

async function fetchMainRoadSegments(points: LatLng[], searchRadiusMeters: number) {
  if (points.length === 0) return [];
  const minLat = Math.min(...points.map(p => p.lat));
  const maxLat = Math.max(...points.map(p => p.lat));
  const minLng = Math.min(...points.map(p => p.lng));
  const maxLng = Math.max(...points.map(p => p.lng));
  if (points.length > 1 && (maxLat - minLat > 0.08 || maxLng - minLng > 0.08)) {
    const tiles = new Map<string, LatLng[]>();
    for (const point of points) {
      const key = `${Math.round(point.lat / 0.025)}:${Math.round(point.lng / 0.025)}`;
      tiles.set(key, [...(tiles.get(key) ?? []), point]);
    }
    const allSegments: RoadSegment[] = [];
    for (const tilePoints of Array.from(tiles.values()).slice(0, 40)) {
      try {
        allSegments.push(...await fetchMainRoadSegments(tilePoints, searchRadiusMeters));
      } catch {}
    }
    return allSegments;
  }
  const padding = Math.max(0.006, Math.min(0.04, searchRadiusMeters / 111_320));
  const south = minLat - padding;
  const north = maxLat + padding;
  const west = minLng - padding;
  const east = maxLng + padding;
  const cacheKey = `${south.toFixed(3)}:${west.toFixed(3)}:${north.toFixed(3)}:${east.toFixed(3)}`;
  const cached = roadSegmentCache.get(cacheKey);
  if (cached) return cached;

  const query = `[out:json][timeout:12];
(
  way["highway"~"^(${ROAD_QUERY_CLASSES})$"](${south},${west},${north},${east});
);
out tags geom;`;
  let data: { elements?: OverpassWay[] } | null = null;
  let lastStatus = 0;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": "AycanOPS/1.0 route-stop-planner",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(10_000),
      });
      lastStatus = res.status;
      if (!res.ok) continue;
      data = await res.json() as { elements?: OverpassWay[] };
      break;
    } catch {}
  }
  if (!data) throw new Error(`Overpass ana yol sorgusu başarısız (${lastStatus || "timeout"})`);
  const segments = buildRoadSegments(data.elements ?? []);
  roadSegmentCache.set(cacheKey, segments);
  if (roadSegmentCache.size > 40) {
    const oldestKey = roadSegmentCache.keys().next().value;
    if (oldestKey) roadSegmentCache.delete(oldestKey);
  }
  return segments;
}

function projectedMeters(origin: LatLng, point: LatLng) {
  return {
    x: (point.lng - origin.lng) * metersPerLng(origin.lat),
    y: (point.lat - origin.lat) * 111_320,
  };
}

function snapToBestMainRoad(point: LatLng, passengers: PassengerPoint[], segments: RoadSegment[], maxSnapMeters: number, destination?: LatLng | null): RoadSnap {
  let best: (RoadSnap & { score: number }) | null = null;
  const destVector = destination ? projectedMeters(point, destination) : null;
  const destLength = destVector ? Math.hypot(destVector.x, destVector.y) : 0;
  const sourceToDestination = destination ? distanceMeters(point, destination) : 0;
  for (const segment of segments) {
    const projected = nearestPointOnSegment(point, segment.a, segment.b);
    if (projected.distance > maxSnapMeters) continue;

    const candidate = projected.point;
    const walkingDistances = passengers.map(item => distanceMeters(candidate, { lat: Number(item.pickup_lat), lng: Number(item.pickup_lng) }));
    const avgWalk = walkingDistances.reduce((sum, value) => sum + value, 0) / Math.max(1, walkingDistances.length);
    const maxWalk = Math.max(...walkingDistances, 0);
    const roadBonus = ROAD_CLASS_SCORE[segment.highway || ""] ?? 0;
    let directionPenalty = 0;
    if (destVector && destination && destLength > 1) {
      const candidateVector = projectedMeters(point, candidate);
      const dot = candidateVector.x * destVector.x + candidateVector.y * destVector.y;
      const candidateLength = Math.hypot(candidateVector.x, candidateVector.y);
      const cos = candidateLength > 1 ? dot / (candidateLength * destLength) : 1;
      const candidateToDestination = distanceMeters(candidate, destination);
      if (cos < -0.15) directionPenalty += 700;
      if (candidateToDestination > sourceToDestination + 120) directionPenalty += (candidateToDestination - sourceToDestination) * 1.8;
    }
    const score = avgWalk + maxWalk * 0.18 + projected.distance * 0.12 + directionPenalty + roadBonus;
    if (!best || score < best.score) {
      best = {
        lat: projected.point.lat,
        lng: projected.point.lng,
        snapped_to_main_road: true,
        snap_distance_m: Math.round(projected.distance),
        road_name: segment.name,
        road_ref: segment.ref,
        road_class: segment.highway,
        score,
      };
    }
  }
  if (best) {
    const { score: _score, ...snap } = best;
    return snap;
  }
  return {
    lat: point.lat,
    lng: point.lng,
    snapped_to_main_road: false,
    snap_distance_m: 0,
    road_name: null,
    road_ref: null,
    road_class: null,
  };
}

function mainRoadStopName(snap: RoadSnap, index: number) {
  const roadLabel = snap.road_name || snap.road_ref;
  if (roadLabel) return `${roadLabel} Ana Yol Durağı`;
  return snap.snapped_to_main_road ? `Ana Yol Durağı ${index + 1}` : `Ana Yol Bulunamadı ${index + 1}`;
}

function gridKey(point: PassengerPoint, cellMeters: number) {
  const latCell = cellMeters / 111_320;
  const lngCell = cellMeters / (111_320 * Math.cos(point.pickup_lat * Math.PI / 180));
  return `${Math.round(point.pickup_lat / latCell)}:${Math.round(point.pickup_lng / lngCell)}`;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "routes:optimize")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const companyId = typeof body.company_id === "string" ? body.company_id : "";
    const maxWalkMeters = Math.min(1500, Math.max(100, Number(body.max_walk_meters ?? 500) || 500));
    const apply = body.apply === true;
    const requestedRouteId = typeof body.route_id === "string" && body.route_id ? body.route_id : "";
    const requestedRouteName = typeof body.route_name === "string" && body.route_name.trim() ? body.route_name.trim() : "";
    const companyStop = body.company_stop && Number.isFinite(Number(body.company_stop.lat)) && Number.isFinite(Number(body.company_stop.lng))
      ? { lat: Number(body.company_stop.lat), lng: Number(body.company_stop.lng) }
      : null;
    const selectedPassengerIds = Array.isArray(body.passenger_ids)
      ? Array.from(new Set(body.passenger_ids.filter((id: unknown) => typeof id === "string" && id.trim()).map((id: string) => id.trim())))
      : [];
    if (!companyId) return NextResponse.json({ ok: false, error: "company_id gerekli" }, { status: 400 });
    if (selectedPassengerIds.length > 500) return NextResponse.json({ ok: false, error: "Tek seferde en fazla 500 personel seçilebilir" }, { status: 400 });
    if (apply && selectedPassengerIds.length === 0) return NextResponse.json({ ok: false, error: "Güzergaha atamak için haritadan personel pinleri seçin" }, { status: 400 });

    const db = getDb();
    const selectedWhere = selectedPassengerIds.length > 0 ? ` AND id IN (${selectedPassengerIds.map(() => "?").join(",")})` : "";
    const rows = await db.prepare(
      `SELECT id, full_name, pickup_address, pickup_lat, pickup_lng
       FROM passengers
       WHERE company_id = ? AND status = 'aktif' AND pickup_lat IS NOT NULL AND pickup_lng IS NOT NULL${selectedWhere}
       ORDER BY full_name ASC`
    ).all(companyId, ...selectedPassengerIds) as PassengerPoint[];

    const groups = new Map<string, PassengerPoint[]>();
    for (const row of rows) {
      const key = gridKey(row, maxWalkMeters);
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }

    const groupedItems = Array.from(groups.values());
    const baseCenters = groupedItems.map((items) => {
      const centroid = {
        lat: items.reduce((sum, item) => sum + Number(item.pickup_lat), 0) / items.length,
        lng: items.reduce((sum, item) => sum + Number(item.pickup_lng), 0) / items.length,
      };
      const medoid = items
        .map(item => ({ item, distance: distanceMeters(centroid, { lat: Number(item.pickup_lat), lng: Number(item.pickup_lng) }) }))
        .sort((a, b) => a.distance - b.distance)[0]?.item;
      return medoid ? { lat: Number(medoid.pickup_lat), lng: Number(medoid.pickup_lng) } : centroid;
    });

    const mainRoadSearchRadius = Math.min(4000, Math.max(2500, Math.round(maxWalkMeters * 3)));
    let roadSegments: RoadSegment[] = [];
    try {
      roadSegments = await fetchMainRoadSegments(baseCenters, mainRoadSearchRadius);
    } catch (error) {
      console.warn("Ana yol sorgusu başarısız; duraklar mevcut merkeze yakın üretilecek", error);
    }

    const stops = groupedItems.map((items, index) => {
      const sourceCenter = baseCenters[index];
      const snapped = snapToBestMainRoad(sourceCenter, items, roadSegments, mainRoadSearchRadius, companyStop);
      const center = { lat: snapped.lat, lng: snapped.lng };
      const assignments = items.map(item => ({
        id: item.id,
        name: item.full_name,
        address: item.pickup_address,
        walking_distance_m: Math.round(distanceMeters(center, { lat: Number(item.pickup_lat), lng: Number(item.pickup_lng) })),
      }));
      return {
        id: `suggested-${index + 1}`,
        name: mainRoadStopName(snapped, index),
        lat: center.lat,
        lng: center.lng,
        source_lat: sourceCenter.lat,
        source_lng: sourceCenter.lng,
        snapped_to_main_road: snapped.snapped_to_main_road,
        snap_distance_m: snapped.snap_distance_m,
        road_name: snapped.road_name,
        road_ref: snapped.road_ref,
        road_class: snapped.road_class,
        passenger_count: items.length,
        max_walking_distance_m: Math.max(...assignments.map(item => item.walking_distance_m), 0),
        avg_walking_distance_m: Math.round(assignments.reduce((sum, item) => sum + item.walking_distance_m, 0) / Math.max(1, assignments.length)),
        assignments,
      };
    }).sort((a, b) => b.passenger_count - a.passenger_count || a.max_walking_distance_m - b.max_walking_distance_m);

    let applied: null | { route_id: string; route_name: string; assigned_passenger_count: number } = null;
    if (apply) {
      if (stops.length === 0) return NextResponse.json({ ok: false, error: "Atanacak koordinatlı personel bulunamadı" }, { status: 400 });
      const now = nowIso();
      let routeId = requestedRouteId;
      let routeName = requestedRouteName || `Otomatik Güzergah ${new Date().toLocaleDateString("tr-TR")}`;
      if (routeId) {
        const route = await db.prepare("SELECT id, name FROM routes WHERE id = ? AND company_id = ? LIMIT 1").get(routeId, companyId) as { id: string; name: string } | undefined;
        if (!route) return NextResponse.json({ ok: false, error: "Seçili güzergah bu firmaya ait değil" }, { status: 400 });
        routeName = route.name;
      } else {
        routeId = uuidv4();
        await db.prepare(
          `INSERT INTO routes (id, name, code, direction, stops_json, company_id, is_active, notes, created_by, created_at, updated_at)
           VALUES (?, ?, ?, 'both', ?, ?, 1, ?, ?, ?, ?)`
        ).run(routeId, routeName, `AUTO-${now.slice(0, 10).replace(/-/g, "")}`, JSON.stringify([]), companyId, "Durak önerisinden otomatik oluşturuldu", user.id, now, now);
      }

      const stopsJson = stops.map((stop, index) => ({ name: stop.name, order: index + 1, lat: stop.lat, lng: stop.lng }));
      await db.prepare("UPDATE routes SET stops_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(stopsJson), now, routeId);

      const passengerIds = Array.from(new Set(stops.flatMap(stop => stop.assignments.map(item => item.id))));
      let assignedPassengerCount = 0;
      if (passengerIds.length > 0) {
        const result = await db.prepare(`UPDATE passengers SET route_id = ?, updated_at = ? WHERE company_id = ? AND (route_id IS NULL OR route_id = ?) AND id IN (${passengerIds.map(() => "?").join(",")})`).run(routeId, now, companyId, routeId, ...passengerIds) as { affectedRows?: number };
        assignedPassengerCount = result.affectedRows ?? 0;
      }

      applied = { route_id: routeId, route_name: routeName, assigned_passenger_count: assignedPassengerCount };
      await logAudit({ actorUserId: user.id, action: "route_plans.suggest_stops_apply", entityType: "routes", entityId: routeId, details: { companyId, maxWalkMeters, stopCount: stops.length, suggestedPassengerCount: passengerIds.length, selectedPassengerCount: selectedPassengerIds.length, assignedPassengerCount } });
    }

    return NextResponse.json({
      ok: true,
      data: {
        max_walk_meters: maxWalkMeters,
        main_road_search_radius_m: mainRoadSearchRadius,
        company_direction_used: companyStop !== null,
        passenger_count: rows.length,
        selected_passenger_count: selectedPassengerIds.length,
        stop_count: stops.length,
        main_road_stop_count: stops.filter(stop => stop.snapped_to_main_road).length,
        unsnapped_stop_count: stops.filter(stop => !stop.snapped_to_main_road).length,
        stops,
        applied,
      },
    });
  } catch (e) {
    return apiError(e);
  }
}