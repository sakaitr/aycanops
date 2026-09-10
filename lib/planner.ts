/**
 * lib/planner.ts — Personel servisi rota optimizasyon motoru
 *
 * Birincil yol: self-hosted VROOM (VRP çözücü) + Valhalla (yol matrisi).
 *   - Kapasite kısıtı, opsiyonel araç zaman penceresi, binlerce durak.
 *   - VROOM yol geometrisini de döndürür (options.g).
 * Yedek yol: VROOM/Valhalla erişilemezse yerel haversine matrisi +
 *   greedy kapasiteli atama + nearest-neighbour TSP + 2-opt.
 *
 * Dışa açılan PlanInput / PlanResult arayüzü değişmedi — app/api/plan
 * ve app/guzergahlar/rota UI'ı aynı kalır.
 */
import {
  vroomSolve,
  valhallaRoute,
  decodePolyline,
  RoutingError,
  type VroomVehicle,
  type VroomJob,
} from "@/lib/routing";

// ── Types ─────────────────────────────────────────────────────────────

export interface PlanPersonnel {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface PlanVehicle {
  id: string;
  label: string; // plaka veya güzergah adı
  capacity: number;
  depot_lat: number;
  depot_lng: number;
}

export interface PlanInput {
  personnel: PlanPersonnel[];
  vehicles: PlanVehicle[];
  max_duration?: number; // araç başına maksimum saniye (opsiyonel zaman penceresi)
}

export interface PlanStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  order: number;
  arrival_seconds: number; // depodan kümülatif
}

export interface PlanVehicleResult {
  vehicle_id: string;
  vehicle_label: string;
  stops: PlanStop[];
  geometry: [number, number][]; // [lat, lng]
  duration_seconds: number;
  distance_meters: number;
}

export interface PlanResult {
  vehicles: PlanVehicleResult[];
  unassigned: PlanPersonnel[];
  total_duration: number;
  total_distance: number;
  engine: "vroom" | "fallback";
}

// ── Entry point ────────────────────────────────────────────────────────

export async function planRoutes(input: PlanInput): Promise<PlanResult> {
  const { personnel, vehicles } = input;

  if (personnel.length === 0 || vehicles.length === 0) {
    return { vehicles: [], unassigned: [], total_duration: 0, total_distance: 0, engine: "vroom" };
  }

  try {
    return await planWithVroom(input);
  } catch (e) {
    if (e instanceof RoutingError) {
      console.warn("[planner] VROOM/Valhalla erişilemedi, yerel yedek algoritmaya düşülüyor:", e.message);
      return await planWithFallback(input);
    }
    throw e;
  }
}

// ── Birincil: VROOM ────────────────────────────────────────────────────

async function planWithVroom(input: PlanInput): Promise<PlanResult> {
  const { personnel, vehicles, max_duration } = input;

  const vroomVehicles: VroomVehicle[] = vehicles.map((v, i) => ({
    id: i,
    profile: "auto", // Valhalla costing
    start: [v.depot_lng, v.depot_lat],
    end: [v.depot_lng, v.depot_lat],
    capacity: [Math.max(1, Math.floor(v.capacity))],
    description: v.label,
    ...(max_duration && max_duration > 0 ? { time_window: [0, Math.round(max_duration)] as [number, number] } : {}),
  }));

  const vroomJobs: VroomJob[] = personnel.map((p, i) => ({
    id: i,
    location: [p.lng, p.lat],
    amount: [1],
    description: p.name,
  }));

  const solution = await vroomSolve(vroomVehicles, vroomJobs, { geometry: true });

  const results: PlanVehicleResult[] = [];
  const assignedIds = new Set<string>();

  for (const route of solution.routes) {
    const v = vehicles[route.vehicle];
    if (!v) continue;

    const stops: PlanStop[] = [];
    let order = 0;
    for (const step of route.steps) {
      if (step.type !== "job" || step.id == null) continue;
      const p = personnel[step.id];
      if (!p) continue;
      assignedIds.add(p.id);
      order += 1;
      stops.push({
        id: p.id,
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        order,
        arrival_seconds: Math.round(step.arrival),
      });
    }

    let geometry: [number, number][] = [];
    if (route.geometry) {
      geometry = decodePolyline(route.geometry, 5);
    } else if (stops.length > 0) {
      const geo = await valhallaRoute([
        { lat: v.depot_lat, lng: v.depot_lng },
        ...stops.map((s) => ({ lat: s.lat, lng: s.lng })),
      ]);
      geometry = geo?.coordinates ?? [];
    }

    results.push({
      vehicle_id: v.id,
      vehicle_label: v.label,
      stops,
      geometry,
      duration_seconds: Math.round(route.duration),
      distance_meters: Math.round(route.distance),
    });
  }

  // VROOM'un hiç kullanmadığı araçları da (boş) döndür — UI tümünü bekliyor
  const usedVehicleIdx = new Set(solution.routes.map((r) => r.vehicle));
  for (let i = 0; i < vehicles.length; i++) {
    if (usedVehicleIdx.has(i)) continue;
    results.push({
      vehicle_id: vehicles[i].id,
      vehicle_label: vehicles[i].label,
      stops: [],
      geometry: [],
      duration_seconds: 0,
      distance_meters: 0,
    });
  }
  results.sort(
    (a, b) => vehicles.findIndex((v) => v.id === a.vehicle_id) - vehicles.findIndex((v) => v.id === b.vehicle_id),
  );

  const unassigned = personnel.filter((p) => !assignedIds.has(p.id));

  return {
    vehicles: results,
    unassigned,
    total_duration: results.reduce((s, r) => s + r.duration_seconds, 0),
    total_distance: results.reduce((s, r) => s + r.distance_meters, 0),
    engine: "vroom",
  };
}

