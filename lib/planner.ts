/**
 * lib/planner.ts — Personnel shuttle route optimization engine
 *
 * Algorithm:
 *  1. OSRM /table  → N×N duration matrix for all points (depots + personnel)
 *  2. Capacitated greedy clustering → assign personnel to vehicles
 *  3. Nearest-neighbour TSP + 2-opt per vehicle
 *  4. OSRM /route  → road-accurate polyline per vehicle
 */

const OSRM = "https://router.project-osrm.org";

// ── Types ─────────────────────────────────────────────────────────────

export interface PlanPersonnel {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface PlanVehicle {
  id: string;
  label: string;   // plate or route name
  capacity: number;
  depot_lat: number;
  depot_lng: number;
}

export interface PlanInput {
  personnel: PlanPersonnel[];
  vehicles: PlanVehicle[];
  max_duration?: number;  // max seconds per vehicle leg, informational
}

export interface PlanStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  order: number;
  arrival_seconds: number; // cumulative from depot
}

export interface PlanVehicleResult {
  vehicle_id: string;
  vehicle_label: string;
  stops: PlanStop[];
  geometry: [number, number][];  // [lat, lng]
  duration_seconds: number;
  distance_meters: number;
}

export interface PlanResult {
  vehicles: PlanVehicleResult[];
  unassigned: PlanPersonnel[];
  total_duration: number;
  total_distance: number;
}

// ── Entry point ────────────────────────────────────────────────────────

export async function planRoutes(input: PlanInput): Promise<PlanResult> {
  const { personnel, vehicles } = input;

  if (personnel.length === 0 || vehicles.length === 0) {
    return { vehicles: [], unassigned: [], total_duration: 0, total_distance: 0 };
  }

  // Points array: [depot_v0, depot_v1, ..., p0, p1, ..., pN]
  const D = vehicles.length;
  const allPoints = [
    ...vehicles.map(v => ({ lat: v.depot_lat, lng: v.depot_lng })),
    ...personnel.map(p => ({ lat: p.lat, lng: p.lng })),
  ];

  // 1. Distance matrix
  const { durations } = await buildMatrix(allPoints);

  // 2. Capacitated greedy assignment
  const assignments = capacitatedAssign(D, vehicles, personnel, durations);

  // 3. TSP + route geometry per vehicle
  const results: PlanVehicleResult[] = [];
  const assigned = new Set<string>();

  // Fetch route geometries in parallel for speed
  const routePromises: Promise<{ geometry: [number,number][]; duration: number; distance: number }>[] = [];
  const vehicleOrders: number[][] = [];

  for (let vi = 0; vi < vehicles.length; vi++) {
    const pList = assignments[vi];
    if (pList.length === 0) {
      vehicleOrders.push([]);
      routePromises.push(Promise.resolve({ geometry: [], duration: 0, distance: 0 }));
      continue;
    }

    const personIdxs = pList.map(p => D + personnel.indexOf(p));
    const ordered = nearestNeighbor(vi, personIdxs, durations);
    const optimized = twoOpt(vi, ordered, durations);
    vehicleOrders.push(optimized);

    const v = vehicles[vi];
    const routePts = [
      { lat: v.depot_lat, lng: v.depot_lng },
      ...optimized.map(idx => ({ lat: personnel[idx - D].lat, lng: personnel[idx - D].lng })),
    ];
    routePromises.push(osrmRoute(routePts));
  }

  const routeResults = await Promise.all(routePromises);

  for (let vi = 0; vi < vehicles.length; vi++) {
    const v = vehicles[vi];
    const pList = assignments[vi];
    const optimized = vehicleOrders[vi];
    const rr = routeResults[vi];

    if (pList.length === 0) {
      results.push({
        vehicle_id: v.id,
        vehicle_label: v.label,
        stops: [],
        geometry: [],
        duration_seconds: 0,
        distance_meters: 0,
      });
      continue;
    }

    // Build stops with cumulative durations
    let cumDur = 0;
    let prevIdx = vi;
    const stops: PlanStop[] = optimized.map((matrixIdx, order) => {
      const p = personnel[matrixIdx - D];
      assigned.add(p.id);
      cumDur += durations[prevIdx]?.[matrixIdx] ?? 0;
      prevIdx = matrixIdx;
      return {
        id: p.id,
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        order: order + 1,
        arrival_seconds: Math.round(cumDur),
      };
    });

    results.push({
      vehicle_id: v.id,
      vehicle_label: v.label,
      stops,
      geometry: rr.geometry,
      duration_seconds: rr.duration,
      distance_meters: rr.distance,
    });
  }

  const unassigned = personnel.filter(p => !assigned.has(p.id));

  return {
    vehicles: results,
    unassigned,
    total_duration: results.reduce((s, r) => s + r.duration_seconds, 0),
    total_distance: results.reduce((s, r) => s + r.distance_meters, 0),
  };
}

