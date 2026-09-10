/**
 * Valhalla istemcisi — self-hosted yol motoru (matris + yol geometrisi).
 * Base URL: VALHALLA_URL env, yoksa sidecar container adı.
 */
import { routingFetch, RoutingError } from "./http";
import { decodePolyline } from "./polyline";

export const VALHALLA_URL = process.env.VALHALLA_URL || "http://aycanops_valhalla:8002";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteGeometry {
  coordinates: [number, number][]; // [lat, lng]
  distance: number; // metre
  duration: number; // saniye
}

/**
 * sources × targets sürüş matrisi.
 * durations saniye, distances metre. Ulaşılamayan hücre null.
 */
export async function valhallaMatrix(
  sources: LatLng[],
  targets: LatLng[] = sources,
): Promise<{ durations: (number | null)[][]; distances: (number | null)[][] }> {
  const body = {
    sources: sources.map((p) => ({ lat: p.lat, lon: p.lng })),
    targets: targets.map((p) => ({ lat: p.lat, lon: p.lng })),
    costing: "auto",
  };

  const data = await routingFetch<{
    sources_to_targets: Array<Array<{ time: number | null; distance: number | null } | null>>;
  }>(`${VALHALLA_URL}/sources_to_targets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeoutMs: 45_000,
  });

  const rows = data.sources_to_targets ?? [];
  const durations = rows.map((r) => r.map((c) => (c?.time ?? null)));
  const distances = rows.map((r) =>
    r.map((c) => (c?.distance != null ? Math.round(c.distance * 1000) : null)),
  );
  return { durations, distances };
}

/**
 * Nokta dizisi için yol geometrisi + toplam süre/mesafe.
 * Rota bulunamazsa / servis erişilemezse null (çağıran taraf düz çizgiye düşer).
 */
export async function valhallaRoute(points: LatLng[]): Promise<RouteGeometry | null> {
  if (points.length < 2) return null;

  const body = {
    locations: points.map((p) => ({ lat: p.lat, lon: p.lng })),
    costing: "auto",
    directions_options: { units: "kilometers" },
  };

  let data: {
    trip?: {
      status: number;
      summary?: { length: number; time: number };
      legs?: Array<{ shape: string }>;
    };
  };
  try {
    data = await routingFetch(`${VALHALLA_URL}/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 20_000,
    });
  } catch (e) {
    if (e instanceof RoutingError) return null;
    throw e;
  }

  const trip = data.trip;
  if (!trip || trip.status !== 0) return null;

  const coordinates: [number, number][] = [];
  for (const leg of trip.legs ?? []) {
    for (const pt of decodePolyline(leg.shape, 6)) coordinates.push(pt);
  }

  return {
    coordinates,
    distance: Math.round((trip.summary?.length ?? 0) * 1000),
    duration: Math.round(trip.summary?.time ?? 0),
  };
}

/** Servis sağlıklı mı (deploy doğrulama için). */
export async function valhallaStatus(): Promise<boolean> {
  try {
    await routingFetch(`${VALHALLA_URL}/status`, { timeoutMs: 5_000 });
    return true;
  } catch {
    return false;
  }
}
