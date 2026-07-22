"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Stop = { name: string; order?: number; lat?: number; lng?: number };
type Passenger = { id: string; full_name: string; pickup_lat: number; pickup_lng: number; route_id?: string; pickup_address?: string | null };
type RouteItem = {
  id: string;
  name: string;
  company_name?: string;
  vehicle_plate?: string;
  driver_name?: string;
  color: string;
  stops: Stop[];
  geometry?: [number, number][] | null;
  passengers?: Passenger[];
  vehicle_location?: VehicleLocation | null;
};
type SuggestedStop = { id: string; name: string; lat: number; lng: number; passenger_count: number; max_walking_distance_m?: number; avg_walking_distance_m?: number };
type VehicleLocation = { vehicle_id: string; plate?: string; vehicle_plate?: string; lat: number; lng: number; speed?: number | null; heading?: number | null; ignition?: number | null; recorded_at?: string; address?: string | null };
type LatLng = { lat: number; lng: number };

function injectLeafletCSS() {
  // Leaflet CSS is imported globally in app/layout.tsx.
}

function pointIcon(L: any, label: string, color: string, shape: "circle" | "square" = "circle", selected = false) {
  const radius = shape === "circle" ? "50%" : "8px";
  const border = selected ? "3px solid #facc15" : "2px solid #fff";
  const size = selected ? 34 : 28;
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;background:${color};border:${border};border-radius:${radius};display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:800;box-shadow:0 2px 8px rgba(0,0,0,.45)">${selected ? "✓" : label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function vehicleIcon(L: any, color: string, heading?: number | null) {
  const rotation = Number.isFinite(Number(heading)) ? Number(heading) : 0;
  return L.divIcon({
    className: "",
    html: `<div style="width:34px;height:34px;background:${color};border:2px solid #fff;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;font-weight:900;box-shadow:0 4px 14px rgba(0,0,0,.45);transform:rotate(${rotation}deg)">➤</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function vertexIcon(L: any, index: number) {
  return L.divIcon({
    className: "",
    html: `<div style="width:22px;height:22px;background:#facc15;border:2px solid #111827;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#111827;font-size:10px;font-weight:900;box-shadow:0 2px 8px rgba(0,0,0,.45)">${index}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function pointInPolygon(point: LatLng, polygon: LatLng[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    const intersects = ((yi > point.lat) !== (yj > point.lat)) &&
      (point.lng < (xj - xi) * (point.lat - yi) / ((yj - yi) || 1e-12) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

export default function OperationMap({ routes, selectedRouteId, onRouteSelect, suggestedStops = [], unassignedPassengers = [], selectedPassengerIds = [], onPassengerToggle, onPassengerSelectMany }: { routes: RouteItem[]; selectedRouteId?: string; onRouteSelect?: (id: string) => void; suggestedStops?: SuggestedStop[]; unassignedPassengers?: Passenger[]; selectedPassengerIds?: string[]; onPassengerToggle?: (id: string) => void; onPassengerSelectMany?: (ids: string[]) => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInst = useRef<any>(null);
  const layersRef = useRef<any[]>([]);
  const polygonLayersRef = useRef<any[]>([]);
  const lastViewportKeyRef = useRef("");
  const [polygonMode, setPolygonMode] = useState(false);
  const [polygonPoints, setPolygonPoints] = useState<LatLng[]>([]);
  const viewportKey = useMemo(() => JSON.stringify({ routes: routes.map(r => [r.id, r.stops?.length, r.passengers?.length, r.geometry?.length, r.vehicle_location?.lat, r.vehicle_location?.lng, selectedRouteId]), suggestedStops: suggestedStops.map(s => [s.id, s.lat, s.lng, s.passenger_count]), unassignedPassengers: unassignedPassengers.map(p => [p.id, p.pickup_lat, p.pickup_lng]) }), [routes, selectedRouteId, suggestedStops, unassignedPassengers]);
  const dataKey = useMemo(() => JSON.stringify({ viewportKey, selectedPassengerIds }), [viewportKey, selectedPassengerIds]);
  const selectablePassengers = useMemo(() => {
    const byId = new Map<string, Passenger>();
    routes.forEach(route => (route.passengers || []).forEach(p => byId.set(p.id, p)));
    if (!selectedRouteId) unassignedPassengers.forEach(p => byId.set(p.id, p));
    return Array.from(byId.values()).filter(p => p.pickup_lat != null && p.pickup_lng != null);
  }, [routes, selectedRouteId, unassignedPassengers]);

  useEffect(() => {
    if (!mapRef.current || mapInst.current) return;
    injectLeafletCSS();
    let active = true;
    (async () => {
      const leaflet = await import("leaflet");
      const L = (leaflet as any).default ?? leaflet;
      if (!active || !mapRef.current) return;
      try { delete (L.Icon.Default.prototype as any)._getIconUrl; } catch {}
      const map = L.map(mapRef.current, { center: [41.015, 28.979], zoom: 10, attributionControl: false, zoomControl: false });
      mapInst.current = map;
      L.control.zoom({ position: "topright" }).addTo(map);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
      setTimeout(() => map.invalidateSize(), 250);
    })();
    return () => { active = false; if (mapInst.current) { mapInst.current.remove(); mapInst.current = null; } };
  }, []);

  useEffect(() => {
    if (!mapInst.current || !polygonMode) return;
    const map = mapInst.current;
    const handler = (event: any) => {
      setPolygonPoints(prev => [...prev, { lat: event.latlng.lat, lng: event.latlng.lng }]);
    };
    map.on("click", handler);
    return () => { map.off("click", handler); };
  }, [polygonMode]);

  useEffect(() => {
    if (!mapInst.current) return;
    let active = true;
    (async () => {
      const leaflet = await import("leaflet");
      const L = (leaflet as any).default ?? leaflet;
      const map = mapInst.current;
      polygonLayersRef.current.forEach(layer => layer.remove());
      polygonLayersRef.current = [];
      if (!active || !polygonMode || polygonPoints.length === 0) return;

      polygonPoints.forEach((point, index) => {
        const marker = L.marker([point.lat, point.lng], { icon: vertexIcon(L, index + 1), interactive: false, zIndexOffset: 800 }).addTo(map);
        polygonLayersRef.current.push(marker);
      });
      if (polygonPoints.length > 1) {
        const line = polygonPoints.length >= 3
          ? L.polygon(polygonPoints.map(p => [p.lat, p.lng]), { color: "#facc15", weight: 3, opacity: 0.95, fillColor: "#facc15", fillOpacity: 0.14, interactive: false }).addTo(map)
          : L.polyline(polygonPoints.map(p => [p.lat, p.lng]), { color: "#facc15", weight: 3, opacity: 0.95, interactive: false }).addTo(map);
        polygonLayersRef.current.push(line);
      }
    })();
    return () => { active = false; };
  }, [polygonMode, polygonPoints]);

  function cancelPolygonSelection() {
    setPolygonMode(false);
    setPolygonPoints([]);
    polygonLayersRef.current.forEach(layer => layer.remove());
    polygonLayersRef.current = [];
  }

  function applyPolygonSelection() {
    if (polygonPoints.length < 3) return;
    const ids = selectablePassengers
      .filter(p => pointInPolygon({ lat: Number(p.pickup_lat), lng: Number(p.pickup_lng) }, polygonPoints))
      .map(p => p.id);
    onPassengerSelectMany?.(ids);
    cancelPolygonSelection();
  }

  useEffect(() => {
    if (!mapInst.current) return;
    let active = true;
    (async () => {
      const leaflet = await import("leaflet");
      const L = (leaflet as any).default ?? leaflet;
      const map = mapInst.current;
      layersRef.current.forEach(layer => layer.remove());
      layersRef.current = [];
      const bounds: any[] = [];
      const selectedSet = new Set(selectedPassengerIds);
      const shouldFitBounds = selectedPassengerIds.length === 0 && lastViewportKeyRef.current !== viewportKey;

      routes.forEach((route) => {
        const isSelected = !selectedRouteId || route.id === selectedRouteId;
        const opacity = isSelected ? 0.9 : 0.25;
        const stops = (route.stops || []).filter(s => s.lat != null && s.lng != null).sort((a, b) => (a.order || 0) - (b.order || 0));
        const line = Array.isArray(route.geometry) && route.geometry.length > 1 ? route.geometry : stops.map(s => [s.lat!, s.lng!] as [number, number]);
        if (line.length > 1) {
          const poly = L.polyline(line, { color: route.color, weight: isSelected ? 5 : 3, opacity, lineCap: "round", lineJoin: "round" }).addTo(map);
          poly.on("click", () => onRouteSelect?.(route.id));
          layersRef.current.push(poly);
          line.forEach(p => bounds.push(p));
        }
        stops.forEach((stop, index) => {
          const marker = L.marker([stop.lat!, stop.lng!], { icon: pointIcon(L, String(index + 1), route.color) }).addTo(map);
          marker.bindPopup(`<b>${stop.name}</b><br/>${route.name}<br/>${route.company_name || ""}`);
          marker.on("click", () => onRouteSelect?.(route.id));
          layersRef.current.push(marker);
          bounds.push([stop.lat!, stop.lng!]);
        });
        (route.passengers || []).forEach((p) => {
          const selected = selectedSet.has(p.id);
          const marker = L.marker([p.pickup_lat, p.pickup_lng], { icon: pointIcon(L, p.full_name.slice(0, 1).toLocaleUpperCase("tr-TR"), route.color, "square", selected), opacity: selected ? 1 : opacity, zIndexOffset: selected ? 400 : 0 }).addTo(map);
          marker.bindTooltip(`${p.full_name} · ${route.name}${selected ? " · Seçili" : ""}`, { direction: "top", offset: [0, -14] });
          marker.on("click", (event: any) => {
            if (polygonMode) return;
            if (onPassengerToggle) {
              L.DomEvent.stopPropagation(event);
              onPassengerToggle(p.id);
            }
          });
          layersRef.current.push(marker);
          bounds.push([p.pickup_lat, p.pickup_lng]);
        });
        if (route.vehicle_location?.lat != null && route.vehicle_location?.lng != null) {
          const location = route.vehicle_location;
          const speed = location.speed == null ? "—" : `${Math.round(Number(location.speed))} km/s`;
          const ignition = location.ignition == null ? "—" : Number(location.ignition) ? "Açık" : "Kapalı";
          const marker = L.marker([location.lat, location.lng], { icon: vehicleIcon(L, route.color, location.heading), zIndexOffset: 500 }).addTo(map);
          marker.bindPopup(`<b>${location.vehicle_plate || location.plate || route.vehicle_plate || "Araç"}</b><br/>${route.name}<br/>Hız: ${speed}<br/>Kontak: ${ignition}<br/>Son veri: ${location.recorded_at || "—"}`);
          marker.on("click", () => onRouteSelect?.(route.id));
          layersRef.current.push(marker);
          bounds.push([location.lat, location.lng]);
        }
      });

      suggestedStops.forEach((stop, index) => {
        const marker = L.marker([stop.lat, stop.lng], { icon: pointIcon(L, String(stop.passenger_count || index + 1), "#f97316") }).addTo(map);
        marker.bindPopup(`<b>${stop.name}</b><br/>${stop.passenger_count} personel<br/>Ort. yürüme: ${stop.avg_walking_distance_m ?? 0} m<br/>Maks: ${stop.max_walking_distance_m ?? 0} m`);
        layersRef.current.push(marker);
        bounds.push([stop.lat, stop.lng]);
      });

      if (!selectedRouteId) {
        unassignedPassengers.forEach((p) => {
          const selected = selectedSet.has(p.id);
          const marker = L.marker([p.pickup_lat, p.pickup_lng], { icon: pointIcon(L, p.full_name.slice(0, 1).toLocaleUpperCase("tr-TR"), "#64748b", "square", selected), zIndexOffset: selected ? 400 : 0 }).addTo(map);
          marker.bindTooltip(`${p.full_name} · ${p.route_id ? "Aktif harita rotasında değil" : "Güzergaha atanmamış"}${selected ? " · Seçili" : ""}`, { direction: "top", offset: [0, -14] });
          marker.on("click", (event: any) => {
            if (polygonMode) return;
            if (onPassengerToggle) {
              L.DomEvent.stopPropagation(event);
              onPassengerToggle(p.id);
            }
          });
          layersRef.current.push(marker);
          bounds.push([p.pickup_lat, p.pickup_lng]);
        });
      }

      if (active && bounds.length > 0 && shouldFitBounds) {
        map.fitBounds(L.latLngBounds(bounds), { padding: [32, 32] });
        lastViewportKeyRef.current = viewportKey;
      }
    })();
    return () => { active = false; };
  }, [dataKey, viewportKey, routes, selectedRouteId, onRouteSelect, suggestedStops, unassignedPassengers, selectedPassengerIds, onPassengerToggle, polygonMode]);

  return (
    <div className="relative">
      <div ref={mapRef} className="h-[520px] min-h-[420px] w-full rounded-2xl border border-zinc-800 bg-zinc-900" />
      <div className="absolute left-3 top-3 z-[999] flex max-w-[calc(100%-1.5rem)] flex-wrap gap-2">
        {!polygonMode ? (
          <button onClick={() => { setPolygonMode(true); setPolygonPoints([]); }} className="rounded-xl bg-yellow-400 px-3 py-2 text-xs font-black text-zinc-950 shadow-lg hover:bg-yellow-300">
            Çokgen seçim
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-yellow-500/70 bg-zinc-950/90 p-2 shadow-xl backdrop-blur">
            <span className="px-1 text-xs font-semibold text-yellow-100">Haritaya tıklayın · Nokta: {polygonPoints.length}</span>
            <button onClick={() => setPolygonPoints(points => points.slice(0, -1))} disabled={polygonPoints.length === 0} className="rounded-lg border border-yellow-700 px-2 py-1 text-xs font-semibold text-yellow-100 disabled:opacity-40">Geri al</button>
            <button onClick={applyPolygonSelection} disabled={polygonPoints.length < 3} className="rounded-lg bg-emerald-500 px-2 py-1 text-xs font-black text-zinc-950 disabled:opacity-40">Alanı seç</button>
            <button onClick={cancelPolygonSelection} className="rounded-lg border border-zinc-700 px-2 py-1 text-xs font-semibold text-zinc-200">İptal</button>
          </div>
        )}
      </div>
    </div>
  );
}
