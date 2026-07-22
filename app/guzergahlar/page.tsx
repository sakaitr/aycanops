"use client";
import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Nav from "@/components/Nav";
import BulkActionBar from "@/components/BulkActionBar";
import ComboboxSearch from "@/components/ComboboxSearch";
import { useListState } from "@/hooks/useListState";
import { useGlobalCompany } from "@/contexts/CompanyContext";
import { toast } from "@/lib/toast";
import { hasPermission } from "@/lib/permissions";

const RouteMap = dynamic(() => import("@/components/RouteMap"), { ssr: false, loading: () => (
  <div className="h-[240px] bg-zinc-900 border border-zinc-700 rounded-xl flex items-center justify-center text-zinc-600 text-sm">Harita yükleniyor...</div>
) });

const RouteMapEditor = dynamic(() => import("@/components/RouteMapEditor"), { ssr: false, loading: () => (
  <div className="h-[240px] bg-zinc-900 border border-zinc-700 rounded-xl flex items-center justify-center text-zinc-600 text-sm">Harita yükleniyor...</div>
) });

const DIR_LABELS: Record<string, string> = { both: "Sabah + Akşam", morning: "Sadece Sabah", evening: "Sadece Akşam" };
const SCHEDULE_LABELS: Record<string, string> = { fixed: "Sabit sabah/akşam", shift: "Vardiya" };
const VEHICLE_STATUS_LABELS: Record<string, string> = { fixed: "Sabit", temporary: "Geçici", searching: "Araç aranıyor" };
const DIR_OPTS = [{ value: "both", label: "Sabah + Akşam" }, { value: "morning", label: "Sadece Sabah" }, { value: "evening", label: "Sadece Akşam" }];
type Stop = { name: string; order: number; lat?: number; lng?: number };
type RouteSort = "name" | "code" | "direction" | "vehicle_plate" | "driver_name";
type DetailTab = "general" | "vehicle" | "vardiya" | "prices" | "stops" | "personnel";
const EMPTY_FORM = { name: "", code: "", direction: "both", capacity: "", schedule_mode: "fixed", shift_name: "", morning_departure: "", morning_arrival: "", evening_departure: "", evening_arrival: "", vehicle_id: "", vehicle_assignment_status: "fixed", arac_modu: "sabit", driver_name: "", driver_phone: "", notes: "", stops: [] as Stop[] };

