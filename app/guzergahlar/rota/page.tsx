"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Nav from "@/components/Nav";
import ComboboxSearch from "@/components/ComboboxSearch";
import type { EditorStop, OverviewRoute, PersonnelMarker } from "@/components/RouteFullMap";
import { hasPermission } from "@/lib/permissions";

const ROUTE_COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316", "#ec4899",
  "#84cc16", "#14b8a6",
];

const DIR_LABELS: Record<string, string> = {
  both: "Sabah + Akşam",
  morning: "Sadece Sabah",
  evening: "Sadece Akşam",
};

const SCHEDULE_LABELS: Record<string, string> = {
  fixed: "Sabit sabah/akşam",
  shift: "Vardiya",
};

type Stop = EditorStop;

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function isCompanyStop(stop: Stop) {
  return stop.is_company_location === true;
}

function renumberStops(stops: Stop[]) {
  return stops.map((stop, index) => ({ ...stop, order: index + 1 }));
}

function upsertCompanyStop(stops: Stop[], companyStop: Stop | null) {
  const withoutCompany = stops.filter(stop => !isCompanyStop(stop));
  if (!companyStop) return renumberStops(stops);
  return renumberStops([...withoutCompany, { ...companyStop, is_company_location: true }]);
}

function insertBeforeCompanyStop(stops: Stop[], stop: Stop) {
  const companyIdx = stops.findIndex(isCompanyStop);
  const next = [...stops];
  if (companyIdx >= 0) next.splice(companyIdx, 0, stop);
  else next.push(stop);
  return renumberStops(next);
}

function normalizePersonName(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("tr-TR");
}

function orderStopsTowardDestination(stops: Array<Stop & { lat: number; lng: number }>, destination: { lat: number; lng: number }) {
  if (stops.length <= 1) return stops;
  const start = [...stops].sort((a, b) => distanceMeters(b, destination) - distanceMeters(a, destination))[0];
  const remaining = stops.filter(stop => stop !== start);
  const ordered: Array<Stop & { lat: number; lng: number }> = [start];

  while (remaining.length > 0) {
    const current = ordered[ordered.length - 1];
    const currentToDestination = distanceMeters(current, destination);
    remaining.sort((a, b) => {
      const aToDestination = distanceMeters(a, destination);
      const bToDestination = distanceMeters(b, destination);
      const aBacktrack = Math.max(0, aToDestination - currentToDestination + 120);
      const bBacktrack = Math.max(0, bToDestination - currentToDestination + 120);
      const aCost = distanceMeters(current, a) + aBacktrack * 4 + aToDestination * 0.08;
      const bCost = distanceMeters(current, b) + bBacktrack * 4 + bToDestination * 0.08;
      return aCost - bCost;
    });
    ordered.push(remaining.shift()!);
  }

  return ordered;
}

interface Route {
  id: string;
  name: string;
  code?: string;
  direction: string;
  capacity?: number | null;
  schedule_mode?: "fixed" | "shift" | string | null;
  shift_name?: string | null;
  morning_departure?: string | null;
  morning_arrival?: string | null;
  evening_departure?: string | null;
  evening_arrival?: string | null;
  is_active: number;
  driver_name?: string;
  stops_json?: string;
  route_geometry?: string;
  company_id?: string;
}

interface Personnel {
  id: string;
  full_name: string;
  pickup_address?: string;
  pickup_lat?: number;
  pickup_lng?: number;
  route_id?: string;
  phone?: string;
}

interface BulkNamePreview {
  valid: Personnel[];
  alreadySelected: Personnel[];
  duplicateInput: string[];
  notFound: string[];
  noCoords: Personnel[];
  otherRoute: Personnel[];
  ambiguous: { input: string; matches: Personnel[] }[];
}

