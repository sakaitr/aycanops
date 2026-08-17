"use client";
import { useEffect, useRef } from "react";

// ── Types ─────────────────────────────────────────────────────────────────
export interface EditorStop { name: string; order: number; lat?: number; lng?: number; is_company_location?: boolean; auto_generated?: boolean; passenger_ids?: string[]; passengers?: Array<{ id: string; name: string; walking_distance_m?: number }> }

export interface PersonnelMarker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  routeColor?: string;
}

export interface OverviewRoute {
  id: string;
  name: string;
  color: string;
  stops: EditorStop[];
  geometry?: [number, number][];
}

interface Props {
  mode: "edit" | "overview";
  // Edit mode
  stops?: EditorStop[];
  onStopsChange?: (stops: EditorStop[]) => void;
  onGeometryChange?: (coords: [number, number][]) => void;
  // Overview mode
  overviewRoutes?: OverviewRoute[];
  selectedRouteId?: string;
  onRouteClick?: (id: string) => void;
  // Both modes
  personnel?: PersonnelMarker[];
  onPersonnelClick?: (id: string) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function injectLeafletCSS() {
  // Leaflet CSS is imported globally in app/layout.tsx.
}

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

async function osrmRoute(
  pts: Array<{ lat: number; lng: number }>,
  signal?: AbortSignal
): Promise<[number, number][] | null> {
  if (pts.length < 2) return null;
  try {
    const r = await fetch("/api/routing/directions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points: pts }),
      signal: signal ?? AbortSignal.timeout(12000),
    });
    const d = await r.json();
    return d.ok && d.data ? d.data.coordinates : null;
  } catch {
    return null;
  }
}

function distToSeg(p: { lat: number; lng: number }, a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dx = b.lng - a.lng, dy = b.lat - a.lat;
  if (dx === 0 && dy === 0) return Math.hypot(p.lat - a.lat, p.lng - a.lng);
  const t = Math.max(0, Math.min(1,
    ((p.lat - a.lat) * dy + (p.lng - a.lng) * dx) / (dx * dx + dy * dy)
  ));
  return Math.hypot(p.lat - (a.lat + t * dy), p.lng - (a.lng + t * dx));
}

function findInsertIdx(pts: Array<{ lat: number; lng: number }>, click: { lat: number; lng: number }): number {
  if (pts.length < 2) return pts.length;
  let best = Infinity, bestIdx = pts.length;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distToSeg(click, pts[i], pts[i + 1]);
    if (d < best) { best = d; bestIdx = i + 1; }
  }
  return bestIdx;
}

function makeStopIcon(L: any, label: string, color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:30px;height:30px;background:${color};border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.55)">${label}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function makeSmallStopIcon(L: any, color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:10px;height:10px;background:${color};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
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