// ── OSRM Table → duration matrix ──────────────────────────────────────

async function buildMatrix(points: Array<{ lat: number; lng: number }>) {
  if (points.length > 100) {
    throw new Error("Çok fazla nokta (max 100). Personel sayısını veya araç depolarını azaltın.");
  }

  const coords = points.map(p => `${p.lng},${p.lat}`).join(";");
  const url = `${OSRM}/table/v1/driving/${coords}?annotations=duration,distance`;

  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`OSRM /table HTTP ${res.status}`);
  const data = await res.json();
  if (data.code !== "Ok") throw new Error(`OSRM /table error: ${data.code} – ${data.message ?? ""}`);

  return {
    durations: data.durations as number[][],
    distances: data.distances as number[][] | undefined,
  };
}

// ── Capacitated greedy clustering ─────────────────────────────────────

function capacitatedAssign(
  D: number,
  vehicles: PlanVehicle[],
  personnel: PlanPersonnel[],
  durations: number[][],
): PlanPersonnel[][] {
  const unassigned = new Set<number>(personnel.map((_, i) => i));
  const buckets: PlanPersonnel[][] = vehicles.map(() => []);

  for (let vi = 0; vi < vehicles.length; vi++) {
    let curIdx = vi; // depot of this vehicle
    const cap = vehicles[vi].capacity;

    while (buckets[vi].length < cap && unassigned.size > 0) {
      let best = -1, bestDur = Infinity;
      for (const pi of unassigned) {
        const d = durations[curIdx]?.[D + pi] ?? Infinity;
        if (d < bestDur) { bestDur = d; best = pi; }
      }
      if (best === -1) break;
      buckets[vi].push(personnel[best]);
      unassigned.delete(best);
      curIdx = D + best;
    }
  }

  // Distribute remaining (capacity overflow) to least-loaded vehicle
  for (const pi of unassigned) {
    let minVi = 0;
    for (let vi = 1; vi < vehicles.length; vi++) {
      if (buckets[vi].length < buckets[minVi].length) minVi = vi;
    }
    buckets[minVi].push(personnel[pi]);
  }

  return buckets;
}

// ── Nearest-neighbour TSP heuristic ───────────────────────────────────

function nearestNeighbor(depotIdx: number, personIdxs: number[], durations: number[][]): number[] {
  const unvisited = new Set(personIdxs);
  const route: number[] = [];
  let cur = depotIdx;

  while (unvisited.size > 0) {
    let best = -1, bestDur = Infinity;
    for (const idx of unvisited) {
      const d = durations[cur]?.[idx] ?? Infinity;
      if (d < bestDur) { bestDur = d; best = idx; }
    }
    if (best === -1) break;
    route.push(best);
    unvisited.delete(best);
    cur = best;
  }
  return route;
}

// ── 2-opt improvement ─────────────────────────────────────────────────

function twoOpt(depotIdx: number, route: number[], durations: number[][]): number[] {
  if (route.length <= 2) return route;
  let best = [...route];
  let improved = true;

  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 2; j < best.length; j++) {
        const a = i === 0 ? depotIdx : best[i - 1];
        const b = best[i];
        const c = best[j];
        const dNext = j + 1 < best.length ? best[j + 1] : depotIdx;

        const current = (durations[a]?.[b] ?? 0) + (durations[c]?.[dNext] ?? 0);
        const swapped = (durations[a]?.[c] ?? 0) + (durations[b]?.[dNext] ?? 0);

        if (swapped < current - 1) {
          const newRoute = [
            ...best.slice(0, i),
            ...best.slice(i, j + 1).reverse(),
            ...best.slice(j + 1),
          ];
          best = newRoute;
          improved = true;
        }
      }
    }
  }
  return best;
}

// ── OSRM Route → polyline ─────────────────────────────────────────────

async function osrmRoute(
  points: Array<{ lat: number; lng: number }>,
): Promise<{ geometry: [number, number][]; duration: number; distance: number }> {
  const empty = { geometry: [] as [number, number][], duration: 0, distance: 0 };
  if (points.length < 2) return empty;

  const coords = points.map(p => `${p.lng},${p.lat}`).join(";");
  const url = `${OSRM}/route/v1/driving/${coords}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.[0]) return empty;
    const r = data.routes[0];
    return {
      geometry: r.geometry.coordinates.map(([lng, lat]: number[]) => [lat, lng] as [number, number]),
      duration: Math.round(r.duration),
      distance: Math.round(r.distance),
    };
  } catch {
    return empty;
  }
}
