"use client";
import { toast } from "@/lib/toast";
import { hasPermission } from "@/lib/permissions";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import BulkActionBar from "@/components/BulkActionBar";
import Nav from "@/components/Nav";
import { useListState } from "@/hooks/useListState";

const DEFAULT_COMPANY_FILTERS = { status: "" };

export default function FirmalarPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  useEffect(() => { fetch("/api/auth/me").then(r => r.json()).then(d => { if (d.ok) setUser(d.data); else router.replace("/login"); }).catch(() => { router.replace("/login"); }); }, []);
  const [companies, setCompanies] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const list = useListState<"name" | "vehicles" | "responsible", { status: string }>({
    defaultSort: "name",
    defaultPageSize: 20,
    defaultFilters: DEFAULT_COMPANY_FILTERS,
  });

  // Add company
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [companyForm, setCompanyForm] = useState({ name: "", notes: "" });
  const [savingCompany, setSavingCompany] = useState(false);

  // Add vehicle
  const [addVehicleFor, setAddVehicleFor] = useState<string | null>(null);
  const [plateInput, setPlateInput] = useState("");
  const [driverNameInput, setDriverNameInput] = useState("");
  const [routeNameInput, setRouteNameInput] = useState("");
  const [isTemporaryInput, setIsTemporaryInput] = useState(true); // varsayılan geçici
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [togglingVehicle, setTogglingVehicle] = useState<string | null>(null);

  // Excel upload
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ inserted: number; skipped: number } | null>(null);

  // Edit company
  const [editCompany, setEditCompany] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ name: "", notes: "", responsible_id: "" });
  const [savingEdit, setSavingEdit] = useState(false);

  // Çoklu yetkili yönetimi
  const [responsibles, setResponsibles] = useState<any[]>([]);
  const [loadingResponsibles, setLoadingResponsibles] = useState(false);
  const [addingResponsible, setAddingResponsible] = useState(false);
  const [newResponsibleId, setNewResponsibleId] = useState("");
  const [removingResponsible, setRemovingResponsible] = useState<string | null>(null);

  // Users list (for responsible dropdown)
  const [usersList, setUsersList] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/users?simple=1").then(r => r.json()).then(d => { if (d.ok) setUsersList(d.data); }).catch(() => {});
  }, []);

  // Edit vehicle
  const [editVehicle, setEditVehicle] = useState<{ companyId: string; vehicle: any } | null>(null);
  const [editVehicleForm, setEditVehicleForm] = useState({ plate: "", driver_name: "", route_name: "", notes: "" });
  const [savingEditVehicle, setSavingEditVehicle] = useState(false);

  // Vehicle history
  const [historyVehicle, setHistoryVehicle] = useState<any | null>(null);
  const [historyData, setHistoryData] = useState<any | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  async function loadHistory(vehicle: any) {
    setHistoryVehicle(vehicle);
    setHistoryData(null);
    setHistoryLoading(true);
    try {
      const r = await fetch(`/api/vehicles/history?vehicle_id=${vehicle.id}&limit=20`);
      const d = await r.json();
      if (d.ok) setHistoryData(d.data);
      else setHistoryData({ error: d.error });
    } catch { setHistoryData({ error: "Sunucuya bağlanılamadı" }); }
    finally { setHistoryLoading(false); }
  }

  // Remove vehicle
  const [removingVehicle, setRemovingVehicle] = useState<string | null>(null);

  // Vardiya (shifts)
  const [shiftsMap, setShiftsMap] = useState<Record<string, any[]>>({});
  const [addShiftFor, setAddShiftFor] = useState<string | null>(null);
  const [shiftForm, setShiftForm] = useState({ shift_name: "", expected_time: "", tolerance_early: "15", tolerance_late: "10" });
  const [savingShift, setSavingShift] = useState(false);
  const [deletingShift, setDeletingShift] = useState<string | null>(null);

  useEffect(() => { loadCompanies(); }, []);

  function canEditCompany(c: any) {
    if (!user) return false;
    if (hasPermission(user, "companies:update")) return true;
    if (user.role === "yetkili" && c.responsible_id && c.responsible_id === user.id) return true;
    return false;
  }

  async function loadCompanies() {
    setLoading(true);
    try {
      const r = await fetch("/api/companies?limit=9999");
      const d = await r.json();
      if (d.ok) setCompanies(d.data);
    } finally { setLoading(false); }
  }

  async function loadVehicles(companyId: string) {
    const r = await fetch(`/api/companies/${companyId}/vehicles`);
    const d = await r.json();
    if (d.ok) setVehicles(v => ({ ...v, [companyId]: d.data }));
  }

  function toggleExpand(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    loadVehicles(id);
    loadShifts(id);
  }

  async function saveCompany() {
    if (!companyForm.name.trim()) return;
    setSavingCompany(true);
    try {
      const r = await fetch("/api/companies", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(companyForm),
      });
      const d = await r.json();
      if (d.ok) { setShowAddCompany(false); setCompanyForm({ name: "", notes: "" }); loadCompanies(); }
      else toast.error(d.error);
    } finally { setSavingCompany(false); }
  }

  async function saveVehicle(companyId: string) {
    if (!plateInput.trim()) return;
    setSavingVehicle(true);
    try {
      const r = await fetch(`/api/companies/${companyId}/vehicles`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plate: plateInput, driver_name: driverNameInput.trim() || undefined, route_name: routeNameInput.trim() || undefined, is_temporary: isTemporaryInput }),
      });
      const d = await r.json();
      if (d.ok) { setAddVehicleFor(null); setPlateInput(""); setDriverNameInput(""); setRouteNameInput(""); setIsTemporaryInput(true); loadVehicles(companyId); loadCompanies(); }
      else toast.error(d.error);
    } finally { setSavingVehicle(false); }
  }

  async function toggleVehicleTemporary(companyId: string, vehicle: any) {
    setTogglingVehicle(vehicle.id);
    try {
      const r = await fetch(`/api/companies/${companyId}/vehicles?vehicleId=${vehicle.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plate: vehicle.plate, driver_name: vehicle.driver_name, route_name: vehicle.route_name, notes: vehicle.notes, is_temporary: !vehicle.is_temporary }),
      });
      const d = await r.json();
      if (d.ok) loadVehicles(companyId);
      else toast.error(d.error);
    } finally { setTogglingVehicle(null); }
  }

  async function saveEditCompany() {
    if (!editCompany || !editForm.name.trim()) return;
    setSavingEdit(true);
    try {
      const r = await fetch(`/api/companies/${editCompany.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          notes: editForm.notes,
          responsible_id: editForm.responsible_id || null,
          sort_mode: editCompany.sort_mode || "manual",
        }),
      });
      const d = await r.json();
      if (d.ok) { setEditCompany(null); loadCompanies(); }
      else toast.error(d.error);
    } finally { setSavingEdit(false); }
  }

  async function loadResponsibles(companyId: string) {
    setLoadingResponsibles(true);
    try {
      const r = await fetch(`/api/companies/${companyId}/responsible`);
      const d = await r.json();
      if (d.ok) setResponsibles(d.data);
    } finally { setLoadingResponsibles(false); }
  }

  async function addResponsible(companyId: string) {
    if (!newResponsibleId) return;
    setAddingResponsible(true);
    try {
      const r = await fetch(`/api/companies/${companyId}/responsible`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: newResponsibleId }),
      });
      const d = await r.json();
      if (d.ok) { setNewResponsibleId(""); loadResponsibles(companyId); }
      else toast.error(d.error);
    } finally { setAddingResponsible(false); }
  }

  async function removeResponsible(companyId: string, userId: string) {
    setRemovingResponsible(userId);
    try {
      const r = await fetch(`/api/companies/${companyId}/responsible?user_id=${userId}`, { method: "DELETE" });
      const d = await r.json();
      if (d.ok) loadResponsibles(companyId);
      else toast.error(d.error);
    } finally { setRemovingResponsible(null); }
  }

  async function loadShifts(companyId: string) {
    try {
      const r = await fetch(`/api/company-shifts?company_id=${companyId}`);
      const d = await r.json();
      if (d.ok) setShiftsMap(m => ({ ...m, [companyId]: d.data }));
    } catch {}
  }

  async function saveShift(companyId: string) {
    if (!shiftForm.shift_name.trim() || !shiftForm.expected_time) return;
    setSavingShift(true);
    try {
      const r = await fetch("/api/company-shifts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, shift_name: shiftForm.shift_name, expected_time: shiftForm.expected_time, tolerance_early: Number(shiftForm.tolerance_early), tolerance_late: Number(shiftForm.tolerance_late) }),
      });
      const d = await r.json();
      if (d.ok) { setAddShiftFor(null); setShiftForm({ shift_name: "", expected_time: "", tolerance_early: "15", tolerance_late: "10" }); loadShifts(companyId); }
      else toast.error(d.error);
    } finally { setSavingShift(false); }
  }

  async function deleteShift(id: string, companyId: string) {
    setDeletingShift(id);
    try {
      const r = await fetch(`/api/company-shifts?id=${id}`, { method: "DELETE" });
      const d = await r.json();
      if (d.ok) loadShifts(companyId);
      else toast.error(d.error);
    } finally { setDeletingShift(null); }
  }

  async function saveEditVehicle() {
    if (!editVehicle || !editVehicleForm.plate.trim()) return;
    setSavingEditVehicle(true);
    try {
      const payload = { plate: editVehicleForm.plate, driver_name: editVehicleForm.driver_name, route_name: editVehicleForm.route_name || null, notes: editVehicleForm.notes };
      const r = await fetch(
        `/api/companies/${editVehicle.companyId}/vehicles?vehicleId=${editVehicle.vehicle.id}`,
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
      );
      const d = await r.json();
      if (d.ok) { setEditVehicle(null); loadVehicles(editVehicle.companyId); }
      else toast.error(d.error);
    } finally { setSavingEditVehicle(false); }
  }

  async function removeVehicle(companyId: string, vehicleId: string) {
    if (!confirm("Bu aracı firmadan kaldırmak istediğinize emin misiniz?")) return;
    setRemovingVehicle(vehicleId);
    try {
      const r = await fetch(`/api/companies/${companyId}/vehicles?vehicleId=${vehicleId}`, { method: "DELETE" });
      const d = await r.json();
      if (d.ok) { loadVehicles(companyId); loadCompanies(); }
      else toast.error(d.error);
    } finally { setRemovingVehicle(null); }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/companies/upload", { method: "POST", body: fd });
      const d = await r.json();
      if (d.ok) { setUploadResult(d.data); loadCompanies(); }
      else toast.error(d.error);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const visibleCompanies = companies
    .filter(c => {
      const q = list.search.trim().toLowerCase();
      if (!q) return true;
      return [c.name, c.responsible_names, c.responsible_name, c.notes]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(q));
    })
    .filter(c => {
      if (!list.filters.status) return true;
      const active = c.is_active === 1 || c.is_active === true || c.status === "active" || c.status === "aktif";
      return list.filters.status === "active" ? active : !active;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (list.sort === "name") cmp = String(a.name || "").localeCompare(String(b.name || ""), "tr");
      else if (list.sort === "vehicles") cmp = Number(a.vehicle_count || 0) - Number(b.vehicle_count || 0);
      else if (list.sort === "responsible") cmp = String(a.responsible_names || a.responsible_name || "").localeCompare(String(b.responsible_names || b.responsible_name || ""), "tr");
      if (cmp === 0) cmp = String(a.name || "").localeCompare(String(b.name || ""), "tr");
      return list.sortDir === "asc" ? cmp : -cmp;
    });
  const totalPages = Math.max(1, Math.ceil(visibleCompanies.length / list.pageSize));
  const paginatedCompanies = visibleCompanies.slice((list.page - 1) * list.pageSize, list.page * list.pageSize);
  const pageIds = paginatedCompanies.map(c => String(c.id));
  const filteredIds = visibleCompanies.map(c => String(c.id));

  async function bulkDeactivateCompanies() {
    if (list.selectedIds.length === 0) return;
    if (!confirm(`${list.selectedIds.length} firma pasife alınsın mı?`)) return;
    const d = await fetch("/api/bulk-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module: "companies", action: "deactivate", ids: list.selectedIds, execute: true }),
    }).then(r => r.json()).catch(() => null);
    if (!d?.ok) { toast.error(d?.error || "Toplu işlem başarısız"); return; }
    toast.success(`${d.data.success} firma pasife alındı`);
    list.clearSelection();
    loadCompanies();
  }

  useEffect(() => {
    if (list.page > totalPages) list.setPage(totalPages);
  }, [list, totalPages]);

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Firmalar</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{visibleCompanies.length} firma kayıtlı</p>
          </div>
          <div className="flex gap-2">
            {/* Excel Upload */}
            <label className={`cursor-pointer bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm font-medium px-4 py-2 rounded-lg hover:bg-zinc-700 transition-colors ${uploading ? "opacity-50 cursor-not-allowed" : ""}`}>
              {uploading ? "Yükleniyor..." : "Excel Yükle"}
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
            <button onClick={() => setShowAddCompany(true)} className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors">
              + Firma Ekle
            </button>
          </div>
        </div>

        {/* Upload result */}
        {uploadResult && (
          <div className="mb-4 px-4 py-3 bg-emerald-950 border border-emerald-800 rounded-xl text-emerald-300 text-sm flex items-center justify-between">
            <span>✓ {uploadResult.inserted} araç eklendi, {uploadResult.skipped} atlandı</span>
            <button onClick={() => setUploadResult(null)} className="text-emerald-500 hover:text-white ml-4">×</button>
          </div>
        )}

        {/* Excel format hint */}
        <div className="mb-5 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl">
          <p className="text-zinc-500 text-xs">
            <span className="text-zinc-400 font-medium">Excel formatı:</span> A = Firma Adı, B = Plaka, C = Güzergah (güzergah adı, opsiyonel), D = Şöför (opsiyonel). İlk satır başlık (atlanır). Plaka boş ise satır eklenmez. Firma yoksa otomatik oluşturulur.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <input
            value={list.search}
            onChange={e => list.setSearch(e.target.value)}
            placeholder="Firma, sorumlu veya not ara..."
            className="flex-1 bg-zinc-900 border border-zinc-800 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-zinc-600 placeholder-zinc-600"
          />
          <select
            value={list.filters.status}
            onChange={e => list.setFilter("status", e.target.value)}
            className="bg-zinc-900 border border-zinc-800 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-zinc-600"
          >
            <option value="">Tüm Durumlar</option>
            <option value="active">Aktif</option>
            <option value="inactive">Pasif</option>
          </select>
          {(list.search || list.filters.status) && (
            <button onClick={list.clearFilters} className="text-xs font-medium px-3 py-2 rounded-xl border border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-white transition-colors">
              Filtreleri temizle
            </button>
          )}
        </div>

        {/* Sort controls */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-zinc-600 text-xs">Sırala:</span>
          {([["name", "Firma"], ["vehicles", "Araç"], ["responsible", "Sorumlu"]] as const).map(([field, label]) => (
            <button key={field} onClick={() => list.toggleSort(field)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${list.sort === field ? "bg-zinc-700 border-zinc-600 text-white" : "border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-600"}`}>
              {label} {list.sort === field ? (list.sortDir === "asc" ? "↑" : "↓") : ""}
            </button>
          ))}
          <select value={list.pageSize} onChange={e => list.setPageSize(Number(e.target.value))}
            className="ml-auto bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-zinc-600">
            {[20, 50, 100].map(size => <option key={size} value={size}>{size}/sayfa</option>)}
          </select>
        </div>

        <BulkActionBar
          selectedCount={list.selectedIds.length}
          pageCount={paginatedCompanies.length}
          filteredCount={visibleCompanies.length}
          onSelectPage={() => list.selectMany(pageIds)}
          onSelectFiltered={() => list.setSelectedIds(filteredIds)}
          onClear={list.clearSelection}
        >
          <button disabled className="rounded-lg border border-sky-800 px-3 py-2 text-xs font-semibold text-sky-400/70 opacity-70">
            Toplu export · yakında
          </button>
          <button onClick={bulkDeactivateCompanies} className="rounded-lg border border-sky-700 px-3 py-2 text-xs font-semibold text-sky-100 transition-colors hover:bg-sky-900">
            Toplu pasife al
          </button>
        </BulkActionBar>

        {/* Companies list */}
        {loading ? (
          <div className="py-16 text-center text-zinc-600 text-sm">Yükleniyor...</div>
        ) : visibleCompanies.length === 0 ? (
          <div className="py-16 text-center text-zinc-600 text-sm">Henüz firma eklenmedi</div>
        ) : (
          <>
          <div className="space-y-3">
            {paginatedCompanies.map(c => {
              const selected = list.isSelected(String(c.id));
              return (
              <div key={c.id} className={`bg-zinc-900 border rounded-xl overflow-hidden ${selected ? "ring-2 ring-sky-500/70 border-sky-700" : "border-zinc-800"}`}>
                {/* Company header */}
                <div
                  className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-zinc-800/50 transition-colors"
                  onClick={() => router.push(`/firmalar/${c.id}`)}
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <input
                      type="checkbox"
                      checked={selected}
                      onClick={e => e.stopPropagation()}
                      onChange={() => list.toggleSelected(String(c.id))}
                      className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 accent-sky-500"
                      aria-label={`${c.name} seç`}
                    />
                    <span className="text-white font-semibold">{c.name}</span>
                    <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">{c.vehicle_count} araç</span>
                    {(c.responsible_names || c.responsible_name) && (
                      <span className="text-xs text-blue-400 bg-blue-950/50 px-2 py-0.5 rounded-full">👤 {c.responsible_names || c.responsible_name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {canEditCompany(c) && (
                      <button onClick={e => { e.stopPropagation(); setEditForm({ name: c.name, notes: c.notes || "", responsible_id: c.responsible_id || "" }); setEditCompany(c); setNewResponsibleId(""); loadResponsibles(c.id); }}
                        className="text-zinc-600 hover:text-white text-xs transition-colors">
                        Düzenle
                      </button>
                    )}
                    <span className="text-zinc-600 text-sm">{expanded === c.id ? "▲" : "▼"}</span>
                  </div>
                </div>

                {/* Expanded: vehicle list */}
                {expanded === c.id && (
                  <div className="border-t border-zinc-800 px-5 py-4">
                    {(vehicles[c.id] || []).length === 0 ? (
                      <p className="text-zinc-600 text-sm mb-3">Bu firmaya ait araç yok</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-4">
                        {(vehicles[c.id] || []).map((v: any) => (
                          <div key={v.id} className="flex items-center justify-between bg-zinc-800 rounded-lg px-3 py-2 gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-white text-sm font-mono font-medium">{v.plate}</span>
                                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${v.is_temporary ? "bg-amber-900/60 text-amber-400" : "bg-emerald-900/60 text-emerald-400"}`}>
                                  {v.is_temporary ? "Geçici" : "Kalıcı"}
                                </span>
                              </div>
                              {v.route_name && <div className="text-emerald-500 text-xs mt-0.5 truncate">{v.route_name}</div>}
                              {v.driver_name && <div className="text-zinc-500 text-xs mt-0.5 truncate">{v.driver_name}</div>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {canEditCompany(c) && (
                                <button
                                  onClick={() => toggleVehicleTemporary(c.id, v)}
                                  disabled={togglingVehicle === v.id}
                                  className={`text-xs transition-colors disabled:opacity-40 ${v.is_temporary ? "text-amber-500 hover:text-emerald-400" : "text-emerald-500 hover:text-amber-400"}`}
                                  title={v.is_temporary ? "Kalıcıya çevir" : "Geçiciye çevir"}
                                >{togglingVehicle === v.id ? "..." : v.is_temporary ? "→Kalıcı" : "→Geçici"}</button>
                              )}
                              {canEditCompany(c) && (
                                <button
                                  onClick={() => { setEditVehicle({ companyId: c.id, vehicle: v }); setEditVehicleForm({ plate: v.plate, driver_name: v.driver_name || "", route_name: v.route_name || "", notes: v.notes || "" }); }}
                                  className="text-zinc-500 hover:text-white text-xs transition-colors"
                                  title="Düzenle"
                                >Düzenle</button>
                              )}
                              <button
                                onClick={() => loadHistory(v)}
                                className="text-zinc-500 hover:text-blue-400 text-xs transition-colors"
                                title="Geçmiş"
                              >Geçmiş</button>
                              {canEditCompany(c) && (
                                <button
                                  onClick={() => removeVehicle(c.id, v.id)}
                                  disabled={removingVehicle === v.id}
                                  className="text-zinc-600 hover:text-red-400 text-xs transition-colors disabled:opacity-40"
                                  title="Kaldır"
                                >{removingVehicle === v.id ? "..." : "✕"}</button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add vehicle inline */}
                    {canEditCompany(c) && addVehicleFor === c.id ? (
                      <div className="space-y-2">
                        <input
                          value={plateInput}
                          onChange={e => setPlateInput(e.target.value.toUpperCase())}
                          onKeyDown={e => { if (e.key === "Escape") setAddVehicleFor(null); }}
                          placeholder="Plaka (34 AB 1234)"
                          className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 font-mono"
                          autoFocus
                        />
                        <input
                          value={driverNameInput}
                          onChange={e => setDriverNameInput(e.target.value)}
                          placeholder="Şöför adı (opsiyonel)"
                          className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500"
                        />
                        <input
                          value={routeNameInput}
                          onChange={e => setRouteNameInput(e.target.value)}
                          placeholder="Güzergah (opsiyonel)"
                          className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500"
                        />
                        {/* Geçici / Kalıcı toggle */}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setIsTemporaryInput(true)}
                            className={`flex-1 text-sm font-medium py-2 rounded-lg border transition-colors ${isTemporaryInput ? "bg-amber-900/60 border-amber-700 text-amber-300" : "bg-zinc-800 border-zinc-700 text-zinc-500 hover:text-zinc-300"}`}
                          >Geçici</button>
                          <button
                            type="button"
                            onClick={() => setIsTemporaryInput(false)}
                            className={`flex-1 text-sm font-medium py-2 rounded-lg border transition-colors ${!isTemporaryInput ? "bg-emerald-900/60 border-emerald-700 text-emerald-300" : "bg-zinc-800 border-zinc-700 text-zinc-500 hover:text-zinc-300"}`}
                          >Kalıcı</button>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => saveVehicle(c.id)} disabled={savingVehicle || !plateInput.trim()}
                            className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                            {savingVehicle ? "Ekleniyor..." : "Ekle"}
                          </button>
                          <button onClick={() => { setAddVehicleFor(null); setPlateInput(""); setDriverNameInput(""); setRouteNameInput(""); setIsTemporaryInput(true); }} className="text-zinc-500 hover:text-white px-3 py-2 rounded-lg border border-zinc-700 text-sm transition-colors">İptal</button>
                        </div>
                      </div>
                    ) : canEditCompany(c) ? (
                      <button
                        onClick={() => { setAddVehicleFor(c.id); setPlateInput(""); setDriverNameInput(""); setIsTemporaryInput(true); }}
                        className="text-xs text-zinc-500 hover:text-white border border-zinc-700 hover:border-zinc-500 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        + Araç Ekle
                      </button>
                    ) : null}

                    {/* Vardiya Yönetimi */}
                    {hasPermission(user, "companies:update") && (
                      <div className="mt-4 pt-4 border-t border-zinc-800">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Vardiya Saatleri</h4>
                          {addShiftFor !== c.id && (
                            <button onClick={() => setAddShiftFor(c.id)} className="text-xs text-zinc-500 hover:text-white border border-zinc-700 hover:border-zinc-500 px-2 py-1 rounded-lg transition-colors">+ Vardiya Ekle</button>
                          )}
                        </div>
                        {(shiftsMap[c.id] || []).map((s: any) => (
                          <div key={s.id} className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-3 py-2 mb-1">
                            <div>
                              <span className="text-white text-sm font-medium">{s.shift_name}</span>
                              <span className="text-zinc-400 text-xs ml-2">{s.expected_time.slice(0, 5)}</span>
                              <span className="text-zinc-600 text-xs ml-2">(−{s.tolerance_early}dk / +{s.tolerance_late}dk)</span>
                            </div>
                            <button onClick={() => deleteShift(s.id, c.id)} disabled={deletingShift === s.id} className="text-zinc-600 hover:text-red-400 text-xs transition-colors disabled:opacity-40">
                              {deletingShift === s.id ? "..." : "✕"}
                            </button>
                          </div>
                        ))}
                        {(shiftsMap[c.id] || []).length === 0 && addShiftFor !== c.id && (
                          <p className="text-zinc-600 text-xs">Henüz vardiya tanımlanmamış</p>
                        )}
                        {addShiftFor === c.id && (
                          <div className="space-y-2 mt-2">
                            <input value={shiftForm.shift_name} onChange={e => setShiftForm(f => ({ ...f, shift_name: e.target.value }))} placeholder="Vardiya adı (Sabah, Öğleden Sonra...)" className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" autoFocus />
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="block text-xs text-zinc-500 mb-1">Beklenen Saat *</label>
                                <input type="time" value={shiftForm.expected_time} onChange={e => setShiftForm(f => ({ ...f, expected_time: e.target.value }))} className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
                              </div>
                              <div>
                                <label className="block text-xs text-zinc-500 mb-1">Erken (dk)</label>
                                <input type="number" min="0" max="60" value={shiftForm.tolerance_early} onChange={e => setShiftForm(f => ({ ...f, tolerance_early: e.target.value }))} className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                              </div>
                              <div>
                                <label className="block text-xs text-zinc-500 mb-1">Geç (dk)</label>
                                <input type="number" min="0" max="60" value={shiftForm.tolerance_late} onChange={e => setShiftForm(f => ({ ...f, tolerance_late: e.target.value }))} className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => saveShift(c.id)} disabled={savingShift || !shiftForm.shift_name.trim() || !shiftForm.expected_time} className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors">{savingShift ? "Ekleniyor..." : "Ekle"}</button>
                              <button onClick={() => { setAddShiftFor(null); setShiftForm({ shift_name: "", expected_time: "", tolerance_early: "15", tolerance_late: "10" }); }} className="text-zinc-500 hover:text-white px-3 py-2 rounded-lg border border-zinc-700 text-sm transition-colors">İptal</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              );
            })}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button onClick={() => list.setPage(1)} disabled={list.page === 1}
                className="text-zinc-500 hover:text-white disabled:opacity-30 text-sm px-2 py-1 transition-colors">«</button>
              <button onClick={() => list.setPage(page => Math.max(1, page - 1))} disabled={list.page === 1}
                className="text-zinc-500 hover:text-white disabled:opacity-30 text-sm px-2 py-1 transition-colors">‹</button>
              <span className="text-zinc-400 text-sm px-3">{list.page} / {totalPages}</span>
              <button onClick={() => list.setPage(page => Math.min(totalPages, page + 1))} disabled={list.page === totalPages}
                className="text-zinc-500 hover:text-white disabled:opacity-30 text-sm px-2 py-1 transition-colors">›</button>
              <button onClick={() => list.setPage(totalPages)} disabled={list.page === totalPages}
                className="text-zinc-500 hover:text-white disabled:opacity-30 text-sm px-2 py-1 transition-colors">»</button>
            </div>
          )}
          </>
        )}
      </main>

      {/* Add Company Modal */}
      {showAddCompany && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Firma Ekle</h2>
              <button onClick={() => setShowAddCompany(false)} className="text-zinc-600 hover:text-white text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Firma Adı *</label>
                <input value={companyForm.name} onChange={e => setCompanyForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && saveCompany()}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500"
                  placeholder="ABC Taşımacılık" autoFocus />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Not</label>
                <input value={companyForm.notes} onChange={e => setCompanyForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAddCompany(false)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={saveCompany} disabled={savingCompany || !companyForm.name.trim()}
                className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                {savingCompany ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Vehicle History Modal */}
      {historyVehicle && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white font-mono">{historyVehicle.plate}</h2>
                {historyVehicle.driver_name && <p className="text-zinc-500 text-xs mt-0.5">{historyVehicle.driver_name}</p>}
              </div>
              <button onClick={() => { setHistoryVehicle(null); setHistoryData(null); }} className="text-zinc-600 hover:text-white text-xl">×</button>
            </div>

            {historyLoading ? (
              <p className="text-zinc-600 text-sm text-center py-8">Yükleniyor...</p>
            ) : historyData?.error ? (
              <p className="text-red-400 text-sm text-center py-8">{historyData.error}</p>
            ) : historyData ? (
              <div className="overflow-y-auto flex-1">
                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-zinc-800 rounded-xl p-3 text-center">
                    <p className="text-white font-bold text-lg">{historyData.stats?.total_arrivals || 0}</p>
                    <p className="text-zinc-500 text-xs mt-0.5">Toplam Giriş</p>
                  </div>
                  <div className="bg-zinc-800 rounded-xl p-3 text-center">
                    <p className="text-white font-bold text-lg">{historyData.stats?.last_30_days || 0}</p>
                    <p className="text-zinc-500 text-xs mt-0.5">Son 30 Gün</p>
                  </div>
                  <div className="bg-zinc-800 rounded-xl p-3 text-center">
                    <p className="text-white font-bold text-xs">{historyData.last_inspection?.inspection_date || "Hiç"}</p>
                    <p className="text-zinc-500 text-xs mt-0.5">Son Denetim</p>
                  </div>
                </div>

                {/* Last inspection detail */}
                {historyData.last_inspection && (
                  <div className="mb-4 px-3 py-2.5 bg-zinc-800 rounded-xl flex items-center gap-2">
                    <span className="text-xs text-zinc-400">Son denetim:</span>
                    <span className="text-xs text-white">{historyData.last_inspection.inspection_date}</span>
                    <span className={"text-xs font-medium px-1.5 py-0.5 rounded " + (historyData.last_inspection.result === "pass" ? "bg-emerald-900 text-emerald-300" : "bg-amber-900 text-amber-300")}>
                      {historyData.last_inspection.result === "pass" ? "Geçti" : historyData.last_inspection.result === "fail" ? "Başarısız" : historyData.last_inspection.result}
                    </span>
                    {historyData.last_inspection.inspector_name && <span className="text-zinc-600 text-xs">/ {historyData.last_inspection.inspector_name}</span>}
                  </div>
                )}

                {/* Arrival list */}
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Giriş Geçmişi (Son 20)</p>
                {historyData.arrivals.length === 0 ? (
                  <p className="text-zinc-600 text-sm py-4 text-center">Giriş kaydı yok</p>
                ) : (
                  <div className="space-y-1">
                    {historyData.arrivals.map((a: any) => (
                      <div key={a.id} className="flex items-center justify-between bg-zinc-800 rounded-lg px-3 py-2">
                        <span className="text-white text-sm">{a.arrival_date}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-zinc-400 text-xs tabular-nums">
                            {a.arrived_at ? new Date(a.arrived_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "—"}
                          </span>
                          {a.latitude !== 0 && (
                            <span className="text-zinc-600 text-xs" title={`${a.latitude}, ${a.longitude}`}>📍</span>
                          )}
                          {a.recorded_by_name && <span className="text-zinc-600 text-xs">{a.recorded_by_name}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Edit Vehicle Modal */}
      {editVehicle && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Araç Düzenle</h2>
              <button onClick={() => setEditVehicle(null)} className="text-zinc-600 hover:text-white text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Plaka *</label>
                <input
                  value={editVehicleForm.plate}
                  onChange={e => setEditVehicleForm(f => ({ ...f, plate: e.target.value.toUpperCase() }))}
                  onKeyDown={e => e.key === "Enter" && saveEditVehicle()}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 font-mono uppercase"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Şöför</label>
                <input
                  value={editVehicleForm.driver_name}
                  onChange={e => setEditVehicleForm(f => ({ ...f, driver_name: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && saveEditVehicle()}
                  placeholder="Opsiyonel"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Güzergah</label>
                <input
                  value={editVehicleForm.route_name}
                  onChange={e => setEditVehicleForm(f => ({ ...f, route_name: e.target.value }))}
                  placeholder="Opsiyonel"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Not</label>
                <input
                  value={editVehicleForm.notes}
                  onChange={e => setEditVehicleForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setEditVehicle(null)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={saveEditVehicle} disabled={savingEditVehicle || !editVehicleForm.plate.trim()}
                className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                {savingEditVehicle ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Company Modal */}
      {editCompany && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Firmayı Düzenle</h2>
              <button onClick={() => setEditCompany(null)} className="text-zinc-600 hover:text-white text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Firma Adı *</label>
                <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && saveEditCompany()}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500"
                  autoFocus />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Not</label>
                <input value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Sorumlular</label>
                {loadingResponsibles ? (
                  <p className="text-zinc-600 text-xs py-2">Yükleniyor...</p>
                ) : (
                  <div className="space-y-1 mb-2">
                    {responsibles.length === 0 ? (
                      <p className="text-zinc-600 text-xs py-1">Henüz sorumlu atanmamış</p>
                    ) : responsibles.map((r: any) => (
                      <div key={r.user_id} className="flex items-center justify-between bg-zinc-800 rounded-lg px-3 py-2">
                        <span className="text-white text-sm">{r.full_name}</span>
                        <button
                          onClick={() => removeResponsible(editCompany.id, r.user_id)}
                          disabled={removingResponsible === r.user_id}
                          className="text-zinc-600 hover:text-red-400 text-xs transition-colors disabled:opacity-40"
                        >{removingResponsible === r.user_id ? "..." : "✕"}</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <select
                    value={newResponsibleId}
                    onChange={e => setNewResponsibleId(e.target.value)}
                    className="flex-1 bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500"
                  >
                    <option value="">— Kullanıcı Seç —</option>
                    {usersList
                      .filter((u: any) => !responsibles.some((r: any) => r.user_id === u.id))
                      .map((u: any) => (
                        <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                      ))}
                  </select>
                  <button
                    onClick={() => addResponsible(editCompany.id)}
                    disabled={addingResponsible || !newResponsibleId}
                    className="bg-zinc-700 hover:bg-zinc-600 text-white text-sm px-3 py-2 rounded-lg disabled:opacity-40 transition-colors"
                  >{addingResponsible ? "..." : "Ekle"}</button>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setEditCompany(null)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={saveEditCompany} disabled={savingEdit || !editForm.name.trim()}
                className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                {savingEdit ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
