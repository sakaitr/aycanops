import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { nowIso } from "@/lib/time";

export type GeocodeResult = {
  lat: number;
  lng: number;
  confidence?: number | null;
  provider?: string;
  cached?: boolean;
};

type ProviderResult = {
  lat: number;
  lng: number;
  confidence?: number | null;
  provider: string;
  raw: unknown;
};

export function normalizeGeocodeQuery(query: string) {
  return query.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR").slice(0, 500);
}

async function geocodeArcGis(query: string): Promise<ProviderResult | null> {
  const url = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&maxLocations=1&countryCode=TUR&singleLine=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "User-Agent": "AycanOPS/1.0 geocode-cache" }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error("ArcGIS geocode sağlayıcısı yanıt vermedi");
  const data = await res.json();
  const candidate = data?.candidates?.[0];
  if (!candidate?.location) return null;
  const score = Number(candidate.score ?? 0);
  if (score < 60) return null;
  return { lat: Number(candidate.location.y), lng: Number(candidate.location.x), confidence: score / 100, provider: "arcgis", raw: candidate };
}

async function geocodeNominatim(query: string): Promise<ProviderResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=tr&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "User-Agent": "AycanOPS/1.0 geocode-cache" }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error("Geocode sağlayıcısı yanıt vermedi");
  const data = await res.json();
  if (!data?.[0]) return null;
  return { lat: Number(data[0].lat), lng: Number(data[0].lon), confidence: data[0].importance ? Number(data[0].importance) : null, provider: "nominatim", raw: data[0] };
}

export async function geocodeAddress(address: string | null | undefined): Promise<GeocodeResult | null> {
  const query = String(address ?? "").trim();
  if (!query) return null;

  const normalized = normalizeGeocodeQuery(query);
  const db = getDb();
  const cached = await db.prepare("SELECT lat, lng, confidence, provider FROM geocode_cache WHERE normalized_query = ? ORDER BY provider = 'arcgis' DESC, updated_at DESC LIMIT 1").get(normalized) as { lat: number; lng: number; confidence?: number | null; provider?: string } | undefined;
  if (cached) return { lat: Number(cached.lat), lng: Number(cached.lng), confidence: cached.confidence ?? null, provider: cached.provider ?? "cache", cached: true };

  let result: ProviderResult | null = null;
  for (const provider of [geocodeArcGis, geocodeNominatim]) {
    try {
      result = await provider(query);
      if (result) break;
    } catch {
      // Try next provider.
    }
  }
  if (!result) return null;

  const id = uuidv4();
  const now = nowIso();
  await db.prepare(
    `INSERT INTO geocode_cache (id, query_text, normalized_query, lat, lng, provider, confidence, raw_response, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE query_text=VALUES(query_text), lat=VALUES(lat), lng=VALUES(lng), confidence=VALUES(confidence), raw_response=VALUES(raw_response), updated_at=VALUES(updated_at)`
  ).run(id, query, normalized, result.lat, result.lng, result.provider, result.confidence, JSON.stringify(result.raw), now, now);

  return { lat: result.lat, lng: result.lng, confidence: result.confidence, provider: result.provider, cached: false };
}