// ── Yedek: yerel haversine + greedy ───────────────────────────────────

async function planWithFallback(input: PlanInput): Promise<PlanResult> {
  const { personnel, vehicles } = input;

  const D = vehicles.length;
  const allPoints = [
    ...vehicles.map((v) => ({ lat: v.depot_lat, lng: v.depot_lng })),
    ...personnel.map((p) => ({ lat: p.lat, lng: p.lng })),
  ];
  const durations = haversineMatrix(allPoints); // saniye tahmini (30 km/h)

  const assignments = capacitatedAssign(D, vehicles, personnel, durations);

  const results: PlanVehicleResult[] = [];
  const assigned = new Set<string>();

  for (let vi = 0; vi < vehicles.length; vi++) {
    const v = vehicles[vi];
    const pList = assignments[vi];

    if (pList.length === 0) {
      results.push({
        vehicle_id: v.id, vehicle_label: v.label, stops: [], geometry: [],
        duration_seconds: 0, distance_meters: 0,
      });
      continue;
    }

    const personIdxs = pList.map((p) => D + personnel.indexOf(p));
    const optimized = twoOpt(vi, nearestNeighbor(vi, personIdxs, durations), durations);

    let cumDur = 0;
    let prevIdx = vi;
    const stops: PlanStop[] = optimized.map((matrixIdx, order) => {
      const p = personnel[matrixIdx - D];
      assigned.add(p.id);
      cumDur += durations[prevIdx]?.[matrixIdx] ?? 0;
      prevIdx = matrixIdx;
      return { id: p.id, name: p.name, lat: p.lat, lng: p.lng, order: order + 1, arrival_seconds: Math.round(cumDur) };
    });

    const geo = await valhallaRoute([
      { lat: v.depot_lat, lng: v.depot_lng },
      ...stops.map((s) => ({ lat: s.lat, lng: s.lng })),
    ]);

    results.push({
      vehicle_id: v.id,
      vehicle_label: v.label,
      stops,
      geometry: geo?.coordinates ?? [],
      duration_seconds: geo?.duration ?? Math.round(cumDur),
      distance_meters: geo?.distance ?? 0,
    });
  }

  const unassigned = personnel.filter((p) => !assigned.has(p.id));

  return {
    vehicles: results,
    unassigned,
    total_duration: results.reduce((s, r) => s + r.duration_seconds, 0),
    total_distance: results.reduce((s, r) => s + r.distance_meters, 0),
    engine: "fallback",
  };
}

// ── Yardımcılar (yedek yol) ──────────────────────────────────────────

function haversineMatrix(points: Array<{ lat: number; lng: number }>): number[][] {
  const R = 6_371_000;
  const speed = 30 / 3.6; // 30 km/h → m/s
  const n = points.length;
  const m: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dLat = ((points[j].lat - points[i].lat) * Math.PI) / 180;
      const dLng = ((points[j].lng - points[i].lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((points[i].lat * Math.PI) / 180) *
          Math.cos((points[j].lat * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
      const dist = 2 * R * Math.asin(Math.sqrt(a));
      const sec = dist / speed;
      m[i][j] = sec;
      m[j][i] = sec;
    }
  }
  return m;
}

function capacitatedAssign(
  D: number,
  vehicles: PlanVehicle[],
  personnel: PlanPersonnel[],
  durations: number[][],
): PlanPersonnel[][] {
  const unassigned = new Set<number>(personnel.map((_, i) => i));
  const buckets: PlanPersonnel[][] = vehicles.map(() => []);

  for (let vi = 0; vi < vehicles.length; vi++) {
    let curIdx = vi;
    const cap = vehicles[vi].capacity;
    while (buckets[vi].length < cap && unassigned.size > 0) {
      let best = -1;
      let bestDur = Infinity;
      for (const pi of unassigned) {
        const d = durations[curIdx]?.[D + pi] ?? Infinity;
        if (d < bestDur) {
          bestDur = d;
          best = pi;
        }
      }
      if (best === -1) break;
      buckets[vi].push(personnel[best]);
      unassigned.delete(best);
      curIdx = D + best;
    }
  }

  for (const pi of unassigned) {
    let minVi = 0;
    for (let vi = 1; vi < vehicles.length; vi++) {
      if (buckets[vi].length < buckets[minVi].length) minVi = vi;
    }
    buckets[minVi].push(personnel[pi]);
  }
  return buckets;
}

function nearestNeighbor(depotIdx: number, personIdxs: number[], durations: number[][]): number[] {
  const unvisited = new Set(personIdxs);
  const route: number[] = [];
  let cur = depotIdx;
  while (unvisited.size > 0) {
    let best = -1;
    let bestDur = Infinity;
    for (const idx of unvisited) {
      const d = durations[cur]?.[idx] ?? Infinity;
      if (d < bestDur) {
        bestDur = d;
        best = idx;
      }
    }
    if (best === -1) break;
    route.push(best);
    unvisited.delete(best);
    cur = best;
  }
  return route;
}

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
          best = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
          improved = true;
        }
      }
    }
  }
  return best;
}
