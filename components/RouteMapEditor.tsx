"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";

export interface EditorStop { name: string; order: number; lat?: number; lng?: number }
interface LatLng { lat: number; lng: number }
interface CtrlPt extends LatLng { kind: "stop" | "wp"; stopIdx?: number }

interface Props {
  stops: EditorStop[];
  onChange: (stops: EditorStop[]) => void;
  onGeometryChange?: (coords: [number, number][]) => void;
}

// ── CSS injection ─────────────────────────────────────────────────────────
function injectLeafletCSS() {
  // Leaflet CSS is imported globally in app/layout.tsx.
}

// ── Geocoding ─────────────────────────────────────────────────────────────
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=tr`,
      { signal: AbortSignal.timeout(8000) }
    );
    const d = await r.json();
    const a = d.address || {};
    return (
      a.road || a.suburb || a.quarter || a.neighbourhood ||
      a.town || a.city_district || d.display_name?.split(",")[0] ||
      `${lat.toFixed(4)},${lng.toFixed(4)}`
    );
  } catch {
    return `${lat.toFixed(4)},${lng.toFixed(4)}`;
  }
}

async function forwardGeocode(q: string): Promise<LatLng | null> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q + ", İstanbul")}&limit=1&countrycodes=tr`,
      { signal: AbortSignal.timeout(8000) }
    );
    const d = await r.json();
    if (d?.[0]) return { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) };
  } catch {}
  return null;
}

// ── OSRM routing ──────────────────────────────────────────────────────────
async function osrmRoute(
  pts: LatLng[],
  signal?: AbortSignal
): Promise<{ coords: [number, number][]; dist: number; dur: number } | null> {
  if (pts.length < 2) return null;
  try {
    const coord = pts.map(p => `${p.lng},${p.lat}`).join(";");
    const r = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coord}?overview=full&geometries=geojson`,
      { signal: signal ?? AbortSignal.timeout(12000) }
    );
    const d = await r.json();
    if (d.code !== "Ok" || !d.routes?.[0]) return null;
    const route = d.routes[0];
    const coords: [number, number][] = route.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng]
    );
    const dist = route.legs.reduce((s: number, l: any) => s + l.distance, 0);
    const dur = route.legs.reduce((s: number, l: any) => s + l.duration, 0);
    return { coords, dist, dur };
  } catch {
    return null;
  }
}

async function osrmTrip(
  pts: LatLng[],
  signal?: AbortSignal
): Promise<{ coords: [number, number][]; newOrder: number[]; dist: number; dur: number } | null> {
  if (pts.length < 2) return null;
  try {
    const coord = pts.map(p => `${p.lng},${p.lat}`).join(";");
    const r = await fetch(
      `https://router.project-osrm.org/trip/v1/driving/${coord}?roundtrip=false&source=first&destination=last&overview=full&geometries=geojson`,
      { signal: signal ?? AbortSignal.timeout(15000) }
    );
    const d = await r.json();
    if (d.code !== "Ok" || !d.trips?.[0]) return null;
    const trip = d.trips[0];
    const coords: [number, number][] = trip.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng]
    );
    // waypoints[inputIdx].waypoint_index = position in optimized trip
    const newOrder: number[] = d.waypoints.map((w: any) => w.waypoint_index);
    return { coords, newOrder, dist: trip.distance, dur: trip.duration };
  } catch {
    return null;
  }
}

// ── Geometry helpers ──────────────────────────────────────────────────────
function distToSeg(p: LatLng, a: LatLng, b: LatLng): number {
  const dx = b.lng - a.lng, dy = b.lat - a.lat;
  if (dx === 0 && dy === 0) return Math.hypot(p.lat - a.lat, p.lng - a.lng);
  const t = Math.max(0, Math.min(1,
    ((p.lat - a.lat) * dy + (p.lng - a.lng) * dx) / (dx * dx + dy * dy)
  ));
  return Math.hypot(p.lat - (a.lat + t * dy), p.lng - (a.lng + t * dx));
}