function makePersonnelIcon(L: any, initial: string, color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:28px;height:28px;background:${color};border:2px solid #fff;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,.5)">${initial}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

// ── Ctrl point: stop or waypoint ──────────────────────────────────────────
interface CtrlPt { lat: number; lng: number; kind: "stop" | "wp"; stopIdx?: number }

function isCompanyStop(stop: EditorStop) {
  return stop.is_company_location === true;
}

function insertBeforeCompanyStop(stops: EditorStop[], stop: EditorStop) {
  const companyIdx = stops.findIndex(isCompanyStop);
  const next = [...stops];
  if (companyIdx >= 0) next.splice(companyIdx, 0, stop);
  else next.push(stop);
  return next.map((item, index) => ({ ...item, order: index + 1 }));
}

// ── Component ─────────────────────────────────────────────────────────────
export default function RouteFullMap(props: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInst = useRef<any>(null);
  const LRef = useRef<any>(null);

  // Layer cleanup refs
  const stopMarkersRef = useRef<any[]>([]);
  const wpMarkersRef = useRef<any[]>([]);
  const routeLineRef = useRef<any>(null);
  const personnelMarkersRef = useRef<any[]>([]);
  const overviewLayersRef = useRef<any[]>([]);

  // Ctrl points (stops + inserted waypoints in edit mode)
  const ctrlPtsRef = useRef<CtrlPt[]>([]);

  // Live refs for callbacks (avoid stale closures)
  const propsRef = useRef(props);
  const routeAbortRef = useRef<AbortController | null>(null);

  // Keep propsRef always fresh
  useEffect(() => { propsRef.current = props; });

  // ── Init map ────────────────────────────────────────────────────────────
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

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OSM",
      }).addTo(map);

      // Map click: only in edit mode → add stop
      map.on("click", async (e: any) => {
        if (propsRef.current.mode !== "edit") return;
        const { lat, lng } = e.latlng;
        const name = await reverseGeocode(lat, lng);
        const cur = propsRef.current.stops || [];
        propsRef.current.onStopsChange?.(insertBeforeCompanyStop(cur, { name, order: cur.length + 1, lat, lng }));
      });

      setTimeout(() => {
        if (!active || !mapInst.current) return;
        map.invalidateSize();
        renderAll();
      }, 400);
    })();

    return () => {
      active = false;
      if (mapInst.current) { mapInst.current.remove(); mapInst.current = null; }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Re-render on mode and data changes ─────────────────────────────────
  useEffect(() => {
    if (!mapInst.current || !LRef.current) return;
    renderAll();
  }, [ // eslint-disable-line react-hooks/exhaustive-deps
    props.mode,
    // stringify the minimal data to detect real changes
    JSON.stringify((props.stops || []).map(s => `${s.lat},${s.lng},${s.name}`)),
    JSON.stringify((props.stops || []).map(s => `${s.order}:${s.is_company_location ? 1 : 0}`)),
    JSON.stringify((props.overviewRoutes || []).map(r => `${r.id}:${r.stops?.length}`)),
    props.selectedRouteId,
    JSON.stringify((props.personnel || []).map(p => `${p.id}:${p.lat}:${p.lng}`)),
  ]);

  // ── Main render controller ──────────────────────────────────────────────
  function renderAll() {
    const L = LRef.current;
    const map = mapInst.current;
    if (!L || !map) return;

    clearEditLayers();
    clearOverviewLayers();
    clearPersonnelLayers();

    if (propsRef.current.mode === "edit") {
      renderEditStops(propsRef.current.stops || []);
      doRoute(propsRef.current.stops || []);
    } else {
      renderOverview(propsRef.current.overviewRoutes || [], propsRef.current.selectedRouteId);
    }
    renderPersonnel(propsRef.current.personnel || []);
  }

  function clearEditLayers() {
    stopMarkersRef.current.forEach(m => m.remove());
    stopMarkersRef.current = [];
    wpMarkersRef.current.forEach(m => m.remove());
    wpMarkersRef.current = [];
    if (routeLineRef.current) { routeLineRef.current.remove(); routeLineRef.current = null; }
    ctrlPtsRef.current = [];
  }

  function clearOverviewLayers() {
    overviewLayersRef.current.forEach(l => l.remove());
    overviewLayersRef.current = [];
  }

  function clearPersonnelLayers() {
    personnelMarkersRef.current.forEach(m => m.remove());
    personnelMarkersRef.current = [];
  }

  // ── Edit mode: stop markers ─────────────────────────────────────────────
  function renderEditStops(currentStops: EditorStop[]) {
    const L = LRef.current;
    const map = mapInst.current;
    if (!L || !map) return;

    // Build ctrl pts from stops only (waypoints cleared when stops change from parent)
    ctrlPtsRef.current = currentStops
      .filter(s => s.lat != null && s.lng != null)
      .map((s, i) => ({ lat: s.lat!, lng: s.lng!, kind: "stop" as const, stopIdx: i }));

    const geoStops = currentStops.filter(s => s.lat != null && s.lng != null);

    currentStops.forEach((stop, origIdx) => {
      if (stop.lat == null || stop.lng == null) return;
      const geoIdx = geoStops.indexOf(stop);
      const isFirst = geoIdx === 0;
      const fixedCompany = isCompanyStop(stop);
      const isLast = fixedCompany || geoIdx === geoStops.length - 1;
      const color = fixedCompany ? "#ef4444" : isFirst ? "#10b981" : isLast ? "#ef4444" : "#3b82f6";

      const marker = L.marker([stop.lat!, stop.lng!], {
        icon: makeStopIcon(L, fixedCompany ? "F" : String(stop.order), color),
        draggable: !fixedCompany,
        zIndexOffset: 200,
      }).addTo(map);

      marker.bindTooltip(fixedCompany ? `${stop.name} · Sabit son durak` : stop.name, { direction: "top", offset: [0, -16] });

      marker.on("dragend", async (e: any) => {
        if (fixedCompany) return;
        const { lat, lng } = e.target.getLatLng();
        // Update ctrl pt in place
        const cp = ctrlPtsRef.current.find(p => p.kind === "stop" && p.stopIdx === origIdx);
        if (cp) { cp.lat = lat; cp.lng = lng; }
        void doRoute(propsRef.current.stops || []);
        const name = await reverseGeocode(lat, lng);
        propsRef.current.onStopsChange?.(
          (propsRef.current.stops || []).map((s, i) => i === origIdx ? { ...s, name, lat, lng } : s)
        );
      });

      stopMarkersRef.current.push(marker);
    });

    if (geoStops.length >= 2) {
      const group = LRef.current.featureGroup(stopMarkersRef.current);
      mapInst.current.fitBounds(group.getBounds().pad(0.25));
    } else if (geoStops.length === 1) {
      mapInst.current.setView([geoStops[0].lat!, geoStops[0].lng!], 14);
    }
  }

  // ── Edit mode: OSRM route line ──────────────────────────────────────────
  async function doRoute(currentStops: EditorStop[]) {
    const L = LRef.current;
    const map = mapInst.current;
    if (!L || !map) return;

    if (routeAbortRef.current) routeAbortRef.current.abort();
    const ctl = new AbortController();
    routeAbortRef.current = ctl;

    const pts = ctrlPtsRef.current;
    if (pts.length < 2) {
      if (routeLineRef.current) { routeLineRef.current.remove(); routeLineRef.current = null; }
      return;
    }

    try {
      const coords = await osrmRoute(pts, ctl.signal);
      if (ctl.signal.aborted) return;

      if (routeLineRef.current) { routeLineRef.current.remove(); routeLineRef.current = null; }
      if (!coords) return;

      const line = L.polyline(coords, {
        color: "#6366f1",
        weight: 5,
        opacity: 0.9,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map);

      // Click on route line → add adjustment waypoint
      line.on("click", (e: any) => {
        L.DomEvent.stopPropagation(e);
        addWaypoint(e.latlng.lat, e.latlng.lng);
      });

      routeLineRef.current = line;
      propsRef.current.onGeometryChange?.(coords);
    } catch {
      // aborted
    }
  }

  function addWaypoint(lat: number, lng: number) {
    const L = LRef.current;
    const map = mapInst.current;
    if (!L || !map) return;

    const newWp: CtrlPt = { lat, lng, kind: "wp" };
    const insertIdx = findInsertIdx(ctrlPtsRef.current, { lat, lng });
    ctrlPtsRef.current.splice(insertIdx, 0, newWp);

    const marker = L.marker([lat, lng], {
      icon: makeWpIcon(L),
      draggable: true,
      zIndexOffset: 100,
    }).addTo(map);

    marker.on("drag", (e: any) => {
      const { lat: nlat, lng: nlng } = e.target.getLatLng();
      newWp.lat = nlat;
      newWp.lng = nlng;
    });

    marker.on("dragend", () => {
      void doRoute(propsRef.current.stops || []);
    });

    marker.on("contextmenu", (e: any) => {
      L.DomEvent.stopPropagation(e);
      marker.remove();
      wpMarkersRef.current = wpMarkersRef.current.filter(m => m !== marker);
      ctrlPtsRef.current = ctrlPtsRef.current.filter(p => p !== newWp);
      void doRoute(propsRef.current.stops || []);
    });

    wpMarkersRef.current.push(marker);
    void doRoute(propsRef.current.stops || []);
  }

  // ── Overview mode ───────────────────────────────────────────────────────
  function renderOverview(routes: OverviewRoute[], selectedId?: string) {
    const L = LRef.current;
    const map = mapInst.current;
    if (!L || !map) return;

    const allLatLngs: [number, number][] = [];

    routes.forEach(route => {
      const isSelected = route.id === selectedId;
      const weight = isSelected ? 6 : 4;
      const opacity = isSelected ? 1 : 0.6;
      const color = route.color;

      // Draw geometry if stored, otherwise straight line segments between stops
      const geoStops = route.stops.filter(s => s.lat != null && s.lng != null);
      const latlngs: [number, number][] = geoStops.map(s => [s.lat!, s.lng!]);

      let lineCoords: [number, number][] = route.geometry || latlngs;

      if (lineCoords.length > 1) {
        const polyline = L.polyline(lineCoords, {
          color,
          weight: isSelected ? weight : weight,
          opacity,
          lineCap: "round",
          lineJoin: "round",
          dashArray: isSelected ? undefined : "1 0",
        }).addTo(map);

        polyline.bindTooltip(route.name, { sticky: true, direction: "top" });
        polyline.on("click", () => propsRef.current.onRouteClick?.(route.id));
        overviewLayersRef.current.push(polyline);

        lineCoords.forEach(ll => allLatLngs.push(ll));
      }

      // Small stop markers
      geoStops.forEach((stop, i) => {
        const isFirst = i === 0;
        const isLast = i === geoStops.length - 1;
        const stopColor = isFirst ? "#10b981" : isLast ? "#ef4444" : color;
        const m = L.marker([stop.lat!, stop.lng!], {
          icon: isFirst || isLast ? makeStopIcon(L, isFirst ? "B" : "V", stopColor) : makeSmallStopIcon(L, stopColor),
          zIndexOffset: isFirst || isLast ? 100 : 0,
        }).addTo(map);
        m.bindTooltip(`${route.name}: ${stop.name}`, { direction: "top" });
        overviewLayersRef.current.push(m);
        allLatLngs.push([stop.lat!, stop.lng!]);
      });
    });

    if (allLatLngs.length >= 2) {
      map.fitBounds(L.latLngBounds(allLatLngs), { padding: [40, 40] });
    } else if (allLatLngs.length === 1) {
      map.setView(allLatLngs[0], 14);
    }
  }

  // ── Personnel markers (both modes) ──────────────────────────────────────
  function renderPersonnel(personnel: PersonnelMarker[]) {
    const L = LRef.current;
    const map = mapInst.current;
    if (!L || !map) return;

    personnel.filter(p => p.lat != null && p.lng != null).forEach(person => {
      const initial = person.name.charAt(0).toUpperCase();
      const color = person.routeColor || "#8b5cf6";

      const marker = L.marker([person.lat, person.lng], {
        icon: makePersonnelIcon(L, initial, color),
        zIndexOffset: 50,
      }).addTo(map);

      marker.bindTooltip(`<b>${person.name}</b>`, { direction: "top", offset: [0, -14] });
      marker.on("click", () => propsRef.current.onPersonnelClick?.(person.id));
      personnelMarkersRef.current.push(marker);
    });
  }

  return (
    <div ref={mapRef} className="w-full h-full" style={{ zIndex: 0 }} />
  );
}