export default function GuzergahlarPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompany, setSelectedCompany] = useState("");
  const { selectedCompanyId: globalCompanyId } = useGlobalCompany();
  useEffect(() => {
    if (!selectedCompany && globalCompanyId) setSelectedCompany(globalCompanyId);
  }, [globalCompanyId]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [unlinked, setUnlinked] = useState<any[]>([]);
  const [unlinkedLoading, setUnlinkedLoading] = useState(false);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [showUnlinked, setShowUnlinked] = useState(false);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [atamaGecmisi, setAtamaGecmisi] = useState<any[]>([]);
  const [atamaLoading, setAtamaLoading] = useState(false);
  const [showAtamaForm, setShowAtamaForm] = useState(false);
  const [atamaForm, setAtamaForm] = useState({
    hareket_tipi: "", yon: "", company_id: "", vehicle_id: "", driver_id: "", baslangic_tarihi: new Date().toISOString().slice(0, 10), aciklama: "",
  });
  const [savingAtama, setSavingAtama] = useState(false);

  // Vardiya (saat dilimleri) + tag yönetimi
  const [timeSlots, setTimeSlots] = useState<any[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotForm, setSlotForm] = useState({ ad: "", giris_saati: "", cikis_saati: "" });
  const [savingSlot, setSavingSlot] = useState(false);
  const [routeTags, setRouteTags] = useState<any[]>([]);
  const [allTags, setAllTags] = useState<any[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [savingTag, setSavingTag] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [detailRoute, setDetailRoute] = useState<any>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("general");
  const [priceForm, setPriceForm] = useState({ price_amount: "", plate: "", valid_from: new Date().toISOString().slice(0, 10), valid_to: "" });
  const [savingPrice, setSavingPrice] = useState(false);
  const list = useListState<RouteSort, { direction: string; status: string }>({
    defaultSort: "name",
    defaultSortDir: "asc",
    defaultPageSize: 25,
    defaultFilters: { direction: "", status: "" },
  });

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data);
      else router.replace("/login");
    }).catch(() => { router.replace("/login"); });
    loadCompanies();
    loadVehicles();
    fetch("/api/suruculer?limit=500").then(r => r.json()).then(d => { if (d.ok) setDrivers(d.data); });
  }, []);

  useEffect(() => {
    if (!detailRoute) { setAtamaGecmisi([]); setTimeSlots([]); setRouteTags([]); return; }
    loadAtamaGecmisi(detailRoute.id);
    loadTimeSlots(detailRoute.id);
    loadRouteTags(detailRoute.id);
  }, [detailRoute?.id]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedCompany) params.set("company_id", selectedCompany);
    fetch(`/api/route-tags?${params}`).then(r => r.json()).then(d => { if (d.ok) setAllTags(d.data); });
  }, [selectedCompany]);

  async function loadTimeSlots(routeId: string) {
    setSlotsLoading(true);
    try {
      const res = await fetch(`/api/routes/${routeId}/saat-dilimleri`);
      const d = await res.json();
      if (d.ok) setTimeSlots(d.data);
    } finally { setSlotsLoading(false); }
  }

  async function saveTimeSlot() {
    if (!detailRoute || !slotForm.ad.trim()) return;
    setSavingSlot(true);
    try {
      const res = await fetch(`/api/routes/${detailRoute.id}/saat-dilimleri`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(slotForm),
      });
      const d = await res.json();
      if (!d.ok) { toast.error(d.error || "Vardiya eklenemedi"); return; }
      setSlotForm({ ad: "", giris_saati: "", cikis_saati: "" });
      loadTimeSlots(detailRoute.id);
    } finally { setSavingSlot(false); }
  }

  async function deleteTimeSlot(slotId: string) {
    if (!detailRoute) return;
    if (!confirm("Bu vardiya kaldırılsın mı?")) return;
    await fetch(`/api/routes/${detailRoute.id}/saat-dilimleri/${slotId}`, { method: "DELETE" });
    loadTimeSlots(detailRoute.id);
  }

  async function loadRouteTags(routeId: string) {
    const res = await fetch(`/api/routes/${routeId}/tags`);
    const d = await res.json();
    if (d.ok) setRouteTags(d.data);
  }

  async function toggleRouteTag(tagId: string, active: boolean) {
    if (!detailRoute) return;
    if (active) {
      await fetch(`/api/routes/${detailRoute.id}/tags?tag_id=${tagId}`, { method: "DELETE" });
    } else {
      await fetch(`/api/routes/${detailRoute.id}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag_id: tagId }),
      });
    }
    loadRouteTags(detailRoute.id);
  }

  async function createAndAttachTag() {
    if (!detailRoute || !newTagName.trim()) return;
    setSavingTag(true);
    try {
      const res = await fetch("/api/route-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTagName.trim(), company_id: selectedCompany || null }),
      });
      const d = await res.json();
      if (!d.ok) { toast.error(d.error || "Tag oluşturulamadı"); return; }
      await fetch(`/api/routes/${detailRoute.id}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag_id: d.data.id }),
      });
      setNewTagName("");
      const params = new URLSearchParams();
      if (selectedCompany) params.set("company_id", selectedCompany);
      fetch(`/api/route-tags?${params}`).then(r => r.json()).then(dd => { if (dd.ok) setAllTags(dd.data); });
      loadRouteTags(detailRoute.id);
    } finally { setSavingTag(false); }
  }

  async function loadAtamaGecmisi(routeId: string) {
    setAtamaLoading(true);
    try {
      const res = await fetch(`/api/routes/${routeId}/atama-gecmisi`);
      const d = await res.json();
      if (d.ok) setAtamaGecmisi(d.data);
    } finally { setAtamaLoading(false); }
  }

  async function saveAtama() {
    if (!detailRoute || !atamaForm.vehicle_id || !atamaForm.baslangic_tarihi) return;
    setSavingAtama(true);
    try {
      const res = await fetch(`/api/routes/${detailRoute.id}/atama-gecmisi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...atamaForm, hareket_tipi: atamaForm.hareket_tipi || null, yon: atamaForm.yon || null }),
      });
      const d = await res.json();
      if (!d.ok) { toast.error(d.error || "Atama kaydedilemedi"); return; }
      toast.success("Atama kaydedildi");
      setShowAtamaForm(false);
      setAtamaForm({ hareket_tipi: "", yon: "", company_id: "", vehicle_id: "", driver_id: "", baslangic_tarihi: new Date().toISOString().slice(0, 10), aciklama: "" });
      loadAtamaGecmisi(detailRoute.id);
      loadRoutes();
    } finally { setSavingAtama(false); }
  }

  useEffect(() => {
    if (selectedCompany) { loadRoutes(); loadUnlinked(); }
    else { setRoutes([]); setUnlinked([]); }
  }, [selectedCompany]);

  async function loadUnlinked() {
    setUnlinkedLoading(true);
    try {
      const res = await fetch(`/api/routes/unlinked?company_id=${selectedCompany}`);
      const d = await res.json();
      if (d.ok) setUnlinked(d.data);
    } finally { setUnlinkedLoading(false); }
  }

  async function promoteUnlinked(routeName: string) {
    setPromoting(routeName);
    try {
      const res = await fetch("/api/routes/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: selectedCompany, route_name: routeName }),
      });
      const d = await res.json();
      if (!d.ok) { toast.error(d.error || "Güzergah oluşturulamadı"); return; }
      toast.success(`"${routeName}" güzergah olarak eklendi (${d.data.linked_vehicles} araç bağlandı)`);
      await Promise.all([loadRoutes(), loadUnlinked()]);
    } finally { setPromoting(null); }
  }

  async function loadCompanies() {
    const res = await fetch("/api/companies");
    const d = await res.json();
    if (d.ok) setCompanies(d.data);
  }

  async function loadVehicles() {
    const res = await fetch("/api/vehicles");
    const d = await res.json();
    if (d.ok) setVehicles(d.data.filter((v: any) => v.status_code === "active"));
  }

  async function loadRoutes() {
    setLoading(true);
    try {
      const res = await fetch(`/api/routes?company_id=${selectedCompany}`);
      const d = await res.json();
      if (d.ok) setRoutes(d.data);
    } finally { setLoading(false); }
  }

  function openCreate() { setEditing(null); setForm({ ...EMPTY_FORM }); setShowForm(true); }

  function openEdit(r: any) {
    setEditing(r);
    const stops: Stop[] = (() => { try { return JSON.parse(r.stops_json || "[]"); } catch { return []; } })();
    setForm({
      name: r.name, code: r.code || "", direction: r.direction,
      capacity: r.capacity == null ? "" : String(r.capacity), schedule_mode: r.schedule_mode || "fixed", shift_name: r.shift_name || "",
      morning_departure: r.morning_departure || "", morning_arrival: r.morning_arrival || "",
      evening_departure: r.evening_departure || "", evening_arrival: r.evening_arrival || "",
      vehicle_id: r.vehicle_id || "", vehicle_assignment_status: r.vehicle_assignment_status || (r.vehicle_id ? "fixed" : "searching"),
      arac_modu: r.arac_modu || "sabit",
      driver_name: r.driver_name || "",
      driver_phone: r.driver_phone || "", notes: r.notes || "", stops
    });
    setDetailRoute(null);
    setShowForm(true);
  }

  function onVehicleChange(vehicleId: string) {
    const v = vehicles.find(v => v.id === vehicleId);
    setForm(f => ({
      ...f,
      vehicle_id: vehicleId,
      driver_name: v?.driver_name || f.driver_name,
      driver_phone: v?.driver_phone || f.driver_phone,
    }));
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const url = editing ? `/api/routes/${editing.id}` : "/api/routes";
      const method = editing ? "PUT" : "POST";
      const { stops, ...formRest } = form;
      const capacity = form.capacity.trim() ? Number(form.capacity) : null;
      if (capacity != null && (!Number.isFinite(capacity) || capacity < 0 || capacity > 1000)) {
        alert("Kapasite 0-1000 arasında olmalı");
        return;
      }
      const body = { ...formRest, capacity, shift_name: form.schedule_mode === "shift" ? (form.shift_name || null) : null, stops_json: stops.map(({ name, order, lat, lng }) => ({ name, order, lat, lng })), company_id: selectedCompany || (editing?.company_id ?? null) };
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      if (d.ok) { setShowForm(false); loadRoutes(); }
      else alert(d.error);
    } finally { setSaving(false); }
  }

  async function toggleActive(r: any) {
    await fetch(`/api/routes/${r.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: r.is_active ? 0 : 1 }) });
    loadRoutes();
    if (detailRoute?.id === r.id) setDetailRoute({ ...r, is_active: r.is_active ? 0 : 1 });
  }

  async function deleteRoute(r: any) {
    const name = r?.name || "Bu güzergah";
    if (!confirm(`${name} kalıcı olarak silinsin mi?\n\nBu işlem personellerin bu güzergahtan çıkarılmasına neden olur, geri alınamaz.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/routes/${r.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!d.ok) { alert(d.error || "Güzergah silinemedi"); return; }
      setDetailRoute(null);
      list.clearSelection();
      await loadRoutes();
    } finally { setSaving(false); }
  }

  async function bulkDeactivate() {
    if (list.selectedIds.length === 0) return;
    const res = await fetch("/api/bulk-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module: "routes", action: "deactivate", ids: list.selectedIds, execute: true }),
    });
    const json = await res.json();
    if (json.ok) {
      toast.success(`${json.job?.success_count ?? list.selectedIds.length} güzergah pasife alındı.`);
      list.clearSelection();
      await loadRoutes();
    } else {
      toast.error(json.error ?? "Toplu işlem başarısız");
    }
  }

  async function saveRoutePrice() {
    if (!detailRoute || !priceForm.price_amount.trim()) return;
    const vehicle = vehicles.find(v => v.id === detailRoute.vehicle_id);
    const plate = (priceForm.plate || detailRoute.vehicle_plate || vehicle?.plate || "").trim();
    if (!plate) { alert("Fiyat için plaka zorunlu"); return; }
    setSavingPrice(true);
    try {
      const res = await fetch("/api/route-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: detailRoute.company_id || selectedCompany,
          route_id: detailRoute.id,
          vehicle_id: detailRoute.vehicle_id || null,
          plate,
          price_amount: Number(priceForm.price_amount),
          currency: "TRY",
          valid_from: priceForm.valid_from,
          valid_to: priceForm.valid_to || null,
        }),
      });
      const d = await res.json();
      if (!d.ok) { alert(d.error || "Fiyat kaydedilemedi"); return; }
      setPriceForm({ price_amount: "", plate: "", valid_from: new Date().toISOString().slice(0, 10), valid_to: "" });
      await loadRoutes();
    } finally { setSavingPrice(false); }
  }

  const filteredRoutes = useMemo(() => {
    const search = list.search.trim().toLocaleLowerCase("tr-TR");
    return routes.filter(r => {
      if (list.filters.direction && r.direction !== list.filters.direction) return false;
      if (list.filters.status === "active" && !r.is_active) return false;
      if (list.filters.status === "inactive" && r.is_active) return false;
      if (!search) return true;
      return [r.name, r.code, r.driver_name, r.driver_phone, r.vehicle_plate]
        .filter(Boolean)
        .some(value => String(value).toLocaleLowerCase("tr-TR").includes(search));
    });
  }, [list.filters.direction, list.filters.status, list.search, routes]);

  const sortedRoutes = useMemo(() => {
    const collator = new Intl.Collator("tr-TR");
    return [...filteredRoutes].sort((a, b) => {
      const av = String(a[list.sort] ?? "");
      const bv = String(b[list.sort] ?? "");
      const result = collator.compare(av, bv);
      return list.sortDir === "asc" ? result : -result;
    });
  }, [filteredRoutes, list.sort, list.sortDir]);

  const pageCount = Math.max(1, Math.ceil(sortedRoutes.length / list.pageSize));
  const currentPage = Math.min(list.page, pageCount);
  const pageRoutes = useMemo(() => {
    const start = (currentPage - 1) * list.pageSize;
    return sortedRoutes.slice(start, start + list.pageSize);
  }, [currentPage, list.pageSize, sortedRoutes]);

  const selectPage = () => list.selectMany(pageRoutes.map(route => route.id));
  const selectFiltered = () => list.selectMany(sortedRoutes.map(route => route.id));

  const canEdit = hasPermission(user, "routes:update");
  const canDelete = hasPermission(user, "routes:delete");

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Güzergahlar</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{selectedCompany ? `${sortedRoutes.length}/${routes.length} güzergah` : "Firma seçin"}</p>
          </div>
          <div className="flex items-center gap-2">
            <a href={selectedCompany ? `/guzergahlar/rota?company_id=${selectedCompany}` : "/guzergahlar/rota"} className="bg-zinc-800 text-zinc-200 text-sm font-medium px-4 py-2 rounded-lg hover:bg-zinc-700 transition-colors border border-zinc-700">
              🗺 Rota Haritası
            </a>
            {canEdit && selectedCompany && (
              <button onClick={openCreate} className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors">+ Güzergah Ekle</button>
            )}
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Firma Seç</label>
          <ComboboxSearch
            options={companies.map(c => ({ value: c.id, label: c.name }))}
            value={selectedCompany}
            onChange={setSelectedCompany}
            placeholder="Firma ara..."
            emptyLabel="— Tüm Firmalar —"
            className="max-w-xs"
          />
        </div>

        {selectedCompany && unlinked.length > 0 && (
          <div className="mb-4 bg-amber-950/30 border border-amber-800/50 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowUnlinked(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-amber-950/40 transition-colors"
            >
              <span className="text-amber-300 text-sm font-medium">
                ⚠ {unlinked.length} güzergah adı araçlara serbest metin olarak girilmiş ama güzergah listesinde yok
              </span>
              <span className="text-amber-500 text-xs">{showUnlinked ? "▲ gizle" : "▼ göster"}</span>
            </button>
            {showUnlinked && (
              <div className="border-t border-amber-800/40 divide-y divide-amber-900/30">
                {unlinked.map(u => (
                  <div key={u.route_name} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-white text-sm truncate">{u.route_name}</p>
                      <p className="text-zinc-500 text-xs truncate" title={u.plates}>{u.vehicle_count} araç: {u.plates}</p>
                    </div>
                    {canEdit && (
                      <button
                        onClick={() => promoteUnlinked(u.route_name)}
                        disabled={promoting === u.route_name}
                        className="shrink-0 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {promoting === u.route_name ? "Ekleniyor..." : "Güzergah Olarak Ekle"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {selectedCompany && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <input
              value={list.search}
              onChange={e => list.setSearch(e.target.value)}
              placeholder="Güzergah, kod, araç veya sürücü ara..."
              className="min-w-[220px] flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
            />
            <select
              value={list.filters.direction}
              onChange={e => list.setFilter("direction", e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none"
            >
              <option value="">Tüm yönler</option>
              {DIR_OPTS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <select
              value={list.filters.status}
              onChange={e => list.setFilter("status", e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none"
            >
              <option value="">Tüm durumlar</option>
              <option value="active">Aktif</option>
              <option value="inactive">Pasif</option>
            </select>
            <select
              value={list.sort}
              onChange={e => list.toggleSort(e.target.value as RouteSort)}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none"
            >
              <option value="name">Ada göre</option>
              <option value="code">Koda göre</option>
              <option value="direction">Yöne göre</option>
              <option value="vehicle_plate">Araca göre</option>
              <option value="driver_name">Sürücüye göre</option>
            </select>
            <select
              value={list.pageSize}
              onChange={e => list.setPageSize(Number(e.target.value))}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none"
            >
              {[10, 25, 50, 100].map(size => <option key={size} value={size}>{size}/sayfa</option>)}
            </select>
            {(list.search || list.filters.direction || list.filters.status) && (
              <button onClick={list.clearFilters} className="text-xs text-zinc-400 underline hover:text-white">
                Filtreleri temizle
              </button>
            )}
          </div>
        )}

        <BulkActionBar
          selectedCount={list.selectedIds.length}
          pageCount={pageRoutes.length}
          filteredCount={sortedRoutes.length}
          onSelectPage={selectPage}
          onSelectFiltered={selectFiltered}
          onClear={list.clearSelection}
        >
          <button onClick={bulkDeactivate} className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-zinc-950 transition-colors hover:bg-amber-400">
            Toplu pasife al
          </button>
        </BulkActionBar>

        {!selectedCompany ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl py-16 text-center text-zinc-600 text-sm">
            Güzergahları görüntülemek için yukarıdan bir firma seçin
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-24 text-zinc-600 text-sm">Yükleniyor...</div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            {pageRoutes.length === 0 ? (
              <div className="py-16 text-center text-zinc-600 text-sm">Bu firmaya ait güzergah bulunamadı</div>
            ) : pageRoutes.map((r, i) => (
              <div key={r.id}
                className={`flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-zinc-800/40 transition-colors ${i < pageRoutes.length - 1 ? "border-b border-zinc-800/50" : ""} ${!r.is_active ? "opacity-50" : ""}`}
                onClick={() => { setDetailRoute(r); setDetailTab("general"); }}>
                <label className="shrink-0" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={list.isSelected(r.id)}
                    onChange={() => list.toggleSelected(r.id)}
                    className="h-4 w-4 rounded border-zinc-700 bg-zinc-900"
                    aria-label={`${r.name} seç`}
                  />
                </label>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-white font-semibold text-sm">{r.name}</span>
                    {r.code && <span className="text-zinc-600 text-xs font-mono">({r.code})</span>}
                    <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${r.is_active ? "bg-emerald-950 text-emerald-400" : "bg-zinc-800 text-zinc-500"}`}>
                      {r.is_active ? "Aktif" : "Pasif"}
                    </span>
                  </div>
                  <p className="text-zinc-500 text-xs">
                    {SCHEDULE_LABELS[r.schedule_mode || "fixed"] || r.schedule_mode || "Sabit sabah/akşam"}
                    {r.schedule_mode === "shift" && r.shift_name ? ` · ${r.shift_name}` : ` · ${DIR_LABELS[r.direction] || r.direction}`}
                    {r.capacity != null ? ` · Kapasite ${r.capacity}` : ""}
                  </p>
                  {r.driver_name && <p className="text-zinc-600 text-xs mt-0.5">Sürücü: {r.driver_name}{r.driver_phone ? ` · ${r.driver_phone}` : ""}</p>}
                </div>
                <div className="hidden lg:flex flex-col items-end gap-1 text-xs">
                  <span className={`rounded px-2 py-1 ${r.vehicle_assignment_status === "searching" ? "bg-red-950 text-red-300" : r.vehicle_assignment_status === "temporary" ? "bg-amber-950 text-amber-300" : "bg-emerald-950 text-emerald-300"}`}>
                    {VEHICLE_STATUS_LABELS[r.vehicle_assignment_status || "fixed"] || r.vehicle_assignment_status}
                  </span>
                  {r.active_price_amount && <span className="rounded bg-zinc-800 px-2 py-1 text-zinc-300">{Number(r.active_price_amount).toLocaleString("tr-TR")} {r.active_price_currency || "TRY"}</span>}
                </div>
                <div className="hidden md:flex flex-col items-end gap-0.5 text-xs text-zinc-500">
                  {(r.direction === "morning" || r.direction === "both") && r.morning_departure && (
                    <span>Sabah: {r.morning_departure} → {r.morning_arrival || "?"}</span>
                  )}
                  {(r.direction === "evening" || r.direction === "both") && r.evening_departure && (
                    <span>Akşam: {r.evening_departure} → {r.evening_arrival || "?"}</span>
                  )}
                </div>
                {r.vehicle_plate && (
                  <span className="hidden lg:block text-xs font-mono text-zinc-400 bg-zinc-800 px-2 py-1 rounded">{r.vehicle_plate}</span>
                )}
                <button
                  onClick={e => { e.stopPropagation(); openEdit(r); }}
                  className="shrink-0 text-xs font-medium px-2.5 py-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                  title="Düzenle"
                >
                  Düzenle
                </button>
              </div>
            ))}
          </div>
        )}
        {selectedCompany && sortedRoutes.length > list.pageSize && (
          <div className="mt-4 flex items-center justify-end gap-2 text-xs text-zinc-500">
            <span>Sayfa {currentPage}/{pageCount}</span>
            <button onClick={() => list.setPage(currentPage - 1)} disabled={currentPage <= 1} className="rounded-lg border border-zinc-700 px-3 py-2 text-zinc-300 disabled:opacity-40">
              Önceki
            </button>
            <button onClick={() => list.setPage(currentPage + 1)} disabled={currentPage >= pageCount} className="rounded-lg border border-zinc-700 px-3 py-2 text-zinc-300 disabled:opacity-40">
              Sonraki
            </button>
          </div>
        )}
      </main>

      {/* Detail popup */}
      {detailRoute && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4 py-8 overflow-y-auto" onClick={() => setDetailRoute(null)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-3xl my-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-white">{detailRoute.name}</h2>
                {detailRoute.code && <p className="text-zinc-500 text-xs font-mono">{detailRoute.code}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => openEdit(detailRoute)}
                  className="bg-zinc-800 text-zinc-200 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-zinc-700 transition-colors border border-zinc-700">
                  Düzenle
                </button>
                <button onClick={() => setDetailRoute(null)} className="text-zinc-600 hover:text-white text-xl">×</button>
              </div>
            </div>
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1 text-xs">
              {[
                ["general", "Genel"],
                ["vehicle", "Araç"],
                ["vardiya", "Vardiya/Tag"],
                ["prices", "Fiyatlar"],
                ["stops", "Duraklar/Harita"],
                ["personnel", "Personel"],
              ].map(([key, label]) => (
                <button key={key} onClick={() => setDetailTab(key as DetailTab)} className={`shrink-0 rounded-lg px-3 py-2 font-semibold transition-colors ${detailTab === key ? "bg-white text-zinc-950" : "bg-zinc-800 text-zinc-400 hover:text-white"}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="space-y-3 text-sm">
              {detailTab === "general" && <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-zinc-800 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs mb-1">Yön</p>
                  <p className="text-white">{DIR_LABELS[detailRoute.direction] || detailRoute.direction}</p>
                </div>
                <div className="bg-zinc-800 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs mb-1">Durum</p>
                  <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${detailRoute.is_active ? "bg-emerald-950 text-emerald-400" : "bg-zinc-700 text-zinc-500"}`}>
                    {detailRoute.is_active ? "Aktif" : "Pasif"}
                  </span>
                </div>
                <div className="bg-zinc-800 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs mb-1">Çalışma Tipi</p>
                  <p className="text-white">{SCHEDULE_LABELS[detailRoute.schedule_mode || "fixed"] || detailRoute.schedule_mode || "Sabit sabah/akşam"}</p>
                  {detailRoute.schedule_mode === "shift" && detailRoute.shift_name && <p className="text-zinc-400 text-xs mt-0.5">{detailRoute.shift_name}</p>}
                </div>
                <div className="bg-zinc-800 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs mb-1">Kapasite</p>
                  <p className="text-white">{detailRoute.capacity ?? "Sınırsız"}</p>
                </div>
              </div>
              {(detailRoute.direction === "morning" || detailRoute.direction === "both") && (
                <div className="bg-zinc-800 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs mb-1">Sabah Saatleri</p>
                  <p className="text-white">{detailRoute.morning_departure || "—"} → {detailRoute.morning_arrival || "—"}</p>
                </div>
              )}
              {(detailRoute.direction === "evening" || detailRoute.direction === "both") && (
                <div className="bg-zinc-800 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs mb-1">Akşam Saatleri</p>
                  <p className="text-white">{detailRoute.evening_departure || "—"} → {detailRoute.evening_arrival || "—"}</p>
                </div>
              )}
              {detailRoute.vehicle_plate && (
                <div className="bg-zinc-800 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs mb-1">Araç</p>
                  <p className="text-white font-mono">{detailRoute.vehicle_plate}</p>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-zinc-800 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs mb-1">Firma</p>
                  <p className="text-white">{detailRoute.company_name || companies.find(c => c.id === detailRoute.company_id)?.name || "—"}</p>
                </div>
                <div className="bg-zinc-800 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs mb-1">Araç Durumu</p>
                  <p className="text-white">{VEHICLE_STATUS_LABELS[detailRoute.vehicle_assignment_status || "fixed"] || detailRoute.vehicle_assignment_status}</p>
                </div>
              </div>
              {detailRoute.active_price_amount && (
                <div className="bg-zinc-800 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs mb-1">Aktif Fiyat</p>
                  <p className="text-white">{Number(detailRoute.active_price_amount).toLocaleString("tr-TR")} {detailRoute.active_price_currency || "TRY"}</p>
                </div>
              )}
              {detailRoute.driver_name && (
                <div className="bg-zinc-800 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs mb-1">Sürücü</p>
                  <p className="text-white">{detailRoute.driver_name}</p>
                  {detailRoute.driver_phone && <p className="text-zinc-400 text-xs mt-0.5">{detailRoute.driver_phone}</p>}
                </div>
              )}
              {detailRoute.notes && (
                <div className="bg-zinc-800 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs mb-1">Not</p>
                  <p className="text-zinc-300">{detailRoute.notes}</p>
                </div>
              )}
              </>}
              {detailTab === "vehicle" && <>
              {detailRoute.vehicle_plate && (
                <div className="bg-zinc-800 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs mb-1">Araç</p>
                  <p className="text-white font-mono">{detailRoute.vehicle_plate}</p>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-zinc-800 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs mb-1">Araç Durumu</p>
                  <p className="text-white">{VEHICLE_STATUS_LABELS[detailRoute.vehicle_assignment_status || "fixed"] || detailRoute.vehicle_assignment_status}</p>
                </div>
              </div>
              {detailRoute.driver_name && (
                <div className="bg-zinc-800 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs mb-1">Sürücü</p>
                  <p className="text-white">{detailRoute.driver_name}</p>
                  {detailRoute.driver_phone && <p className="text-zinc-400 text-xs mt-0.5">{detailRoute.driver_phone}</p>}
                </div>
              )}
              {!detailRoute.vehicle_plate && !detailRoute.driver_name && <div className="rounded-lg bg-zinc-800 p-4 text-zinc-500">Bu güzergaha sabit araç atanmadı.</div>}

              <div className="flex items-center justify-between pt-2">
                <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">Atama Geçmişi</p>
                {canEdit && (
                  <button onClick={() => setShowAtamaForm(true)}
                    className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors">
                    + Yeni Atama
                  </button>
                )}
              </div>

              {atamaLoading ? (
                <div className="text-zinc-600 text-xs">Yükleniyor...</div>
              ) : atamaGecmisi.length === 0 ? (
                <div className="rounded-lg bg-zinc-800 p-3 text-zinc-600 text-xs">Kayıtlı atama geçmişi yok — eski basit "Atanan Araç" alanı hâlâ geçerli, yukarıda görünür.</div>
              ) : (
                <div className="space-y-1.5">
                  {atamaGecmisi.map((a: any) => (
                    <div key={a.id} className="flex items-center gap-3 bg-zinc-800 rounded-lg px-3 py-2 text-xs">
                      <span className={`px-1.5 py-0.5 rounded border font-mono shrink-0 ${a.bitis_tarihi ? "bg-zinc-900 border-zinc-700 text-zinc-500" : "bg-emerald-950 border-emerald-800 text-emerald-300"}`}>
                        {a.plate}
                      </span>
                      <span className="text-zinc-500 shrink-0">{a.hareket_tipi || "Tüm vardiyalar"}{a.yon ? ` · ${a.yon === "giris" ? "Giriş" : "Çıkış"}` : ""}</span>
                      {a.company_name && <span className="text-zinc-600 shrink-0">· {a.company_name}</span>}
                      {a.driver_name && <span className="text-zinc-600 shrink-0">· {a.driver_name}</span>}
                      <span className="text-zinc-600 ml-auto shrink-0">
                        {a.baslangic_tarihi?.slice(0, 10)} — {a.bitis_tarihi ? a.bitis_tarihi.slice(0, 10) : "devam ediyor"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              </>}
              {detailTab === "vardiya" && <>
              {/* Vardiya saatleri */}
              <div>
                <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-2">Vardiya / Saat Dilimleri</p>
                {slotsLoading ? (
                  <div className="text-zinc-600 text-xs">Yükleniyor...</div>
                ) : timeSlots.length === 0 ? (
                  <div className="rounded-lg bg-zinc-800 p-3 text-zinc-600 text-xs mb-2">Henüz vardiya tanımlanmadı. Çetele ekranında bu güzergah için hareket tipi seçenekleri buradan gelir.</div>
                ) : (
                  <div className="space-y-1.5 mb-2">
                    {timeSlots.map((s: any) => (
                      <div key={s.id} className="flex items-center gap-3 bg-zinc-800 rounded-lg px-3 py-2 text-xs">
                        <span className="text-white font-medium">{s.ad}</span>
                        {(s.giris_saati || s.cikis_saati) && (
                          <span className="text-zinc-500">{s.giris_saati?.slice(0, 5) || "?"} → {s.cikis_saati?.slice(0, 5) || "?"}</span>
                        )}
                        {canEdit && (
                          <button onClick={() => deleteTimeSlot(s.id)} className="ml-auto text-zinc-600 hover:text-red-400 transition-colors">Kaldır</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {canEdit && (
                  <div className="bg-zinc-800/60 rounded-lg p-3 space-y-2">
                    <input value={slotForm.ad} onChange={e => setSlotForm(f => ({ ...f, ad: e.target.value }))}
                      placeholder="Vardiya adı (örn. 08:00 Vardiya, Gece Vardiyası)"
                      className="w-full bg-zinc-900 border border-zinc-700 text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                    <div className="grid grid-cols-2 gap-2">
                      <input type="time" value={slotForm.giris_saati} onChange={e => setSlotForm(f => ({ ...f, giris_saati: e.target.value }))}
                        className="w-full bg-zinc-900 border border-zinc-700 text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
                      <input type="time" value={slotForm.cikis_saati} onChange={e => setSlotForm(f => ({ ...f, cikis_saati: e.target.value }))}
                        className="w-full bg-zinc-900 border border-zinc-700 text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
                    </div>
                    <button onClick={saveTimeSlot} disabled={savingSlot || !slotForm.ad.trim()}
                      className="w-full bg-white text-zinc-950 text-xs font-semibold py-2 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                      {savingSlot ? "Ekleniyor..." : "+ Vardiya Ekle"}
                    </button>
                  </div>
                )}
              </div>

              {/* Taglar */}
              <div className="pt-2">
                <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-2">Taglar</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {allTags.length === 0 ? (
                    <span className="text-zinc-600 text-xs">Henüz tag tanımlanmadı.</span>
                  ) : allTags.map((t: any) => {
                    const active = routeTags.some((rt: any) => rt.id === t.id);
                    return (
                      <button key={t.id} onClick={() => canEdit && toggleRouteTag(t.id, active)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          active ? "bg-indigo-950 border-indigo-700 text-indigo-300" : "bg-zinc-800 border-zinc-700 text-zinc-500 hover:text-white"
                        }`}>
                        {t.name}
                      </button>
                    );
                  })}
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <input value={newTagName} onChange={e => setNewTagName(e.target.value)}
                      placeholder="Yeni tag (örn. vardiya, memur, mesai, ek araç)"
                      className="flex-1 bg-zinc-800 border border-zinc-700 text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                    <button onClick={createAndAttachTag} disabled={savingTag || !newTagName.trim()}
                      className="bg-zinc-800 text-zinc-200 text-xs font-medium px-3 py-2 rounded-lg hover:bg-zinc-700 disabled:opacity-50 transition-colors">
                      Ekle
                    </button>
                  </div>
                )}
              </div>
              </>}
              {detailTab === "prices" && <>
              {detailRoute.active_price_amount ? (
                <div className="bg-zinc-800 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs mb-1">Aktif Fiyat</p>
                  <p className="text-white text-lg font-bold">{Number(detailRoute.active_price_amount).toLocaleString("tr-TR")} {detailRoute.active_price_currency || "TRY"}</p>
                </div>
              ) : <div className="rounded-lg bg-zinc-800 p-4 text-zinc-500">Aktif fiyat kaydı yok.</div>}
              {canEdit && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Yeni fiyat gir</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input type="number" value={priceForm.price_amount} onChange={e => setPriceForm(f => ({ ...f, price_amount: e.target.value }))} placeholder="Fiyat" className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-[16px] text-white outline-none" />
                    <input value={priceForm.plate || detailRoute.vehicle_plate || ""} onChange={e => setPriceForm(f => ({ ...f, plate: e.target.value.toUpperCase() }))} placeholder="Plaka" className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-[16px] text-white outline-none uppercase" />
                    <input type="date" value={priceForm.valid_from} onChange={e => setPriceForm(f => ({ ...f, valid_from: e.target.value }))} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-[16px] text-white outline-none" />
                    <input type="date" value={priceForm.valid_to} onChange={e => setPriceForm(f => ({ ...f, valid_to: e.target.value }))} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-[16px] text-white outline-none" />
                  </div>
                  <button onClick={saveRoutePrice} disabled={savingPrice || !priceForm.price_amount.trim()} className="w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-zinc-950 disabled:bg-zinc-700 disabled:text-zinc-500">{savingPrice ? "Kaydediliyor..." : "Fiyatı kaydet"}</button>
                </div>
              )}
              <button onClick={() => router.push(`/guzergah-fiyatlari`)} className="w-full rounded-lg bg-zinc-800 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-700">Fiyat geçmişine git</button>
              </>}
              {detailTab === "stops" && (() => {
                const stops = (() => { try { return JSON.parse(detailRoute.stops_json || "[]"); } catch { return []; } })();
                return (
                  <div>
                    <p className="text-zinc-500 text-xs mb-2">Rota Haritası</p>
                    <RouteMap stops={stops} routeName={detailRoute.name} />
                  </div>
                );
              })()}
              {detailTab === "personnel" && <div className="rounded-lg bg-zinc-800 p-4 text-zinc-500">Personel atamaları rota haritası düzenleme ekranından yönetilir.</div>}
            </div>
            {canEdit && (
              <div className="flex flex-col sm:flex-row gap-3 mt-5">
                {canDelete && (
                  <button onClick={() => deleteRoute(detailRoute)} disabled={saving}
                    className="flex-1 text-sm font-semibold py-2.5 rounded-lg transition-colors bg-red-950 text-red-300 hover:bg-red-900 disabled:opacity-50">
                    Sil
                  </button>
                )}
                <button onClick={() => toggleActive(detailRoute)}
                  className={`flex-1 text-sm font-medium py-2.5 rounded-lg transition-colors ${detailRoute.is_active ? "bg-zinc-800 text-amber-400 hover:bg-zinc-700" : "bg-zinc-800 text-emerald-400 hover:bg-zinc-700"}`}>
                  {detailRoute.is_active ? "Durdur" : "Aktifleştir"}
                </button>
                <button onClick={() => router.push(`/guzergahlar/rota?company_id=${detailRoute.company_id || selectedCompany}&route_id=${detailRoute.id}`)}
                  className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 transition-colors">
                  Düzenle
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Atama modal */}
      {showAtamaForm && detailRoute && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] px-4" onClick={() => setShowAtamaForm(false)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-semibold">Yeni Atama — {detailRoute.name}</h3>

            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Vardiya</label>
              <select value={atamaForm.hareket_tipi} onChange={e => setAtamaForm(f => ({ ...f, hareket_tipi: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                <option value="">Tüm vardiyalar (varsayılan)</option>
                {timeSlots.map((s: any) => <option key={s.id} value={s.ad}>{s.ad}</option>)}
              </select>
              {timeSlots.length === 0 && (
                <p className="text-zinc-600 text-[11px] mt-1">Bu güzergahta vardiya tanımlanmadı — "Vardiya/Tag" tabından ekleyebilirsiniz.</p>
              )}
            </div>

            {detailRoute.arac_modu === "ayri" && (
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Yön</label>
                <select value={atamaForm.yon} onChange={e => setAtamaForm(f => ({ ...f, yon: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                  <option value="">İkisi de (sabit)</option>
                  <option value="giris">Sadece Giriş</option>
                  <option value="cikis">Sadece Çıkış</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Araç *</label>
              <ComboboxSearch
                options={vehicles.map(v => ({ value: v.id, label: `${v.plate}${v.driver_name ? ` · ${v.driver_name}` : ""}` }))}
                value={atamaForm.vehicle_id}
                onChange={val => setAtamaForm(f => ({ ...f, vehicle_id: val }))}
                emptyLabel="— Araç seç —"
                placeholder="Plaka ara..."
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Sürücü</label>
              <ComboboxSearch
                options={drivers.map((d: any) => ({ value: d.id, label: d.name }))}
                value={atamaForm.driver_id}
                onChange={val => setAtamaForm(f => ({ ...f, driver_id: val }))}
                emptyLabel="— Sürücü seç —"
                placeholder="Sürücü ara..."
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Firma</label>
              <ComboboxSearch
                options={companies.map((c: any) => ({ value: c.id, label: c.name }))}
                value={atamaForm.company_id}
                onChange={val => setAtamaForm(f => ({ ...f, company_id: val }))}
                emptyLabel="— Güzergahın firması —"
                placeholder="Firma ara..."
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Başlangıç Tarihi *</label>
              <input type="date" value={atamaForm.baslangic_tarihi} onChange={e => setAtamaForm(f => ({ ...f, baslangic_tarihi: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Açıklama</label>
              <input value={atamaForm.aciklama} onChange={e => setAtamaForm(f => ({ ...f, aciklama: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" placeholder="Neden değişti?" />
            </div>

            <p className="text-zinc-600 text-xs">
              "Tüm hareketler" seçilirse güzergahın varsayılan aracı/sürücüsü de güncellenir. Belirli bir hareket tipi (örn. sadece Akşam) seçilirse sadece o slotu etkiler — aynı güzergahta sabah farklı, akşam farklı firma/araç olabilir.
            </p>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowAtamaForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={saveAtama} disabled={savingAtama || !atamaForm.vehicle_id || !atamaForm.baslangic_tarihi}
                className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors">
                {savingAtama ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-start justify-center z-50 px-4 overflow-y-auto py-8">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-lg my-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">{editing ? "Güzergah Düzenle" : "Güzergah Ekle"}</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-600 hover:text-white text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Güzergah Adı *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" placeholder="Kadıköy - Şişli" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Kod</label>
                  <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" placeholder="R-01" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Kapasite</label>
                  <input type="number" min={0} max={1000} value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" placeholder="Sınırsız" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Çalışma Tipi</label>
                  <select value={form.schedule_mode} onChange={e => setForm(f => ({ ...f, schedule_mode: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                    <option value="fixed">Sabit sabah/akşam</option>
                    <option value="shift">Vardiya</option>
                  </select>
                </div>
              </div>
              {form.schedule_mode === "shift" ? (
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Vardiya Adı</label>
                  <input value={form.shift_name} onChange={e => setForm(f => ({ ...f, shift_name: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" placeholder="Örn: 08:00-16:00 / Gece" />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Yön</label>
                  <select value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                    {DIR_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              )}
              {form.schedule_mode !== "shift" && (form.direction === "morning" || form.direction === "both") && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Sabah Kalkış</label>
                    <input type="time" value={form.morning_departure} onChange={e => setForm(f => ({ ...f, morning_departure: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Sabah Varış</label>
                    <input type="time" value={form.morning_arrival} onChange={e => setForm(f => ({ ...f, morning_arrival: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                  </div>
                </div>
              )}
              {form.schedule_mode !== "shift" && (form.direction === "evening" || form.direction === "both") && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Akşam Kalkış</label>
                    <input type="time" value={form.evening_departure} onChange={e => setForm(f => ({ ...f, evening_departure: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Akşam Varış</label>
                    <input type="time" value={form.evening_arrival} onChange={e => setForm(f => ({ ...f, evening_arrival: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Araç Durumu</label>
                <select value={form.vehicle_assignment_status} onChange={e => setForm(f => ({ ...f, vehicle_assignment_status: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                  <option value="fixed">Sabit</option>
                  <option value="temporary">Geçici</option>
                  <option value="searching">Araç aranıyor</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Giriş/Çıkış Araç Modu</label>
                <select value={form.arac_modu} onChange={e => setForm(f => ({ ...f, arac_modu: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                  <option value="sabit">Sabit (aynı araç giriş+çıkış)</option>
                  <option value="ayri">Ayrı (giriş ve çıkış farklı araç olabilir)</option>
                </select>
                <p className="text-zinc-600 text-[11px] mt-1">Ayrı seçilirse, atama geçmişinde giriş ve çıkış için ayrı ayrı araç atayabilirsiniz.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Atanan Araç</label>
                <ComboboxSearch
                  options={vehicles.map(v => ({ value: v.id, label: `${v.plate}${v.driver_name ? ` · ${v.driver_name}` : ""}` }))}
                  value={form.vehicle_id}
                  onChange={val => onVehicleChange(val)}
                  emptyLabel="— Araç seç —"
                  placeholder="Plaka veya şöför ara..."
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Sürücü Adı</label>
                  <input value={form.driver_name} onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" placeholder="Ad Soyad" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Sürücü Telefonu</label>
                  <input value={form.driver_phone} onChange={e => setForm(f => ({ ...f, driver_phone: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" placeholder="05xx xxx xx xx" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Not</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Duraklar</label>
                <RouteMapEditor
                  stops={form.stops}
                  onChange={stops => setForm(f => ({ ...f, stops }))}
                />
              </div>
            </div>
            {!form.vehicle_id && (
              <p className="text-amber-500 text-xs mt-3">
                Araç atanmadı — bu güzergah Çetele'de "araç atanmamış" görünecek ve onay için önce araç atamanız gerekecek.
              </p>
            )}
            {form.schedule_mode === "shift" && !form.shift_name.trim() && (
              <p className="text-amber-500 text-xs mt-1">
                Vardiya adı boş — Çetele'de bu güzergah "vardiya tanımlanmadı" olarak görünecek, günlük onay yerine yalnızca Serbest Kayıt ile giriş yapılabilecek.
              </p>
            )}
            <div className="flex gap-3 mt-3">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving || !form.name.trim()}
                className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors">
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