function findInsertIdx(pts: LatLng[], click: LatLng): number {
  if (pts.length < 2) return pts.length;
  let best = Infinity, bestIdx = pts.length;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distToSeg(click, pts[i], pts[i + 1]);
    if (d < best) { best = d; bestIdx = i + 1; }
  }
  return bestIdx;
}

// ── Leaflet icon factories ─────────────────────────────────────────────────
function makeStopIcon(L: any, label: string, color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:32px;height:32px;background:${color};border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.5)">${label}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function makeWpIcon(L: any) {
  return L.divIcon({
    className: "",
    html: `<div title="Sürükle · Sağ tık: Sil" style="width:14px;height:14px;background:#f59e0b;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.4);cursor:grab"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function fmDist(m: number) { return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`; }
function fmDur(s: number) {
  const m = Math.round(s / 60);
  return m < 60 ? `${m} dk` : `${Math.floor(m / 60)} sa ${m % 60} dk`;
}

// ── Component ─────────────────────────────────────────────────────────────
export default function RouteMapEditor({ stops, onChange, onGeometryChange }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInst = useRef<any>(null);
  const LRef = useRef<any>(null);

  const stopMarkersRef = useRef<any[]>([]);
  const wpMarkersRef = useRef<any[]>([]);
  const routeLineRef = useRef<any>(null);
  const ctrlPtsRef = useRef<CtrlPt[]>([]);

  const stopsRef = useRef(stops);
  const onChangeRef = useRef(onChange);
  const onGeomRef = useRef(onGeometryChange);
  const routeAbortRef = useRef<AbortController | null>(null);
  const prevLenRef = useRef(-1);

  const [routeInfo, setRouteInfo] = useState<{ dist: number; dur: number } | null>(null);
  const [routing, setRouting] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [clicking, setClicking] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [hasWaypoints, setHasWaypoints] = useState(false);

  // Keep callback refs fresh every render
  useEffect(() => {
    stopsRef.current = stops;
    onChangeRef.current = onChange;
    onGeomRef.current = onGeometryChange;
  });

  // ── Map init ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInst.current) return;
    injectLeafletCSS();
    let active = true;

    (async () => {
      const leaflet = await import("leaflet");
      const L = (leaflet as any).default ?? leaflet;
      LRef.current = L;
      if (!active || !mapRef.current || mapInst.current) return;
      try { delete (L.Icon.Default.prototype as any)._getIconUrl; } catch {}
      await new Promise(r => setTimeout(r, 200));
      if (!active || !mapRef.current) return;

      const map = L.map(mapRef.current, {
        center: [41.015, 28.979],
        zoom: 11,
        attributionControl: false,
      });
      mapInst.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);

      // Map click → add new stop
      map.on("click", async (e: any) => {
        const { lat, lng } = e.latlng;
        setClicking(true);
        const name = await reverseGeocode(lat, lng);
        setClicking(false);
        const cur = stopsRef.current;
        onChangeRef.current([...cur, { name, order: cur.length + 1, lat, lng }]);
      });

      setTimeout(() => {
        if (!active || !mapInst.current) return;
        map.invalidateSize();
        rebuildAndRoute(stopsRef.current, true);
      }, 500);
    })();

    return () => {
      active = false;
      if (mapInst.current) { mapInst.current.remove(); mapInst.current = null; }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync stops from parent ─────────────────────────────────────────────
  useEffect(() => {
    if (!mapInst.current || !LRef.current) return;
    // Clear waypoints only when the number of stops changes (add/remove)
    // On drag or rename (same count), keep waypoints
    const clearWps = stops.length !== prevLenRef.current;
    prevLenRef.current = stops.length;
    rebuildAndRoute(stops, clearWps);
  }, [stops]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Core rebuild ──────────────────────────────────────────────────────
  function rebuildAndRoute(currentStops: EditorStop[], clearWaypoints: boolean) {
    const L = LRef.current;
    const map = mapInst.current;
    if (!L || !map) return;

    if (clearWaypoints) {
      wpMarkersRef.current.forEach(m => m.remove());
      wpMarkersRef.current = [];
      setHasWaypoints(false);
      ctrlPtsRef.current = buildStopCtrlPts(currentStops);
    } else {
      // Keep waypoints; re-insert them at nearest positions in new stop arrangement
      const wps = ctrlPtsRef.current.filter(p => p.kind === "wp");
      const newStopPts = buildStopCtrlPts(currentStops);
      const merged: CtrlPt[] = [...newStopPts];
      for (const wp of wps) {
        const idx = findInsertIdx(merged, wp);
        merged.splice(idx, 0, wp);
      }
      ctrlPtsRef.current = merged;
    }

    renderStopMarkers(currentStops);
    void doRoute();
  }

  function buildStopCtrlPts(currentStops: EditorStop[]): CtrlPt[] {
    return currentStops
      .map((s, origIdx) =>
        s.lat != null && s.lng != null
          ? { lat: s.lat!, lng: s.lng!, kind: "stop" as const, stopIdx: origIdx }
          : null
      )
      .filter(Boolean) as CtrlPt[];
  }

  function renderStopMarkers(currentStops: EditorStop[]) {
    const L = LRef.current;
    const map = mapInst.current;
    if (!L || !map) return;

    stopMarkersRef.current.forEach(m => m.remove());
    stopMarkersRef.current = [];

    const geoStops = currentStops.filter(s => s.lat != null && s.lng != null);

    currentStops.forEach((stop, origIdx) => {
      if (stop.lat == null || stop.lng == null) return;
      const geoIdx = geoStops.indexOf(stop);
      const isFirst = geoIdx === 0;
      const isLast = geoIdx === geoStops.length - 1;
      const color = isFirst ? "#10b981" : isLast ? "#ef4444" : "#3b82f6";

      const marker = L.marker([stop.lat!, stop.lng!], {
        icon: makeStopIcon(L, String(stop.order), color),
        draggable: true,
        zIndexOffset: 100,
      }).addTo(map);

      marker.bindTooltip(stop.name, { direction: "top", offset: [0, -16] });

      marker.on("dragend", async (e: any) => {
        const { lat, lng } = e.target.getLatLng();
        // Update ctrlPt position in-place (same object ref in array)
        const cp = ctrlPtsRef.current.find(p => p.kind === "stop" && p.stopIdx === origIdx);
        if (cp) { cp.lat = lat; cp.lng = lng; }
        void doRoute();
        // Reverse-geocode and notify parent
        const name = await reverseGeocode(lat, lng);
        onChangeRef.current(stopsRef.current.map((s, i) =>
          i === origIdx ? { ...s, name, lat, lng } : s
        ));
      });

      stopMarkersRef.current.push(marker);
    });

    if (geoStops.length >= 2) {
      mapInst.current.fitBounds(
        LRef.current.featureGroup(stopMarkersRef.current).getBounds().pad(0.2)
      );
    } else if (geoStops.length === 1) {
      mapInst.current.setView([geoStops[0].lat!, geoStops[0].lng!], 14);
    }
  }

  // ── Waypoint management ────────────────────────────────────────────────
  function addWaypointAt(lat: number, lng: number) {
    const L = LRef.current;
    const map = mapInst.current;
    if (!L || !map) return;

    const newWp: CtrlPt = { lat, lng, kind: "wp" };
    const pts = ctrlPtsRef.current;
    const insertIdx = findInsertIdx(pts, { lat, lng });
    pts.splice(insertIdx, 0, newWp);

    const marker = L.marker([lat, lng], {
      icon: makeWpIcon(L),
      draggable: true,
      zIndexOffset: 50,
    }).addTo(map);

    // Update the shared object in ctrlPtsRef on drag
    marker.on("drag", (e: any) => {
      const { lat: nlat, lng: nlng } = e.target.getLatLng();
      newWp.lat = nlat;
      newWp.lng = nlng;
    });

    marker.on("dragend", () => { void doRoute(); });

    marker.on("contextmenu", (e: any) => {
      L.DomEvent.stopPropagation(e);
      marker.remove();
      wpMarkersRef.current = wpMarkersRef.current.filter(m => m !== marker);
      ctrlPtsRef.current = ctrlPtsRef.current.filter(p => p !== newWp);
      setHasWaypoints(wpMarkersRef.current.length > 0);
      void doRoute();
    });

    wpMarkersRef.current.push(marker);
    setHasWaypoints(true);
    void doRoute();
  }

  function clearWaypoints() {
    wpMarkersRef.current.forEach(m => m.remove());
    wpMarkersRef.current = [];
    ctrlPtsRef.current = ctrlPtsRef.current.filter(p => p.kind === "stop");
    setHasWaypoints(false);
    void doRoute();
  }

  // ── Route computation ──────────────────────────────────────────────────
  async function doRoute() {
    const map = mapInst.current;
    const L = LRef.current;
    if (!map || !L) return;

    if (routeAbortRef.current) routeAbortRef.current.abort();
    const ctl = new AbortController();
    routeAbortRef.current = ctl;

    const pts = ctrlPtsRef.current;
    if (pts.length < 2) {
      if (routeLineRef.current) { routeLineRef.current.remove(); routeLineRef.current = null; }
      setRouteInfo(null);
      return;
    }

    setRouting(true);
    try {
      const result = await osrmRoute(pts, ctl.signal);
      if (ctl.signal.aborted) return;

      if (routeLineRef.current) { routeLineRef.current.remove(); routeLineRef.current = null; }

      if (result) {
        const line = L.polyline(result.coords, {
          color: "#6366f1",
          weight: 5,
          opacity: 0.85,
          lineCap: "round",
          lineJoin: "round",
        }).addTo(map);

        // Click on route → insert adjustment waypoint at clicked point
        line.on("click", (e: any) => {
          L.DomEvent.stopPropagation(e);
          addWaypointAt(e.latlng.lat, e.latlng.lng);
        });

        routeLineRef.current = line;
        setRouteInfo({ dist: result.dist, dur: result.dur });
        onGeomRef.current?.(result.coords);
      }
    } catch {
      // aborted or network error — route line stays as-is
    } finally {
      if (!ctl.signal.aborted) setRouting(false);
    }
  }

  // ── Route optimization ─────────────────────────────────────────────────
  async function handleOptimize() {
    const geoStops = stops.map((s, i) =>
      s.lat != null && s.lng != null ? { ...s, origIdx: i } : null
    ).filter(Boolean) as (EditorStop & { lat: number; lng: number; origIdx: number })[];

    if (geoStops.length < 3) return;

    setOptimizing(true);
    try {
      const pts: LatLng[] = geoStops.map(s => ({ lat: s.lat, lng: s.lng }));
      const result = await osrmTrip(pts);
      if (!result) { toast.error("Rota optimize edilemedi. Lütfen tekrar deneyin."); return; }

      // Reconstruct optimized stop order
      // result.newOrder[inputIdx] = position in the optimized trip for that input stop
      const optimized = new Array(geoStops.length);
      result.newOrder.forEach((pos, inputIdx) => {
        optimized[pos] = geoStops[inputIdx];
      });

      const withCoords = optimized.filter(Boolean).map((s: any, i: number) => ({
        name: s.name, order: i + 1, lat: s.lat, lng: s.lng,
      }));
      const noCoords = stops
        .filter(s => s.lat == null || s.lng == null)
        .map((s, i) => ({ ...s, order: withCoords.length + i + 1 }));
      const final = [...withCoords, ...noCoords];

      // Clear waypoints (route structure changed)
      wpMarkersRef.current.forEach(m => m.remove());
      wpMarkersRef.current = [];
      setHasWaypoints(false);
      ctrlPtsRef.current = buildStopCtrlPts(final);
      onChangeRef.current(final);
    } finally {
      setOptimizing(false);
    }
  }

  // ── Stop list helpers ──────────────────────────────────────────────────
  function removeStop(idx: number) {
    onChange(stops.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 })));
  }

  function moveStop(idx: number, dir: -1 | 1) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= stops.length) return;
    const arr = [...stops];
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    onChange(arr.map((s, i) => ({ ...s, order: i + 1 })));
  }

  function updateName(idx: number, name: string) {
    onChange(stops.map((s, i) => i === idx ? { ...s, name } : s));
  }

  async function addByName() {
    if (!newName.trim()) return;
    setAdding(true);
    const coords = await forwardGeocode(newName.trim());
    const cur = stopsRef.current;
    onChangeRef.current([...cur, { name: newName.trim(), order: cur.length + 1, ...(coords ?? {}) }]);
    setNewName("");
    setAdding(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-2">
      {/* Map */}
      <div
        className="relative rounded-xl overflow-hidden border border-zinc-700"
        style={{ height: 380, isolation: "isolate" }}
      >
        <div ref={mapRef} className="w-full h-full" style={{ zIndex: 0 }} />

        {/* Spinner */}
        {(clicking || routing) && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[999] bg-zinc-900/90 text-zinc-200 text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5">
            <span className="inline-block animate-spin">⟳</span>
            {clicking ? "Konum alınıyor..." : "Rota hesaplanıyor..."}
          </div>
        )}

        {/* Route info badge */}
        {routeInfo && (
          <div className="absolute top-2 right-2 z-[999] bg-zinc-900/90 text-white text-xs px-3 py-1.5 rounded-lg flex gap-3">
            <span>📏 {fmDist(routeInfo.dist)}</span>
            <span>⏱ {fmDur(routeInfo.dur)}</span>
          </div>
        )}

        {/* Hint bar */}
        <div className="absolute bottom-2 left-2 z-[999] bg-zinc-900/75 text-zinc-400 text-[10px] px-2 py-1 rounded pointer-events-none select-none">
          Haritaya tıkla: durak ekle · Rota çizgisine tıkla: ayar noktası · Sağ tık: sil
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={handleOptimize}
          disabled={optimizing || stops.filter(s => s.lat != null).length < 3}
          className="bg-emerald-600 text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-emerald-500 disabled:opacity-50 transition-colors"
        >
          {optimizing ? "⟳ Optimize ediliyor..." : "⚡ Rota Optimize Et"}
        </button>
        {hasWaypoints && (
          <button
            onClick={clearWaypoints}
            className="bg-zinc-700 text-zinc-300 text-xs font-semibold px-3 py-2 rounded-lg hover:bg-zinc-600 transition-colors"
          >
            ✕ Ayar Noktalarını Temizle
          </button>
        )}
      </div>

      {/* Stop list */}
      {stops.length > 0 && (
        <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-0.5">
          {stops.map((stop, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === stops.length - 1;
            const dotColor = isFirst ? "bg-emerald-500" : isLast ? "bg-red-500" : "bg-blue-500";
            return (
              <div key={idx} className="flex items-center gap-1.5">
                <span className={`w-5 h-5 ${dotColor} text-white text-[10px] font-bold rounded-full flex items-center justify-center flex-shrink-0`}>
                  {stop.order}
                </span>
                <input
                  value={stop.name}
                  onChange={e => updateName(idx, e.target.value)}
                  className="flex-1 bg-zinc-800 border border-zinc-700 text-white text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-zinc-500 min-w-0"
                />
                {!stop.lat && (
                  <span className="text-amber-500 text-[10px]" title="Koordinat eksik">⚠</span>
                )}
                <button onClick={() => moveStop(idx, -1)} disabled={isFirst}
                  className="text-zinc-500 hover:text-white disabled:opacity-25 text-sm w-5 text-center">↑</button>
                <button onClick={() => moveStop(idx, 1)} disabled={isLast}
                  className="text-zinc-500 hover:text-white disabled:opacity-25 text-sm w-5 text-center">↓</button>
                <button onClick={() => removeStop(idx)}
                  className="text-zinc-600 hover:text-red-400 text-base w-5 text-center leading-none">×</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add by name */}
      <div className="flex gap-2">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addByName()}
          className="flex-1 bg-zinc-800 border border-zinc-700 text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 placeholder-zinc-600"
          placeholder="Durak adı yaz, Enter'a bas (Taksim, Kadıköy...)"
        />
        <button
          onClick={addByName}
          disabled={adding || !newName.trim()}
          className="bg-blue-600 text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {adding ? "..." : "+ Ekle"}
        </button>
      </div>
    </div>
  );
}
