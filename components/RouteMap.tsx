"use client";
import { useEffect, useRef, useState } from "react";

function injectLeafletCSS() {
  // Leaflet CSS is imported globally in app/layout.tsx.
}

interface Stop { name: string; order: number; lat?: number; lng?: number }
interface Props { stops: Stop[]; routeName?: string }
interface GeoPoint { lat: number; lng: number; name: string }
interface LatLng { lat: number; lng: number }

async function geocodeStop(name: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const q = encodeURIComponent(`${name}, İstanbul`);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=1&countrycodes=tr`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {}
  return null;
}


async function osrmRoute(
  pts: LatLng[]
): Promise<[number, number][] | null> {
  if (pts.length < 2) return null;
  try {
    const coord = pts.map(p => `${p.lng},${p.lat}`).join(";");
    const r = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coord}?overview=full&geometries=geojson`,
      { signal: AbortSignal.timeout(12000) }
    );
    const d = await r.json();
    if (d.code !== "Ok" || !d.routes?.[0]) return null;
    return d.routes[0].geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng] as [number, number]
    );
  } catch {
    return null;
  }
}

export default function RouteMap({ stops, routeName }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const [phase, setPhase] = useState<"idle" | "geocoding" | "map-init" | "done" | "no-coords">("idle");
  const [points, setPoints] = useState<GeoPoint[]>([]);
  const [routeInfo, setRouteInfo] = useState<{ dist: number; dur: number } | null>(null);

  const sorted = [...stops].sort((a, b) => a.order - b.order);
  const stopsKey = sorted.map(s => `${s.name}:${s.lat ?? ""}:${s.lng ?? ""}`).join("|");

  // Phase 1: geocode stops (skip if lat/lng already stored)
  useEffect(() => {
    if (stops.length < 2) { setPhase("no-coords"); return; }
    let cancelled = false;
    setPhase("geocoding");
    setPoints([]);

    const hasCoords = sorted.every(s => s.lat != null && s.lng != null);
    if (hasCoords) {
      const pts = sorted.map(s => ({ lat: s.lat!, lng: s.lng!, name: s.name }));
      setPoints(pts);
      setPhase("map-init");
      return;
    }

    Promise.all(sorted.map(s =>
      s.lat != null && s.lng != null
        ? Promise.resolve({ lat: s.lat, lng: s.lng, name: s.name })
        : geocodeStop(s.name).then(geo => geo ? { ...geo, name: s.name } : null)
    ))
      .then(results => {
        if (cancelled) return;
        const valid = results.filter(Boolean) as GeoPoint[];
        if (valid.length >= 2) { setPoints(valid); setPhase("map-init"); }
        else setPhase("no-coords");
      })
      .catch(() => { if (!cancelled) setPhase("no-coords"); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopsKey]);

  // Phase 2: initialize Leaflet map
  useEffect(() => {
    if (phase !== "map-init" || points.length < 2 || !mapRef.current) return;
    let active = true;
    injectLeafletCSS();

    (async () => {
      await new Promise(r => setTimeout(r, 200)); // let CSS parse
      if (!active || !mapRef.current) return;
      try {
        // @ts-ignore
        const leaflet = await import("leaflet");
        const L = (leaflet as any).default ?? leaflet;
        if (!active || !mapRef.current) return;

        if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
        try { delete (L.Icon.Default.prototype as any)._getIconUrl; } catch {}

        const map = L.map(mapRef.current, { attributionControl: false, zoomControl: true });
        mapInstance.current = map;
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(map);

        const latlngs: [number, number][] = [];
        points.forEach((pt, i) => {
          const color = i === 0 ? "#10b981" : i === points.length - 1 ? "#ef4444" : "#3b82f6";
          const icon = L.divIcon({
            className: "",
            html: `<div style="width:28px;height:28px;background:${color};border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:bold;box-shadow:0 2px 6px rgba(0,0,0,.5)">${i + 1}</div>`,
            iconSize: [28, 28], iconAnchor: [14, 14],
          });
          L.marker([pt.lat, pt.lng], { icon }).addTo(map).bindPopup(`<b>${pt.name}</b>`);
          latlngs.push([pt.lat, pt.lng]);
        });

        // Road-following route via OSRM; fallback to straight line
        const roadCoords = await osrmRoute(points.map(p => ({ lat: p.lat, lng: p.lng })));
        if (!active) return;
        if (roadCoords && roadCoords.length > 1) {
          L.polyline(roadCoords, { color: "#6366f1", weight: 4, opacity: 0.85, lineCap: "round", lineJoin: "round" }).addTo(map);
        } else if (latlngs.length > 1) {
          L.polyline(latlngs, { color: "#6366f1", weight: 3, dashArray: "6 4", opacity: 0.85 }).addTo(map);
        }
        map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40] });
        setPhase("done");
        setTimeout(() => { if (active && mapInstance.current) mapInstance.current.invalidateSize(); }, 300);
      } catch {
        if (active) setPhase("no-coords");
      }
    })();

    return () => {
      active = false;
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
    };
  }, [points]);

  return (
    <div>
      {/* Stop flow — always visible */}
      {sorted.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap mb-3">
          {sorted.map((s, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                i === 0 ? "bg-emerald-950 border-emerald-700 text-emerald-300" :
                i === sorted.length - 1 ? "bg-red-950 border-red-800 text-red-300" :
                "bg-zinc-800 border-zinc-700 text-zinc-400"
              }`}>{s.name}</span>
              {i < sorted.length - 1 && <span className="text-zinc-600 text-xs">→</span>}
            </div>
          ))}
        </div>
      )}

      {/* Map area */}
      {stops.length < 2 ? (
        <div className="h-14 bg-zinc-900/40 border border-dashed border-zinc-800 rounded-xl flex items-center justify-center text-xs text-zinc-700">
          Harita için en az 2 durak ekleyin
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden border border-zinc-700 bg-zinc-900 relative" style={{ height: 240 }}>
          {(phase === "geocoding" || phase === "map-init") && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-900">
              <div className="flex gap-2 items-center text-zinc-500 text-sm">
                <div className="w-4 h-4 border-2 border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
                Harita yükleniyor...
              </div>
            </div>
          )}
          {phase === "no-coords" && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-900">
              <p className="text-zinc-600 text-xs text-center leading-relaxed">
                Durak koordinatları bulunamadı<br />
                <span className="text-zinc-700">(Geocoding başarısız)</span>
              </p>
            </div>
          )}
          {/* Always in DOM so Leaflet can measure */}
          <div ref={mapRef} className="w-full h-full" />
        </div>
      )}
    </div>
  );
}