// Geocode a free-text address
async function geocodeAddress(addr: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr + ", İstanbul")}&limit=1&countrycodes=tr`,
      { signal: AbortSignal.timeout(10000) }
    );
    const d = await r.json();
    if (d?.[0]) return { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) };
  } catch {}
  return null;
}

async function osrmRoute(stops: Stop[]): Promise<[number, number][] | null> {
  const pts = stops.filter(s => s.lat != null && s.lng != null);
  if (pts.length < 2) return null;
  try {
    const r = await fetch("/api/routing/directions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points: pts.map(s => ({ lat: s.lat, lng: s.lng })) }),
      signal: AbortSignal.timeout(12000),
    });
    const d = await r.json();
    return d.ok && d.data ? d.data.coordinates : null;
  } catch { return null; }
}

// Dynamic import for map (no SSR)
const RouteFullMap = dynamic(() => import("@/components/RouteFullMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-zinc-950 text-zinc-600 text-sm">
      Harita yükleniyor...
    </div>
  ),
});

export default function RotaPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [routes, setRoutes] = useState<Route[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [companyStop, setCompanyStop] = useState<Stop | null>(null);
  const [pendingRouteId, setPendingRouteId] = useState<string | null>(null);

  // Mobile tab: "list" shows sidebar, "map" shows map
  const [mobileTab, setMobileTab] = useState<"map" | "list">("list");

  // Edit state
  const [editRoute, setEditRoute] = useState<Route | null>(null);
  const [editStops, setEditStops] = useState<Stop[]>([]);
  const [editGeometry, setEditGeometry] = useState<[number, number][] | null>(null);
  const [editPersonnel, setEditPersonnel] = useState<Personnel[]>([]);
  const [saving, setSaving] = useState(false);
  const [selectedStopPassengerIds, setSelectedStopPassengerIds] = useState<string[]>([]);
  const [stopSuggesting, setStopSuggesting] = useState(false);
  const [routeMaxWalkMeters, setRouteMaxWalkMeters] = useState(500);
  const [editCapacity, setEditCapacity] = useState("");
  const [editScheduleMode, setEditScheduleMode] = useState<"fixed" | "shift">("fixed");
  const [editShiftName, setEditShiftName] = useState("");
  const [editDirection, setEditDirection] = useState("both");
  const [editMorningDeparture, setEditMorningDeparture] = useState("");
  const [editMorningArrival, setEditMorningArrival] = useState("");
  const [editEveningDeparture, setEditEveningDeparture] = useState("");
  const [editEveningArrival, setEditEveningArrival] = useState("");
  const [bulkNamesText, setBulkNamesText] = useState("");
  const [bulkPreview, setBulkPreview] = useState<BulkNamePreview | null>(null);

  // Add personnel form
  const [showAddPersonnel, setShowAddPersonnel] = useState(false);
  const [newPersonForm, setNewPersonForm] = useState({ name: "", address: "", phone: "" });
  const [addingPerson, setAddingPerson] = useState(false);

  // Overview map data
  const [overviewRoutes, setOverviewRoutes] = useState<OverviewRoute[]>([]);
  const [selectedOverviewRouteId, setSelectedOverviewRouteId] = useState<string | undefined>();

  // Planner state
  const [showPlanner, setShowPlanner] = useState(false);
  const [plannerDepotAddr, setPlannerDepotAddr] = useState("");
  const [plannerDepotCoords, setPlannerDepotCoords] = useState<{lat:number;lng:number}|null>(null);
  const [plannerVehicles, setPlannerVehicles] = useState<{id:string;label:string;capacity:number}[]>([]);
  const [plannerRunning, setPlannerRunning] = useState(false);
  const [planResult, setPlanResult] = useState<any>(null);

  // Stop add form
  const [newStopName, setNewStopName] = useState("");
  const [addingStop, setAddingStop] = useState(false);

  const mode = editRoute ? "edit" : "overview";

  // ── Auth + initial load ───────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data);
      else router.replace("/login");
    }).catch(() => router.replace("/login"));
    fetch("/api/companies").then(r => r.json()).then(d => {
      if (d.ok) setCompanies(d.data);
    });
    const params = new URLSearchParams(window.location.search);
    const companyId = params.get("company_id") || "";
    const routeId = params.get("route_id") || "";
    if (companyId) setSelectedCompany(companyId);
    if (routeId) setPendingRouteId(routeId);
  }, []);

  // ── Load routes when company changes ─────────────────────────────────
  useEffect(() => {
    setEditRoute(null);
    setPersonnel([]);
    setRoutes([]);
    setShowPlanner(false);
    setPlanResult(null);
    setPlannerVehicles([]);
    setCompanyStop(null);
    if (!selectedCompany) return;
    loadRoutes();
    loadPersonnel();
    loadCompanyStop(selectedCompany);
  }, [selectedCompany]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pendingRouteId || routes.length === 0) return;
    const route = routes.find(r => r.id === pendingRouteId);
    if (!route) return;
    setPendingRouteId(null);
    void openEdit(route);
  }, [pendingRouteId, routes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!editRoute || !companyStop) return;
    setEditStops(stops => upsertCompanyStop(stops, companyStop));
  }, [companyStop, editRoute]);

  async function loadCompanyStop(companyId: string) {
    try {
      const companyRes = await fetch(`/api/companies/${companyId}`);
      const companyJson = await companyRes.json();
      if (!companyJson.ok) return;
      const company = companyJson.data;
      const baseName = String(company.name || "").trim();
      const queries = [
        String(company.address || "").trim(),
        baseName ? `${baseName} Türkiye` : "",
        baseName ? `${baseName} Kocaeli Türkiye` : "",
        baseName ? `${baseName} Gebze Kocaeli Türkiye` : "",
        baseName ? `${baseName} Dilovası Kocaeli Türkiye` : "",
      ].filter(Boolean);
      let geoData: any = null;
      for (const query of queries) {
        const geoRes = await fetch(`/api/geocode/cache?q=${encodeURIComponent(query)}`);
        const geoJson = await geoRes.json().catch(() => ({}));
        if (geoJson.ok && geoJson.data?.lat != null && geoJson.data?.lng != null) {
          geoData = geoJson.data;
          break;
        }
      }
      if (!geoData) return;
      setCompanyStop({
        name: `${company.name || "Firma"} lokasyonu`,
        order: 1,
        lat: Number(geoData.lat),
        lng: Number(geoData.lng),
        is_company_location: true,
      });
    } catch {}
  }

  async function loadRoutes() {
    setLoadingRoutes(true);
    try {
      const r = await fetch(`/api/routes?company_id=${selectedCompany}`);
      const d = await r.json();
      if (d.ok) {
        setRoutes(d.data);
        setPlannerVehicles((d.data as Route[]).map((rt, i) => ({
          id: `v${i}`,
          label: rt.name,
          capacity: 14,
        })));
      }
    } finally { setLoadingRoutes(false); }
  }

  async function loadPersonnel() {
    const r = await fetch(`/api/yolcular?company_id=${selectedCompany}&type=personel&status=aktif`);
    const d = await r.json();
    if (d.ok) setPersonnel(d.data);
  }

  // ── Build overview routes for the map ────────────────────────────────
  useEffect(() => {
    const ov: OverviewRoute[] = routes.map((r, idx) => {
      const stops: Stop[] = (() => { try { return JSON.parse(r.stops_json || "[]"); } catch { return []; } })();
      const geometry: [number, number][] | undefined = (() => { try { return r.route_geometry ? JSON.parse(r.route_geometry) : undefined; } catch { return undefined; } })();
      return {
        id: r.id,
        name: r.name,
        color: ROUTE_COLORS[idx % ROUTE_COLORS.length],
        stops,
        geometry,
      };
    });
    setOverviewRoutes(ov);
  }, [routes]);

  // ── Personnel markers for overview map ───────────────────────────────
  const personnelMarkers: PersonnelMarker[] = personnel
    .filter(p => p.pickup_lat != null && p.pickup_lng != null)
    .map(p => {
      const route = routes.find(r => r.id === p.route_id);
      const routeIdx = routes.indexOf(route!);
      return {
        id: p.id,
        name: p.full_name,
        lat: p.pickup_lat!,
        lng: p.pickup_lng!,
        routeColor: route ? ROUTE_COLORS[routeIdx % ROUTE_COLORS.length] : "#8b5cf6",
      };
    });

  // ── Personnel markers for edit mode (this route only) ────────────────
  const editPersonnelMarkers: PersonnelMarker[] = editPersonnel
    .filter(p => p.pickup_lat != null && p.pickup_lng != null)
    .map(p => ({
      id: p.id,
      name: p.full_name,
      lat: p.pickup_lat!,
      lng: p.pickup_lng!,
      routeColor: editRoute ? ROUTE_COLORS[routes.indexOf(editRoute) % ROUTE_COLORS.length] : "#8b5cf6",
    }));

  // ── Open route for editing ────────────────────────────────────────────
  async function openEdit(r: Route) {
    const stops: Stop[] = (() => { try { return JSON.parse(r.stops_json || "[]"); } catch { return []; } })();
    const geometry: [number, number][] | null = (() => { try { return r.route_geometry ? JSON.parse(r.route_geometry) : null; } catch { return null; } })();
    setEditRoute(r);
    setEditStops(upsertCompanyStop(stops, companyStop));
    setEditGeometry(geometry);
    setShowAddPersonnel(false);
    setNewStopName("");
    setSelectedStopPassengerIds([]);
    setEditCapacity(r.capacity == null ? "" : String(r.capacity));
    setEditScheduleMode(r.schedule_mode === "shift" ? "shift" : "fixed");
    setEditShiftName(r.shift_name || "");
    setEditDirection(r.direction || "both");
    setEditMorningDeparture(r.morning_departure || "");
    setEditMorningArrival(r.morning_arrival || "");
    setEditEveningDeparture(r.evening_departure || "");
    setEditEveningArrival(r.evening_arrival || "");
    setBulkNamesText("");
    setBulkPreview(null);
    setMobileTab("list"); // show edit controls on mobile

    // Load personnel assigned to this route
    const pr = await fetch(`/api/yolcular?route_id=${r.id}`);
    const pd = await pr.json();
    if (pd.ok) setEditPersonnel(pd.data);
  }

  function cancelEdit() {
    setEditRoute(null);
    setEditStops([]);
    setEditGeometry(null);
    setEditPersonnel([]);
    setShowAddPersonnel(false);
    setSelectedStopPassengerIds([]);
    setEditCapacity("");
    setEditScheduleMode("fixed");
    setEditShiftName("");
    setEditDirection("both");
    setEditMorningDeparture("");
    setEditMorningArrival("");
    setEditEveningDeparture("");
    setEditEveningArrival("");
    setBulkNamesText("");
    setBulkPreview(null);
  }

  async function deleteRoute(route: Route) {
    if (!confirm(`${route.name} kalıcı olarak silinsin mi?\n\nBu işlem personellerin bu güzergahtan çıkarılmasına neden olur, geri alınamaz.`)) return;
    const res = await fetch(`/api/routes/${route.id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (!d.ok) { alert(d.error || "Güzergah silinemedi"); return; }
    if (editRoute?.id === route.id) cancelEdit();
    await loadRoutes();
    await loadPersonnel();
  }

  // ── Save route ────────────────────────────────────────────────────────
  async function saveRoute() {
    if (!editRoute) return;
    setSaving(true);
    try {
      const finalStops = upsertCompanyStop(editStops, companyStop);
      const stopPassengerIds = Array.from(new Set(finalStops.flatMap(stop => [
        ...(stop.passenger_ids ?? []),
        ...((stop.passengers ?? []).map(passenger => passenger.id)),
      ])));
      const parsedCapacity = editCapacity.trim() ? Number(editCapacity) : null;
      if (parsedCapacity != null && (!Number.isFinite(parsedCapacity) || parsedCapacity < 0 || parsedCapacity > 1000)) {
        alert("Kapasite 0-1000 arasında olmalı.");
        return;
      }
      if (parsedCapacity != null && stopPassengerIds.length > parsedCapacity) {
        alert(`Kapasite aşıldı: ${stopPassengerIds.length}/${parsedCapacity} personel. Kapasiteyi artırın veya seçimi azaltın.`);
        return;
      }
      const body = {
        stops_json: finalStops.map(({ name, order, lat, lng, is_company_location, auto_generated, passenger_ids, passengers }) => ({ name, order, lat, lng, is_company_location, auto_generated, passenger_ids, passengers })),
        route_geometry: editGeometry,
        company_id: selectedCompany || editRoute.company_id,
        passenger_ids: stopPassengerIds,
        capacity: parsedCapacity,
        schedule_mode: editScheduleMode,
        shift_name: editScheduleMode === "shift" ? (editShiftName.trim() || null) : null,
        direction: editDirection,
        morning_departure: editMorningDeparture || null,
        morning_arrival: editMorningArrival || null,
        evening_departure: editEveningDeparture || null,
        evening_arrival: editEveningArrival || null,
      };
      const res = await fetch(`/api/routes/${editRoute.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!d.ok) { alert(d.error || "Kayıt hatası"); return; }
      await loadRoutes();
      await loadPersonnel();
      cancelEdit();
    } finally {
      setSaving(false);
    }
  }

  // ── Stop management ───────────────────────────────────────────────────
  async function addStopByName() {
    if (!newStopName.trim()) return;
    setAddingStop(true);
    const coords = await geocodeAddress(newStopName.trim());
    const newStop: Stop = {
      name: newStopName.trim(),
      order: editStops.length + 1,
      ...(coords ?? {}),
    };
    setEditStops(s => insertBeforeCompanyStop(s, newStop));
    setNewStopName("");
    setAddingStop(false);
  }

  function removeStop(idx: number) {
    setEditStops(s => isCompanyStop(s[idx]) ? s : renumberStops(s.filter((_, i) => i !== idx)));
  }

  function moveStop(idx: number, dir: -1 | 1) {
    const ni = idx + dir;
    if (ni < 0 || ni >= editStops.length) return;
    if (isCompanyStop(editStops[idx]) || isCompanyStop(editStops[ni])) return;
    const arr = [...editStops];
    [arr[idx], arr[ni]] = [arr[ni], arr[idx]];
    setEditStops(renumberStops(arr));
  }

  function updateStopName(idx: number, name: string) {
    setEditStops(s => s.map((stop, i) => i === idx && !isCompanyStop(stop) ? { ...stop, name } : stop));
  }

  function toggleStopPassenger(id: string) {
    setSelectedStopPassengerIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  }

  function parsedRouteCapacity() {
    if (!editCapacity.trim()) return null;
    const value = Number(editCapacity);
    return Number.isFinite(value) ? value : null;
  }

  function checkCapacityFor(count: number) {
    const capacity = parsedRouteCapacity();
    return capacity != null && count > capacity ? { capacity, overBy: count - capacity } : null;
  }

  function previewBulkNames() {
    if (!editRoute) return;
    const rawNames = bulkNamesText
      .split(/[\n,;]+/)
      .map(item => item.trim())
      .filter(Boolean);
    if (rawNames.length === 0) return;
    const selectedSet = new Set(selectedStopPassengerIds);
    const seen = new Set<string>();
    const byName = new Map<string, Personnel[]>();
    personnel.forEach(p => {
      const key = normalizePersonName(p.full_name);
      byName.set(key, [...(byName.get(key) || []), p]);
    });
    const next: BulkNamePreview = {
      valid: [],
      alreadySelected: [],
      duplicateInput: [],
      notFound: [],
      noCoords: [],
      otherRoute: [],
      ambiguous: [],
    };
    const addUnique = <T extends Personnel>(list: T[], item: T) => {
      if (!list.some(existing => existing.id === item.id)) list.push(item);
    };

    rawNames.forEach(input => {
      const key = normalizePersonName(input);
      if (seen.has(key)) {
        next.duplicateInput.push(input);
        return;
      }
      seen.add(key);
      const matches = byName.get(key) || [];
      if (matches.length === 0) {
        next.notFound.push(input);
        return;
      }
      if (matches.length > 1) {
        next.ambiguous.push({ input, matches });
        return;
      }
      const person = matches[0];
      if (selectedSet.has(person.id)) {
        addUnique(next.alreadySelected, person);
      } else if (person.pickup_lat == null || person.pickup_lng == null) {
        addUnique(next.noCoords, person);
      } else if (person.route_id && person.route_id !== editRoute.id) {
        addUnique(next.otherRoute, person);
      } else {
        addUnique(next.valid, person);
      }
    });
    setBulkPreview(next);
  }

  function confirmBulkNames(prepareStops = false) {
    if (!bulkPreview) return;
    const validIds = bulkPreview.valid.map(p => p.id);
    if (validIds.length === 0) return;
    const nextIds = Array.from(new Set([...selectedStopPassengerIds, ...validIds]));
    const capacityWarning = checkCapacityFor(nextIds.length);
    if (capacityWarning && !confirm(`Kapasite aşılacak: ${nextIds.length}/${capacityWarning.capacity} personel. Yine de seçime eklensin mi? Kaydetmeden önce kapasiteyi düzeltmeniz gerekir.`)) return;
    setSelectedStopPassengerIds(nextIds);
    setBulkPreview(null);
    setBulkNamesText("");
    if (prepareStops) {
      setTimeout(() => void buildStopsFromSelectedPersonnel(nextIds), 0);
    }
  }

  async function optimizeStopsArray(stopsToOptimize: Stop[]): Promise<{ stops: Stop[]; geometry: [number, number][] | null }> {
    const company = stopsToOptimize.find(stop => isCompanyStop(stop) && stop.lat != null && stop.lng != null) as (Stop & { lat: number; lng: number }) | undefined;
    const routeStops = stopsToOptimize.filter(stop => !isCompanyStop(stop));
    const geoStops = routeStops.filter(s => s.lat != null && s.lng != null) as (Stop & { lat: number; lng: number })[];
    if (company && geoStops.length >= 1) {
      const ordered = orderStopsTowardDestination(geoStops, company);
      const input = [...ordered, company];
      try {
        const noCoords = routeStops.filter(s => s.lat == null || s.lng == null);
        const geometry = await osrmRoute(input);
        return {
          stops: renumberStops([...ordered, ...noCoords, company]),
          geometry,
        };
      } catch {
        const noCoords = routeStops.filter(s => s.lat == null || s.lng == null);
        return { stops: renumberStops([...ordered, ...noCoords, company]), geometry: null };
      }
    }
    if (geoStops.length < 3) return { stops: stopsToOptimize, geometry: null };
    try {
      const coord = geoStops.map(s => `${s.lng},${s.lat}`).join(";");
      const r = await fetch(
        `https://router.project-osrm.org/trip/v1/driving/${coord}?roundtrip=false&source=first&destination=last&overview=false`,
        { signal: AbortSignal.timeout(15000) }
      );
      const d = await r.json();
      if (d.code !== "Ok" || !d.waypoints) return { stops: stopsToOptimize, geometry: null };
      const optimized = new Array(geoStops.length);
      d.waypoints.forEach((w: any, inputIdx: number) => { optimized[w.waypoint_index] = geoStops[inputIdx]; });
      const withCoords = optimized.filter(Boolean).map((s: Stop, i: number) => ({ ...s, order: i + 1 }));
      const noCoords = routeStops
        .filter(s => s.lat == null || s.lng == null)
        .map((s, i) => ({ ...s, order: withCoords.length + i + 1 }));
      return { stops: [...withCoords, ...noCoords], geometry: null };
    } catch {
      return { stops: stopsToOptimize, geometry: null };
    }
  }

  async function buildStopsFromSelectedPersonnel(passengerIdsOverride?: string[]) {
    const passengerIds = passengerIdsOverride || selectedStopPassengerIds;
    if (!editRoute || passengerIds.length === 0) return;
    const capacityWarning = checkCapacityFor(passengerIds.length);
    if (capacityWarning) {
      alert(`Kapasite aşıldı: ${passengerIds.length}/${capacityWarning.capacity} personel. Önce kapasiteyi artırın veya seçimi azaltın.`);
      return;
    }
    setStopSuggesting(true);
    try {
      const res = await fetch("/api/route-plans/suggest-stops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: selectedCompany || editRoute.company_id,
          max_walk_meters: routeMaxWalkMeters,
          passenger_ids: passengerIds,
          company_stop: companyStop?.lat != null && companyStop?.lng != null ? { lat: companyStop.lat, lng: companyStop.lng } : null,
        }),
      });
      const d = await res.json();
      if (!d.ok) { alert(d.error || "Duraklar oluşturulamadı"); return; }
      const suggestedStops: Stop[] = (d.data?.stops || []).map((stop: any, index: number) => ({
        name: stop.name || `Durak ${index + 1}`,
        order: index + 1,
        lat: stop.lat,
        lng: stop.lng,
        auto_generated: true,
        passenger_ids: (stop.assignments || []).map((item: any) => item.id),
        passengers: (stop.assignments || []).map((item: any) => ({ id: item.id, name: item.name, walking_distance_m: item.walking_distance_m })),
      }));
      if (suggestedStops.length === 0) { alert("Seçili personellerden durak üretilemedi."); return; }
      const manualStops = editStops.filter(stop => !isCompanyStop(stop) && !stop.auto_generated);
      const combined = upsertCompanyStop([...manualStops, ...suggestedStops], companyStop);
      const optimized = await optimizeStopsArray(combined);
      setEditStops(optimized.stops);
      if (optimized.geometry) setEditGeometry(optimized.geometry);
      const selectedPeople = personnel.filter(p => passengerIds.includes(p.id));
      setEditPersonnel(prev => {
        const byId = new Map(prev.map(p => [p.id, p]));
        selectedPeople.forEach(p => byId.set(p.id, { ...p, route_id: editRoute.id }));
        return Array.from(byId.values());
      });
      const unsnappedStopCount = Number(d.data?.unsnapped_stop_count || 0);
      const mainRoadNote = unsnappedStopCount > 0
        ? `\nUyarı: ${unsnappedStopCount} durak için yakın ana yol bulunamadı; bu durakları haritada kontrol edin.`
        : "\nDuraklar personel adresi yerine ana yol üzerindeki uygun noktalara alındı.";
      alert(`${selectedPeople.length} personel için ${suggestedStops.length} durak hazırlandı. Kaydet dediğinizde personeller bu güzergaha atanacak.${mainRoadNote}`);
    } finally {
      setStopSuggesting(false);
    }
  }

  // ── Optimize stops order ──────────────────────────────────────────────
  async function optimizeRoute() {
    const optimized = await optimizeStopsArray(editStops);
    setEditStops(optimized.stops);
    if (optimized.geometry) setEditGeometry(optimized.geometry);
  }

  // ── Add personnel to route ────────────────────────────────────────────
  async function addPersonnel() {
    if (!newPersonForm.name.trim() || !editRoute) return;
    setAddingPerson(true);
    try {
      let coords: { lat: number; lng: number } | null = null;
      if (newPersonForm.address.trim()) {
        coords = await geocodeAddress(newPersonForm.address.trim());
      }
      const res = await fetch("/api/yolcular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: newPersonForm.name.trim(),
          phone: newPersonForm.phone.trim() || null,
          pickup_address: newPersonForm.address.trim() || null,
          pickup_lat: coords?.lat ?? null,
          pickup_lng: coords?.lng ?? null,
          route_id: editRoute.id,
          company_id: selectedCompany,
          type: "personel",
          status: "aktif",
        }),
      });
      const d = await res.json();
      if (!d.ok) { alert(d.error || "Eklenemedi"); return; }
      // Reload route personnel
      const pr = await fetch(`/api/yolcular?route_id=${editRoute.id}`);
      const pd = await pr.json();
      if (pd.ok) setEditPersonnel(pd.data);
      // Also refresh full personnel list
      loadPersonnel();
      setNewPersonForm({ name: "", address: "", phone: "" });
      setShowAddPersonnel(false);
    } finally {
      setAddingPerson(false);
    }
  }

  async function removePersonnelFromRoute(personId: string) {
    if (!confirm("Bu personeli rotadan çıkarmak istediğinizden emin misiniz?")) return;
    await fetch(`/api/yolcular/${personId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(editPersonnel.find(p => p.id === personId) ?? {}),
        full_name: editPersonnel.find(p => p.id === personId)?.full_name ?? "",
        route_id: null,
      }),
    });
    setEditPersonnel(p => p.filter(x => x.id !== personId));
    loadPersonnel();
  }

  const canEdit = hasPermission(user, "routes:update");
  const canDelete = hasPermission(user, "routes:delete");
  const selectableStopPersonnel = [...personnel]
    .filter(p => p.pickup_lat != null && p.pickup_lng != null)
    .sort((a, b) => {
      const ar = a.route_id === editRoute?.id ? 0 : a.route_id ? 2 : 1;
      const br = b.route_id === editRoute?.id ? 0 : b.route_id ? 2 : 1;
      return ar - br || a.full_name.localeCompare(b.full_name, "tr-TR");
    });
  const selectedStopPassengerSet = new Set(selectedStopPassengerIds);
  const selectedStopPassengerCount = selectedStopPassengerIds.length;
  const finalStopPassengerCount = Array.from(new Set(editStops.flatMap(stop => [
    ...(stop.passenger_ids ?? []),
    ...((stop.passengers ?? []).map(passenger => passenger.id)),
  ]))).length;
  const currentCapacity = parsedRouteCapacity();
  const selectedCapacityWarning = checkCapacityFor(selectedStopPassengerCount);
  const finalCapacityWarning = checkCapacityFor(finalStopPassengerCount);

  // ── Planner ───────────────────────────────────────────────────────────
  async function geocodeDepot() {
    if (!plannerDepotAddr.trim()) return;
    const c = await geocodeAddress(plannerDepotAddr.trim());
    if (c) setPlannerDepotCoords(c);
    else alert("Adres bulunamadı. Farklı bir ifade deneyin.");
  }

  async function runPlan() {
    if (!plannerDepotCoords) { alert("Önce depo konumunu belirleyin."); return; }
    const withCoords = personnel.filter(p => p.pickup_lat != null && p.pickup_lng != null);
    if (withCoords.length === 0) { alert("Koordinatlı personel bulunamadı."); return; }
    const activeVehicles = plannerVehicles.filter(v => v.capacity > 0);
    if (activeVehicles.length === 0) { alert("En az bir araç gerekli."); return; }

    setPlannerRunning(true);
    setPlanResult(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personnel: withCoords.map(p => ({ id: p.id, name: p.full_name, lat: p.pickup_lat!, lng: p.pickup_lng! })),
          vehicles: activeVehicles.map(v => ({
            id: v.id, label: v.label, capacity: v.capacity,
            depot_lat: plannerDepotCoords!.lat, depot_lng: plannerDepotCoords!.lng,
          })),
        }),
      });
      const d = await res.json();
      if (!d.ok) { alert(d.error || "Planlama hatası"); return; }
      setPlanResult(d.data);
      setMobileTab("map");
    } catch (e: any) {
      alert("Planlama hatası: " + e.message);
    } finally {
      setPlannerRunning(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <>
      <Nav user={user} />
      {/* Nav is fixed h-14 (56px / 3.5rem). Spacer is already rendered by Nav. */}
      <div
        className="flex flex-col overflow-hidden bg-zinc-950"
        style={{ height: "calc(100dvh - 3.5rem)" }}
      >

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* ── Left Sidebar ── */}
        <aside className={`flex-col bg-zinc-950 border-r border-zinc-800 overflow-hidden w-full lg:w-80 xl:w-96 lg:shrink-0 ${mobileTab === "list" ? "flex" : "hidden"} lg:flex`}>

          {/* Company selector */}
          <div className="p-3 border-b border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Rota Planlama</span>
              <button
                onClick={() => router.push("/guzergahlar")}
                className="text-zinc-600 hover:text-zinc-400 text-xs"
              >
                ← Liste
              </button>
            </div>
            <ComboboxSearch
              options={companies.map(c => ({ value: c.id, label: c.name }))}
              value={selectedCompany}
              onChange={v => { setSelectedCompany(v); cancelEdit(); setShowPlanner(false); setPlanResult(null); }}
              placeholder="Firma seç..."
              emptyLabel="— Firma Seçin —"
            />
          </div>

          {!selectedCompany ? (
            <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm text-center px-6">
              Güzergahları görmek için<br />yukarıdan bir firma seçin
            </div>
          ) : editRoute ? (
            /* ─── Edit panel ─── */
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Header */}
              <div className="px-4 py-3 border-b border-zinc-800">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">Rota Düzenleniyor</p>
                <h2 className="text-sm font-bold text-white truncate">{editRoute.name}</h2>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto p-3 space-y-4">

                {/* Route settings */}
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-zinc-200">Güzergah ayarları</p>
                      <p className="mt-0.5 text-[10px] text-zinc-500">Kapasite ve çalışma tipini buradan yönetin.</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${finalCapacityWarning ? "bg-red-500 text-white" : "bg-zinc-800 text-zinc-300"}`}>
                      {finalStopPassengerCount}{currentCapacity != null ? `/${currentCapacity}` : ""} kişi
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Kapasite</span>
                      <input
                        type="number"
                        min={0}
                        max={1000}
                        value={editCapacity}
                        onChange={e => setEditCapacity(e.target.value)}
                        placeholder="Sınırsız"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-white outline-none focus:border-zinc-500"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Çalışma tipi</span>
                      <select value={editScheduleMode} onChange={e => setEditScheduleMode(e.target.value === "shift" ? "shift" : "fixed")} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-white outline-none focus:border-zinc-500">
                        <option value="fixed">Sabit sabah/akşam</option>
                        <option value="shift">Vardiya</option>
                      </select>
                    </label>
                  </div>
                  {editScheduleMode === "shift" ? (
                    <label className="block space-y-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Vardiya adı</span>
                      <input value={editShiftName} onChange={e => setEditShiftName(e.target.value)} placeholder="Örn: 08:00-16:00 / Gece vardiyası" className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-white outline-none focus:border-zinc-500 placeholder:text-zinc-600" />
                    </label>
                  ) : (
                    <div className="space-y-2">
                      <label className="block space-y-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Yön</span>
                        <select value={editDirection} onChange={e => setEditDirection(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-white outline-none focus:border-zinc-500">
                          <option value="both">Sabah + Akşam</option>
                          <option value="morning">Sadece Sabah</option>
                          <option value="evening">Sadece Akşam</option>
                        </select>
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <input value={editMorningDeparture} onChange={e => setEditMorningDeparture(e.target.value)} placeholder="Sabah çıkış" className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-white outline-none placeholder:text-zinc-600" />
                        <input value={editMorningArrival} onChange={e => setEditMorningArrival(e.target.value)} placeholder="Sabah varış" className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-white outline-none placeholder:text-zinc-600" />
                        <input value={editEveningDeparture} onChange={e => setEditEveningDeparture(e.target.value)} placeholder="Akşam çıkış" className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-white outline-none placeholder:text-zinc-600" />
                        <input value={editEveningArrival} onChange={e => setEditEveningArrival(e.target.value)} placeholder="Akşam varış" className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-white outline-none placeholder:text-zinc-600" />
                      </div>
                    </div>
                  )}
                  {finalCapacityWarning && (
                    <p className="rounded-lg border border-red-900 bg-red-950/40 px-2 py-1.5 text-[10px] font-semibold text-red-200">
                      ⚠ Kaydedilecek personel kapasiteyi aşıyor: {finalStopPassengerCount}/{currentCapacity} kişi.
                    </p>
                  )}
                </div>

                {/* Stops section */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-zinc-400">Duraklar ({editStops.length})</span>
                    {editStops.filter(s => s.lat != null).length >= 3 && (
                      <button
                        onClick={optimizeRoute}
                        className="text-xs text-emerald-400 hover:text-emerald-300 font-medium"
                      >
                        ⚡ Optimize Et
                      </button>
                    )}
                  </div>

                  {/* Stop list */}
                  <div className="space-y-1 mb-2 max-h-[220px] overflow-y-auto">
                    {editStops.length === 0 ? (
                      <p className="text-xs text-zinc-600 text-center py-3">
                        Haritaya tıkla veya aşağıdan durak ekle
                      </p>
                    ) : editStops.map((stop, idx) => {
                      const isFirst = idx === 0;
                      const fixedCompany = isCompanyStop(stop);
                      const isLast = fixedCompany || idx === editStops.length - 1;
                      const dotColor = fixedCompany ? "bg-red-500" : isFirst ? "bg-emerald-500" : isLast ? "bg-red-500" : "bg-blue-500";
                      return (
                        <div key={idx} className="flex items-center gap-1">
                          <span className={`w-5 h-5 ${dotColor} text-white text-[9px] font-bold rounded-full flex items-center justify-center shrink-0`}>
                            {fixedCompany ? "F" : stop.order}
                          </span>
                          <input
                            value={stop.name}
                            onChange={e => updateStopName(idx, e.target.value)}
                            disabled={fixedCompany}
                            className="flex-1 bg-zinc-800/60 border border-zinc-700/60 text-white text-xs px-2 py-1 rounded focus:outline-none focus:border-zinc-500 disabled:cursor-not-allowed disabled:text-zinc-400 min-w-0"
                          />
                          {stop.passenger_ids?.length ? <span className="rounded bg-violet-950 px-1.5 py-0.5 text-[10px] font-semibold text-violet-200" title="Bu durağa atanacak personel sayısı">{stop.passenger_ids.length} kişi</span> : null}
                          {fixedCompany && <span className="text-red-300 text-[10px]" title="Sabit firma lokasyonu">Sabit</span>}
                          {!stop.lat && <span className="text-amber-500 text-[10px]" title="Koordinat yok">⚠</span>}
                          <button onClick={() => moveStop(idx, -1)} disabled={isFirst || fixedCompany || isCompanyStop(editStops[idx - 1])} className="text-zinc-600 hover:text-white disabled:opacity-20 text-xs w-4">↑</button>
                          <button onClick={() => moveStop(idx, 1)} disabled={isLast || fixedCompany || isCompanyStop(editStops[idx + 1])} className="text-zinc-600 hover:text-white disabled:opacity-20 text-xs w-4">↓</button>
                          <button onClick={() => removeStop(idx)} disabled={fixedCompany} className="text-zinc-600 hover:text-red-400 disabled:opacity-20 text-sm w-4 text-center">×</button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Add stop by name */}
                  <div className="flex gap-1.5">
                    <input
                      value={newStopName}
                      onChange={e => setNewStopName(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addStopByName()}
                      placeholder="Durak adı (Taksim, Kadıköy...)"
                      className="flex-1 bg-zinc-800 border border-zinc-700 text-white text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-zinc-500 placeholder-zinc-600"
                    />
                    <button
                      onClick={addStopByName}
                      disabled={addingStop || !newStopName.trim()}
                      className="bg-zinc-700 hover:bg-zinc-600 text-white text-xs px-2.5 py-1.5 rounded-lg disabled:opacity-50 whitespace-nowrap"
                    >
                      {addingStop ? "…" : "+ Ekle"}
                    </button>
                  </div>
                  <p className="text-[10px] text-zinc-600 mt-1">
                    veya haritaya tıklayarak durak ekle · Rota çizgisine tıkla: ayar noktası
                  </p>
                </div>

                {/* Auto stop assignment section */}
                <div className="rounded-2xl border border-violet-900/60 bg-violet-950/20 p-3">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-violet-200">Personelden otomatik durak oluştur</p>
                      <p className="mt-0.5 text-[10px] text-violet-200/70">Personelleri seçin; sistem ortak durakları belirleyip bu güzergaha ekler. Kaydet ile personeller de güzergaha atanır.</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-violet-500 px-2 py-0.5 text-[10px] font-black text-white">{selectedStopPassengerCount}</span>
                  </div>
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <select value={routeMaxWalkMeters} onChange={e => setRouteMaxWalkMeters(Number(e.target.value))} className="rounded-lg border border-violet-900 bg-zinc-950 px-2 py-1.5 text-xs text-white outline-none">
                      <option value={300}>300 m</option>
                      <option value={500}>500 m</option>
                      <option value={750}>750 m</option>
                      <option value={1000}>1000 m</option>
                    </select>
                    <button onClick={() => setSelectedStopPassengerIds(selectableStopPersonnel.filter(p => !p.route_id || p.route_id === editRoute?.id).map(p => p.id))} className="rounded-lg border border-violet-800 px-2 py-1.5 text-[10px] font-semibold text-violet-100 hover:bg-violet-950">Uygunları seç</button>
                    <button onClick={() => setSelectedStopPassengerIds([])} disabled={selectedStopPassengerCount === 0} className="rounded-lg border border-zinc-700 px-2 py-1.5 text-[10px] font-semibold text-zinc-300 disabled:opacity-40">Temizle</button>
                    <button onClick={() => void buildStopsFromSelectedPersonnel()} disabled={stopSuggesting || selectedStopPassengerCount === 0} className="ml-auto rounded-lg bg-violet-500 px-2.5 py-1.5 text-[10px] font-black text-white hover:bg-violet-400 disabled:opacity-40">
                      {stopSuggesting ? "Hazırlanıyor..." : "Durakları hazırla"}
                    </button>
                  </div>
                  <div className="mb-2 rounded-xl border border-violet-900/50 bg-zinc-950/60 p-2">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-violet-200">Toplu isimle seç</p>
                    <textarea
                      value={bulkNamesText}
                      onChange={e => setBulkNamesText(e.target.value)}
                      placeholder={"Her satıra bir Ad Soyad yazın\nÖrn: Ahmet Yılmaz"}
                      rows={4}
                      className="w-full resize-y rounded-lg border border-violet-900/70 bg-zinc-950 px-2 py-1.5 text-xs text-white outline-none placeholder:text-zinc-600 focus:border-violet-600"
                    />
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <p className="text-[10px] text-violet-200/60">Sistem bulunan, uygun olmayan ve eksik isimleri popup içinde gösterir.</p>
                      <button onClick={previewBulkNames} disabled={!bulkNamesText.trim()} className="shrink-0 rounded-lg bg-violet-600 px-2.5 py-1.5 text-[10px] font-black text-white hover:bg-violet-500 disabled:opacity-40">
                        Kontrol et
                      </button>
                    </div>
                  </div>
                  {selectedCapacityWarning && (
                    <p className="mb-2 rounded-lg border border-red-900 bg-red-950/40 px-2 py-1.5 text-[10px] font-semibold text-red-200">
                      ⚠ Seçili personel kapasiteyi aşıyor: {selectedStopPassengerCount}/{currentCapacity} kişi.
                    </p>
                  )}
                  <div className="max-h-[180px] space-y-1 overflow-y-auto pr-1">
                    {selectableStopPersonnel.length === 0 ? (
                      <p className="py-2 text-center text-[10px] text-zinc-600">Koordinatlı personel bulunamadı</p>
                    ) : selectableStopPersonnel.map(p => {
                      const route = routes.find(r => r.id === p.route_id);
                      const selected = selectedStopPassengerSet.has(p.id);
                      return (
                        <label key={p.id} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${selected ? "bg-violet-500/20" : "bg-zinc-900/70 hover:bg-zinc-800/80"}`}>
                          <input type="checkbox" checked={selected} onChange={() => toggleStopPassenger(p.id)} className="h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-950" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-zinc-100">{p.full_name}</p>
                            <p className="truncate text-[10px] text-zinc-500">{route ? (route.id === editRoute?.id ? "Bu güzergahta" : `Başka güzergah: ${route.name}`) : "Atanmamış"}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Personnel section */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-zinc-400">Personeller ({editPersonnel.length})</span>
                    {canEdit && (
                      <button
                        onClick={() => setShowAddPersonnel(v => !v)}
                        className="text-xs text-blue-400 hover:text-blue-300 font-medium"
                      >
                        {showAddPersonnel ? "İptal" : "+ Personel Ekle"}
                      </button>
                    )}
                  </div>

                  {/* Add personnel form */}
                  {showAddPersonnel && (
                    <div className="bg-zinc-800/50 rounded-xl p-3 space-y-2 mb-2 border border-zinc-700/50">
                      <input
                        value={newPersonForm.name}
                        onChange={e => setNewPersonForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="Ad Soyad *"
                        className="w-full bg-zinc-800 border border-zinc-700 text-white text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-zinc-500 placeholder-zinc-600"
                      />
                      <input
                        value={newPersonForm.address}
                        onChange={e => setNewPersonForm(f => ({ ...f, address: e.target.value }))}
                        placeholder="Biniş adresi (haritada gösterilir)"
                        className="w-full bg-zinc-800 border border-zinc-700 text-white text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-zinc-500 placeholder-zinc-600"
                      />
                      <input
                        value={newPersonForm.phone}
                        onChange={e => setNewPersonForm(f => ({ ...f, phone: e.target.value }))}
                        placeholder="Telefon (opsiyonel)"
                        className="w-full bg-zinc-800 border border-zinc-700 text-white text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-zinc-500 placeholder-zinc-600"
                      />
                      <button
                        onClick={addPersonnel}
                        disabled={addingPerson || !newPersonForm.name.trim()}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                      >
                        {addingPerson ? "Ekleniyor..." : "Kaydet"}
                      </button>
                    </div>
                  )}

                  {/* Personnel list */}
                  <div className="space-y-1 max-h-[200px] overflow-y-auto">
                    {editPersonnel.length === 0 ? (
                      <p className="text-xs text-zinc-600 text-center py-2">Henüz personel eklenmedi</p>
                    ) : editPersonnel.map(p => (
                      <div key={p.id} className="flex items-center gap-2 py-1">
                        <div className="w-6 h-6 bg-violet-600 rounded flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                          {p.full_name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs font-medium truncate">{p.full_name}</p>
                          {p.pickup_address && (
                            <p className="text-zinc-500 text-[10px] truncate">
                              {p.pickup_lat ? "📍" : "⚠"} {p.pickup_address}
                            </p>
                          )}
                        </div>
                        {canEdit && (
                          <button
                            onClick={() => removePersonnelFromRoute(p.id)}
                            className="text-zinc-600 hover:text-red-400 text-sm"
                          >×</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Fixed save/cancel at bottom */}
              <div className="p-3 border-t border-zinc-800 flex gap-2">
                {canDelete && (
                  <button
                    onClick={() => deleteRoute(editRoute)}
                    className="bg-red-950 px-3 text-red-300 text-sm font-semibold py-2.5 rounded-lg hover:bg-red-900 transition-colors"
                  >
                    Sil
                  </button>
                )}
                <button
                  onClick={cancelEdit}
                  className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors"
                >
                  İptal
                </button>
                <button
                  onClick={saveRoute}
                  disabled={saving}
                  className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors"
                >
                  {saving ? "Kaydediliyor..." : "Kaydet"}
                </button>
              </div>
            </div>
          ) : showPlanner ? (
            /* ─── Planner panel ─── */
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Otomatik Rota Planlama</p>
                  <p className="text-xs text-zinc-400 mt-0.5">{personnel.filter(p => p.pickup_lat != null).length} koordinatlı personel</p>
                </div>
                <button
                  onClick={() => { setShowPlanner(false); setPlanResult(null); }}
                  className="text-zinc-600 hover:text-white text-lg leading-none"
                >✕</button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-4">
                {/* Depot address */}
                <div>
                  <p className="text-xs font-semibold text-zinc-400 mb-1.5">Başlangıç / Depo Konumu</p>
                  <div className="flex gap-1.5">
                    <input
                      value={plannerDepotAddr}
                      onChange={e => setPlannerDepotAddr(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && geocodeDepot()}
                      placeholder="Adres veya yer adı..."
                      className="flex-1 bg-zinc-800 border border-zinc-700 text-white text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-zinc-500 placeholder-zinc-600"
                    />
                    <button
                      onClick={geocodeDepot}
                      className="bg-zinc-700 hover:bg-zinc-600 text-white text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap"
                    >
                      Konumu Al
                    </button>
                  </div>
                  {plannerDepotCoords && (
                    <p className="text-[10px] text-emerald-400 mt-1">✓ {plannerDepotCoords.lat.toFixed(5)}, {plannerDepotCoords.lng.toFixed(5)}</p>
                  )}
                </div>

                {/* Vehicle list */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-semibold text-zinc-400">Araçlar ({plannerVehicles.length})</p>
                    <button
                      onClick={() => setPlannerVehicles(v => [...v, { id: `v${Date.now()}`, label: `Araç ${v.length + 1}`, capacity: 14 }])}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >+ Araç Ekle</button>
                  </div>
                  <div className="space-y-1.5">
                    {plannerVehicles.map((v, vi) => (
                      <div key={v.id} className="flex items-center gap-1.5">
                        <div className="w-2 h-8 rounded-full shrink-0" style={{ background: ROUTE_COLORS[vi % ROUTE_COLORS.length] }} />
                        <input
                          value={v.label}
                          onChange={e => setPlannerVehicles(pv => pv.map((x, i) => i === vi ? { ...x, label: e.target.value } : x))}
                          className="flex-1 bg-zinc-800 border border-zinc-700 text-white text-xs px-2 py-1.5 rounded-lg focus:outline-none focus:border-zinc-600 min-w-0"
                        />
                        <span className="text-zinc-500 text-[10px] shrink-0">Kap:</span>
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={v.capacity}
                          onChange={e => setPlannerVehicles(pv => pv.map((x, i) => i === vi ? { ...x, capacity: parseInt(e.target.value) || 1 } : x))}
                          className="w-12 bg-zinc-800 border border-zinc-700 text-white text-xs px-1.5 py-1.5 rounded-lg text-center focus:outline-none focus:border-zinc-600"
                        />
                        <button
                          onClick={() => setPlannerVehicles(pv => pv.filter((_, i) => i !== vi))}
                          className="text-zinc-600 hover:text-red-400 text-sm"
                        >×</button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-zinc-800/40 rounded-xl p-3">
                  <p className="text-xs text-zinc-400">
                    <span className="font-semibold text-white">{personnel.filter(p => p.pickup_lat != null).length}</span> personel planlanacak
                    {personnel.filter(p => p.pickup_lat == null).length > 0 && (
                      <span className="text-amber-500"> · {personnel.filter(p => p.pickup_lat == null).length} koordinatsız atlanır</span>
                    )}
                  </p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">Toplam kapasite: {plannerVehicles.reduce((s, v) => s + v.capacity, 0)} kişi</p>
                </div>

                {/* Plan results */}
                {planResult && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-emerald-400">⚡ Plan Sonuçları</p>
                    {(planResult.vehicles as any[]).map((v, vi) => (
                      <div key={v.vehicle_id} className="bg-zinc-800/50 rounded-xl p-3 border border-zinc-700/50">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-2 h-4 rounded-full shrink-0" style={{ background: ROUTE_COLORS[vi % ROUTE_COLORS.length] }} />
                          <span className="text-white text-xs font-semibold truncate">{v.vehicle_label}</span>
                          <span className="text-zinc-500 text-[10px] ml-auto shrink-0">{v.stops.length} kişi</span>
                        </div>
                        <p className="text-zinc-400 text-[10px]">{Math.round(v.duration_seconds / 60)} dk · {(v.distance_meters / 1000).toFixed(1)} km</p>
                      </div>
                    ))}
                    {planResult.unassigned?.length > 0 && (
                      <p className="text-amber-500 text-xs">⚠ {planResult.unassigned.length} personel atanamadı</p>
                    )}
                    <p className="text-[10px] text-zinc-600 text-center">Toplam: {Math.round(planResult.total_duration / 60)} dk · {(planResult.total_distance / 1000).toFixed(1)} km</p>
                  </div>
                )}
              </div>

              {/* Run button */}
              <div className="p-3 border-t border-zinc-800">
                <button
                  onClick={runPlan}
                  disabled={plannerRunning || !plannerDepotCoords || plannerVehicles.length === 0}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {plannerRunning ? "Hesaplanıyor..." : planResult ? "⚡ Tekrar Planla" : "⚡ Planı Hesapla"}
                </button>
                {!plannerDepotCoords && (
                  <p className="text-[10px] text-zinc-600 text-center mt-1.5">Önce depo konumunu belirleyin</p>
                )}
              </div>
            </div>
          ) : (
            /* ─── Route list ─── */
            <div className="flex-1 overflow-y-auto">
              {loadingRoutes ? (
                <div className="flex items-center justify-center py-16 text-zinc-600 text-sm">Yükleniyor...</div>
              ) : routes.length === 0 ? (
                <div className="flex items-center justify-center py-16 text-zinc-600 text-xs text-center px-6">
                  Bu firmaya ait güzergah bulunamadı.<br />
                  <button onClick={() => router.push("/guzergahlar")} className="text-blue-400 hover:underline mt-1">
                    Güzergah eklemek için tıkla
                  </button>
                </div>
              ) : (
                <div>
                  <div className="px-4 py-3 border-b border-zinc-800/50 flex items-center justify-between">
                    <p className="text-xs text-zinc-500">{routes.length} güzergah</p>
                    {canEdit && routes.length > 0 && (
                      <button
                        onClick={() => { setShowPlanner(true); setPlanResult(null); }}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
                      >
                        ⚡ Otomatik Planla
                      </button>
                    )}
                  </div>
                  {routes.map((r, idx) => {
                    const color = ROUTE_COLORS[idx % ROUTE_COLORS.length];
                    const stops: Stop[] = (() => { try { return JSON.parse(r.stops_json || "[]"); } catch { return []; } })();
                    const routePersonnel = personnel.filter(p => p.route_id === r.id);
                    return (
                      <div
                        key={r.id}
                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-zinc-800/40 hover:bg-zinc-800/40 transition-colors ${selectedOverviewRouteId === r.id ? "bg-zinc-800/60" : ""}`}
                        onClick={() => setSelectedOverviewRouteId(selectedOverviewRouteId === r.id ? undefined : r.id)}
                      >
                        {/* Color swatch */}
                        <div className="w-3 h-8 rounded-full shrink-0" style={{ background: color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-white text-sm font-semibold truncate">{r.name}</span>
                            {!r.is_active && <span className="text-zinc-500 text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded">Pasif</span>}
                          </div>
                          <p className="text-zinc-500 text-xs">
                            {stops.length} durak · {routePersonnel.length}{r.capacity != null ? `/${r.capacity}` : ""} personel · {SCHEDULE_LABELS[r.schedule_mode || "fixed"] || r.schedule_mode || "Sabit"}{r.schedule_mode === "shift" && r.shift_name ? ` (${r.shift_name})` : ""}
                          </p>
                        </div>
                        {canEdit && (
                          <div className="flex items-center gap-1">
                            {canDelete && (
                              <button
                                onClick={e => { e.stopPropagation(); void deleteRoute(r); }}
                                className="text-red-400/80 hover:text-red-300 text-xs px-2 py-1 rounded hover:bg-red-950/60 transition-colors whitespace-nowrap"
                              >
                                Sil
                              </button>
                            )}
                            <button
                              onClick={e => { e.stopPropagation(); openEdit(r); }}
                              className="text-zinc-500 hover:text-white text-xs px-2 py-1 rounded hover:bg-zinc-700 transition-colors whitespace-nowrap"
                            >
                              Düzenle
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Personnel summary */}
              {personnel.length > 0 && (
                <div className="p-4 border-t border-zinc-800/50 mt-2">
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                    Toplam Personel ({personnel.length})
                  </p>
                  <div className="space-y-1 max-h-[180px] overflow-y-auto">
                    {personnel.map(p => {
                      const route = routes.find(r => r.id === p.route_id);
                      const idx = route ? routes.indexOf(route) : -1;
                      const color = idx >= 0 ? ROUTE_COLORS[idx % ROUTE_COLORS.length] : "#6b7280";
                      return (
                        <div key={p.id} className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded flex items-center justify-center text-white text-[9px] font-bold shrink-0" style={{ background: color }}>
                            {p.full_name.charAt(0)}
                          </div>
                          <span className="text-zinc-300 text-xs truncate">{p.full_name}</span>
                          {route && <span className="text-zinc-600 text-[10px] truncate ml-auto">{route.name}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>

        {/* ── Map area ── */}
        <div className={`relative overflow-hidden flex-1 ${mobileTab === "map" ? "flex flex-col" : "hidden"} lg:flex lg:flex-col`}>
          <RouteFullMap
            mode={mode as "edit" | "overview"}
            // Edit props
            stops={editRoute ? editStops : undefined}
            onStopsChange={editRoute ? setEditStops : undefined}
            onGeometryChange={editRoute ? setEditGeometry : undefined}
            // Overview props
            overviewRoutes={
              !editRoute
                ? (planResult
                    ? (planResult.vehicles as any[]).map((v, i) => ({
                        id: v.vehicle_id,
                        name: v.vehicle_label,
                        color: ROUTE_COLORS[i % ROUTE_COLORS.length],
                        stops: v.stops.map((s: any) => ({ name: s.name, order: s.order, lat: s.lat, lng: s.lng })),
                        geometry: v.geometry,
                      }))
                    : overviewRoutes)
                : undefined
            }
            selectedRouteId={!planResult ? selectedOverviewRouteId : undefined}
            onRouteClick={!editRoute && !planResult ? setSelectedOverviewRouteId : undefined}
            // Personnel (shown in both modes)
            personnel={
              editRoute
                ? editPersonnelMarkers
                : (planResult
                    ? (planResult.vehicles as any[]).flatMap((v, vi) =>
                        (v.stops as any[]).map(s => ({
                          id: s.id,
                          name: s.name,
                          lat: s.lat,
                          lng: s.lng,
                          routeColor: ROUTE_COLORS[vi % ROUTE_COLORS.length],
                        }))
                      )
                    : (selectedCompany ? personnelMarkers : []))
            }
            onPersonnelClick={id => {
              if (planResult) {
                const stop = (planResult.vehicles as any[]).flatMap((v: any) => v.stops as any[]).find((s: any) => s.id === id);
                if (stop) alert(`${stop.name}\nSıra: ${stop.order} · ${Math.round(stop.arrival_seconds / 60)} dk`);
                return;
              }
              const p = editRoute
                ? editPersonnel.find(x => x.id === id)
                : personnel.find(x => x.id === id);
              if (p) alert(`${p.full_name}${p.pickup_address ? "\n" + p.pickup_address : ""}`);
            }}
          />

          {/* Mode indicator */}
          {editRoute && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[999] bg-indigo-600/90 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg pointer-events-none">
              {editRoute.name} — Rota Düzenleme Modu
            </div>
          )}

          {!selectedCompany && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 z-[998]">
              <div className="text-center">
                <p className="text-zinc-400 text-lg font-semibold mb-1">Rota Planlama</p>
                <p className="text-zinc-600 text-sm">Sol panelden bir firma seçin</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile tab bar ── */}
      <div className="lg:hidden flex border-t border-zinc-800 bg-zinc-900 shrink-0">
        <button
          onClick={() => setMobileTab("list")}
          className={`flex-1 py-3.5 text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors ${
            mobileTab === "list" ? "text-white bg-zinc-800" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
          Liste
        </button>
        <button
          onClick={() => setMobileTab("map")}
          className={`flex-1 py-3.5 text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors ${
            mobileTab === "map" ? "text-white bg-zinc-800" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
          Harita
        </button>
      </div>
      </div>

      {bulkPreview && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 px-4 py-8" onClick={() => setBulkPreview(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-zinc-800 p-4">
              <div>
                <h3 className="text-lg font-bold text-white">Toplu personel kontrolü</h3>
                <p className="mt-1 text-xs text-zinc-500">Uygun olanlar seçime eklenecek, sonra tek tuşla durak hazırlanacak.</p>
              </div>
              <button onClick={() => setBulkPreview(null)} className="text-2xl leading-none text-zinc-600 hover:text-white">×</button>
            </div>
            <div className="max-h-[65vh] overflow-y-auto p-4 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-xl bg-emerald-950/50 p-3 text-emerald-200"><p className="text-2xl font-black">{bulkPreview.valid.length}</p><p className="text-[10px] uppercase tracking-wider">Uygun</p></div>
                <div className="rounded-xl bg-zinc-900 p-3 text-zinc-300"><p className="text-2xl font-black">{bulkPreview.alreadySelected.length}</p><p className="text-[10px] uppercase tracking-wider">Zaten seçili</p></div>
                <div className="rounded-xl bg-amber-950/50 p-3 text-amber-200"><p className="text-2xl font-black">{bulkPreview.noCoords.length + bulkPreview.otherRoute.length + bulkPreview.ambiguous.length}</p><p className="text-[10px] uppercase tracking-wider">Uygun değil</p></div>
                <div className="rounded-xl bg-red-950/50 p-3 text-red-200"><p className="text-2xl font-black">{bulkPreview.notFound.length}</p><p className="text-[10px] uppercase tracking-wider">Bulunamadı</p></div>
              </div>

              {bulkPreview.valid.length > 0 && (
                <section>
                  <p className="mb-1.5 text-xs font-semibold text-emerald-300">Eklenecek personeller</p>
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-emerald-900/70 bg-emerald-950/20 p-2">
                    {bulkPreview.valid.map(p => <p key={p.id} className="py-0.5 text-xs text-emerald-100">✓ {p.full_name}{p.route_id === editRoute?.id ? " · bu güzergahta" : ""}</p>)}
                  </div>
                </section>
              )}

              {bulkPreview.alreadySelected.length > 0 && (
                <section>
                  <p className="mb-1.5 text-xs font-semibold text-zinc-300">Zaten seçili</p>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-2">
                    {bulkPreview.alreadySelected.map(p => <p key={p.id} className="py-0.5 text-xs text-zinc-400">• {p.full_name}</p>)}
                  </div>
                </section>
              )}

              {(bulkPreview.notFound.length > 0 || bulkPreview.duplicateInput.length > 0 || bulkPreview.noCoords.length > 0 || bulkPreview.otherRoute.length > 0 || bulkPreview.ambiguous.length > 0) && (
                <section className="space-y-2">
                  <p className="text-xs font-semibold text-amber-300">Kontrol edilmesi gerekenler</p>
                  {bulkPreview.notFound.length > 0 && <div className="rounded-xl bg-red-950/30 p-2 text-xs text-red-200"><b>Bulunamadı:</b> {bulkPreview.notFound.join(", ")}</div>}
                  {bulkPreview.duplicateInput.length > 0 && <div className="rounded-xl bg-zinc-900 p-2 text-xs text-zinc-400"><b>Tekrarlı yazıldı:</b> {bulkPreview.duplicateInput.join(", ")}</div>}
                  {bulkPreview.noCoords.length > 0 && <div className="rounded-xl bg-amber-950/30 p-2 text-xs text-amber-200"><b>Koordinatsız:</b> {bulkPreview.noCoords.map(p => p.full_name).join(", ")}</div>}
                  {bulkPreview.otherRoute.length > 0 && <div className="rounded-xl bg-amber-950/30 p-2 text-xs text-amber-200"><b>Başka güzergahta:</b> {bulkPreview.otherRoute.map(p => `${p.full_name} (${routes.find(r => r.id === p.route_id)?.name || "güzergah"})`).join(", ")}</div>}
                  {bulkPreview.ambiguous.length > 0 && <div className="rounded-xl bg-amber-950/30 p-2 text-xs text-amber-200"><b>Birden fazla eşleşme:</b> {bulkPreview.ambiguous.map(item => `${item.input} (${item.matches.length})`).join(", ")}</div>}
                </section>
              )}
            </div>
            <div className="flex flex-col gap-2 border-t border-zinc-800 p-4 sm:flex-row">
              <button onClick={() => setBulkPreview(null)} className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-700">Vazgeç</button>
              <button onClick={() => confirmBulkNames(false)} disabled={bulkPreview.valid.length === 0} className="rounded-xl border border-violet-800 px-4 py-2 text-sm font-semibold text-violet-100 hover:bg-violet-950 disabled:opacity-40">Uygunları seçime ekle</button>
              <button onClick={() => confirmBulkNames(true)} disabled={bulkPreview.valid.length === 0} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-black text-white hover:bg-violet-500 disabled:opacity-40 sm:ml-auto">Onayla ve durakları hazırla</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
