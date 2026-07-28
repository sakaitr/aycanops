"use client";
import { toast } from "@/lib/toast";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import Badge from "@/components/Badge";
import BulkActionBar from "@/components/BulkActionBar";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useListState } from "@/hooks/useListState";
import { useGlobalCompany } from "@/contexts/CompanyContext";
import { hasPermission } from "@/lib/permissions";

const TYPE_LABELS: Record<string, string> = { minibus: "Minibüs", midibus: "Midibüs", otobus: "Otobüs", sedan: "Sedan" };
const STATUS_OPTS = [{ value: "active", label: "Aktif" }, { value: "maintenance", label: "Bakımda" }, { value: "inactive", label: "Pasif" }];
const TYPE_OPTS = [{ value: "minibus", label: "Minibüs" }, { value: "midibus", label: "Midibüs" }, { value: "otobus", label: "Otobüs" }, { value: "sedan", label: "Sedan" }];
const DOC_TYPES_VEHICLE = [
  { value: "muayene", label: "Muayene" },
  { value: "sigorta", label: "Sigorta" },
  { value: "ruhsat", label: "Ruhsat" },
  { value: "fotograf", label: "Fotoğraf" },
  { value: "bakim", label: "Bakım Kaydı" },
];
const DOC_TYPES_DRIVER = [
  { value: "ehliyet", label: "Ehliyet" },
  { value: "src", label: "SRC" },
  { value: "psikoteknik", label: "Psikoteknik" },
  { value: "saglik", label: "Sağlık Raporu" },
  { value: "fotograf", label: "Fotoğraf" },
];
const LICENSE_CLASSES = ["A", "A1", "A2", "B", "B1", "BE", "C", "C1", "CE", "D", "D1", "DE", "F", "G"];
const EMPTY_FORM = { plate: "", type: "minibus", capacity: 14, brand: "", model: "", year: "", driver_id: "", driver_name: "", driver_phone: "", status_code: "active", notes: "", ruhsat_sahibi_id: "", company_id: "" };
const EMPTY_DRIVER_FORM = { driver_id: "", driver_name: "", driver_phone: "", driver_license_class: "", driver_license_expiry: "", driver_src_expiry: "", driver_psiko_expiry: "", driver_health_expiry: "" };
const DEFAULT_VEHICLE_FILTERS = { company: "", status: "" };

function expiryColor(date: string | null): string {
  if (!date) return "text-zinc-600";
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  if (days < 0) return "text-red-400";
  if (days < 30) return "text-amber-400";
  return "text-emerald-400";
}

export default function AraclarPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  useEffect(() => { fetch("/api/auth/me").then(r => r.json()).then(d => { if (d.ok) setUser(d.data); else router.replace("/login"); }).catch(() => { router.replace("/login"); }); }, []);

  const [vehicles, setVehicles] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [ruhsatSahipleri, setRuhsatSahipleri] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const list = useListState<"plate" | "status" | "expiry", { company: string; status: string }>({
    defaultSort: "plate",
    defaultPageSize: 20,
    defaultFilters: DEFAULT_VEHICLE_FILTERS,
  });
  const { selectedCompanyId } = useGlobalCompany();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.get("f_company") && selectedCompanyId) list.setFilter("company", selectedCompanyId);
  }, [selectedCompanyId]);

  // Add/Edit vehicle form
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Popup state
  const [selectedVehicle, setSelectedVehicle] = useState<any | null>(null);
  const [popupTab, setPopupTab] = useState<"genel" | "belgeler" | "surucu">("genel");
  const [vehicleDocs, setVehicleDocs] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  // Document forms
  const [showAddVehicleDoc, setShowAddVehicleDoc] = useState(false);
  const [showAddDriverDoc, setShowAddDriverDoc] = useState(false);
  const [docForm, setDocForm] = useState({ doc_type: "muayene", doc_label: "", expiry_date: "", notes: "" });
  const [savingDoc, setSavingDoc] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState<string | null>(null);

  // Driver edit inside popup
  const [editingDriver, setEditingDriver] = useState(false);
  const [driverForm, setDriverForm] = useState({ ...EMPTY_DRIVER_FORM });
  const [savingDriver, setSavingDriver] = useState(false);

  // Bulk import
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ inserted: number; skipped: number } | null>(null);

  useEffect(() => {
    load();
    fetch("/api/companies?limit=9999").then(r => r.json()).then(d => { if (d.ok) setCompanies(d.data); }).catch(() => {});
    fetch("/api/suruculer?limit=9999").then(r => r.json()).then(d => { if (d.ok) setDrivers(d.data); }).catch(() => {});
    fetch("/api/isletenler?limit=500").then(r => r.json()).then(d => { if (d.ok) setRuhsatSahipleri(d.data.filter((i: any) => i.ruhsat_sahibi_mi)); }).catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/vehicles?limit=9999");
      const d = await r.json();
      if (d.ok) setVehicles(d.data);
    } finally { setLoading(false); }
  }

  async function loadDocs(vehicleId: string) {
    setLoadingDocs(true);
    try {
      const r = await fetch(`/api/vehicles/${vehicleId}/documents`);
      const d = await r.json();
      if (d.ok) setVehicleDocs(d.data);
    } finally { setLoadingDocs(false); }
  }

  function openVehicle(v: any) {
    setSelectedVehicle(v);
    setPopupTab("genel");
    setVehicleDocs([]);
    loadDocs(v.id);
    setEditingDriver(false);
  }

  function closePopup() {
    setSelectedVehicle(null);
    setShowAddVehicleDoc(false);
    setShowAddDriverDoc(false);
    setEditingDriver(false);
  }

  function openCreate() { setEditing(null); setForm({ ...EMPTY_FORM, company_id: list.filters.company || "" }); setSaveError(null); setShowForm(true); }
  useEscapeKey(() => setShowForm(false), showForm);
  function openEdit(v: any) {
    setEditing(v);
    setForm({ plate: v.plate, type: v.type, capacity: v.capacity, brand: v.brand || "", model: v.model || "", year: v.year || "", driver_id: v.driver_id || "", driver_name: v.driver_name || "", driver_phone: v.driver_phone || "", status_code: v.status_code, notes: v.notes || "", ruhsat_sahibi_id: v.ruhsat_sahibi_id || "", company_id: "" });
    setSaveError(null);
    setShowForm(true);
  }

  async function save() {
    if (!form.plate.trim()) return;
    if (!editing && !form.company_id) { setSaveError("Firma seçilmeden araç kaydedilemez"); return; }
    setSaving(true); setSaveError(null);
    try {
      const url = editing ? `/api/vehicles/${editing.id}` : "/api/vehicles";
      const method = editing ? "PUT" : "POST";
      const { company_id, ...vehicleFields } = form;
      const body = { ...vehicleFields, year: form.year ? parseInt(form.year as string) || null : null };
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      if (d.ok) {
        if (!editing && company_id) {
          const linkRes = await fetch(`/api/companies/${company_id}/vehicles`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ plate: form.plate }),
          });
          const linkData = await linkRes.json();
          if (!linkData.ok) toast.error(`Araç oluşturuldu ama firmaya bağlanamadı: ${linkData.error || "bilinmeyen hata"}`);
        }
        setShowForm(false);
        await load();
        // Refresh popup if editing this vehicle
        if (editing && selectedVehicle?.id === editing.id) {
          const updated = (await fetch(`/api/vehicles?limit=9999`).then(r => r.json()).catch(() => ({ data: [] }))).data?.find((v: any) => v.id === editing.id);
          if (updated) setSelectedVehicle(updated);
        }
      } else setSaveError(d.error || "Kaydetme başarısız");
    } finally { setSaving(false); }
  }

  async function saveDoc(vehicleId: string) {
    if (!docForm.doc_type) return;
    setSavingDoc(true);
    try {
      const r = await fetch(`/api/vehicles/${vehicleId}/documents`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...docForm, expiry_date: docForm.expiry_date || null }),
      });
      const d = await r.json();
      if (d.ok) {
        setDocForm({ doc_type: "muayene", doc_label: "", expiry_date: "", notes: "" });
        setShowAddVehicleDoc(false);
        setShowAddDriverDoc(false);
        loadDocs(vehicleId);
      } else toast.error(d.error);
    } finally { setSavingDoc(false); }
  }

  async function deleteDoc(vehicleId: string, docId: string) {
    if (!confirm("Bu belge silinsin mi?")) return;
    setDeletingDoc(docId);
    try {
      const r = await fetch(`/api/vehicles/${vehicleId}/documents?doc_id=${docId}`, { method: "DELETE" });
      const d = await r.json();
      if (d.ok) loadDocs(vehicleId);
      else toast.error(d.error);
    } finally { setDeletingDoc(null); }
  }

  async function saveDriverInfo(vehicleId: string) {
    setSavingDriver(true);
    try {
      const res = await fetch(`/api/vehicles/${vehicleId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate: selectedVehicle.plate, type: selectedVehicle.type, capacity: selectedVehicle.capacity,
          brand: selectedVehicle.brand, model: selectedVehicle.model, year: selectedVehicle.year,
          status_code: selectedVehicle.status_code, notes: selectedVehicle.notes,
          ...driverForm,
        }),
      });
      const d = await res.json();
      if (d.ok) {
        setEditingDriver(false);
        await load();
        const vList = await fetch("/api/vehicles?limit=9999").then(r => r.json());
        const updated = vList.data?.find((v: any) => v.id === vehicleId);
        if (updated) setSelectedVehicle(updated);
      } else toast.error(d.error);
    } finally { setSavingDriver(false); }
  }

  async function handleBulkUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/companies/upload", { method: "POST", body: fd });
      const d = await r.json();
      if (d.ok) { setUploadResult(d.data); load(); }
      else toast.error(d.error || "Yükleme başarısız");
    } catch { toast.error("Sunucuya bağlanılamadı"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  const canEdit = hasPermission(user, "vehicles:update");

  async function bulkDeactivate() {
    if (list.selectedIds.length === 0) return;
    if (!confirm(`${list.selectedIds.length} araç pasife alınsın mı?`)) return;
    const d = await fetch("/api/bulk-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module: "vehicles", action: "deactivate", ids: list.selectedIds, execute: true }),
    }).then(r => r.json()).catch(() => null);
    if (!d?.ok) { toast.error(d?.error || "Toplu işlem başarısız"); return; }
    toast.success(`${d.data.success} araç pasife alındı`);
    list.clearSelection();
    load();
  }

  const filtered = vehicles
    .filter(v => !list.filters.status || v.status_code === list.filters.status)
    .filter(v => !list.search || v.plate.toLowerCase().includes(list.search.toLowerCase()))
    .filter(v => !list.filters.company || (v.companies || []).some((c: any) => c.company_id === list.filters.company))
    .sort((a, b) => {
      let cmp = 0;
      if (list.sort === "plate") cmp = a.plate.localeCompare(b.plate);
      else if (list.sort === "status") cmp = (a.status_code || "").localeCompare(b.status_code || "");
      else if (list.sort === "expiry") {
        const ae = a.min_doc_expiry || "9999-99-99";
        const be = b.min_doc_expiry || "9999-99-99";
        cmp = ae.localeCompare(be);
      }
      return list.sortDir === "asc" ? cmp : -cmp;
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / list.pageSize));
  const paginated = filtered.slice((list.page - 1) * list.pageSize, list.page * list.pageSize);
  const pageIds = paginated.map(v => String(v.id));
  const filteredIds = filtered.map(v => String(v.id));

  useEffect(() => {
    if (list.page > totalPages) list.setPage(totalPages);
  }, [list, totalPages]);

  const vehicleDocs_vehicle = vehicleDocs.filter(d => DOC_TYPES_VEHICLE.some(t => t.value === d.doc_type));
  const vehicleDocs_driver = vehicleDocs.filter(d => DOC_TYPES_DRIVER.some(t => t.value === d.doc_type));

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Araçlar</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{filtered.length} araç</p>
          </div>
          <div className="flex gap-2">
            {canEdit && (
              <label className={`cursor-pointer bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm font-medium px-4 py-2 rounded-lg hover:bg-zinc-700 transition-colors ${uploading ? "opacity-50 cursor-not-allowed" : ""}`}>
                {uploading ? "Yükleniyor..." : "↑ Toplu Ekle"}
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleBulkUpload} disabled={uploading} />
              </label>
            )}
            {canEdit && <button onClick={openCreate} className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors">+ Araç Ekle</button>}
          </div>
        </div>
        {uploadResult && (
          <div className="mb-4 px-4 py-3 bg-emerald-950 border border-emerald-800 rounded-xl text-emerald-300 text-sm flex items-center justify-between">
            <span>✓ {uploadResult.inserted} araç eklendi, {uploadResult.skipped} atlandı</span>
            <button onClick={() => setUploadResult(null)} className="text-emerald-500 hover:text-white ml-4">×</button>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-5">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs pointer-events-none">🔍</span>
            <input value={list.search} onChange={e => list.setSearch(e.target.value.toUpperCase())} placeholder="Plaka ara..."
              className="bg-zinc-900 border border-zinc-800 text-white text-sm pl-8 pr-4 py-2 rounded-lg focus:outline-none focus:border-zinc-600 placeholder-zinc-600 font-mono w-40" />
          </div>
          <select value={list.filters.company} onChange={e => list.setFilter("company", e.target.value)}
            className="bg-zinc-900 border border-zinc-800 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-600">
            <option value="">Tüm Firmalar</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {[{ value: "", label: "Tüm Durumlar" }, ...STATUS_OPTS].map(o => (
            <button key={o.value} onClick={() => list.setFilter("status", o.value)}
              className={`text-xs font-medium px-3 py-2 rounded-lg transition-colors ${list.filters.status === o.value ? "bg-white text-zinc-950" : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"}`}>
              {o.label}
            </button>
          ))}
          {(list.search || list.filters.company || list.filters.status) && (
            <button onClick={list.clearFilters} className="text-xs font-medium px-3 py-2 rounded-lg border border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-white transition-colors">
              Filtreleri temizle
            </button>
          )}
        </div>

        {/* Sort controls */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-zinc-600 text-xs">Sırala:</span>
          {([[ "plate", "Plaka"], ["status", "Durum"], ["expiry", "Belge Bitiş"]] as const).map(([f, l]) => (
            <button key={f} onClick={() => list.toggleSort(f)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${list.sort === f ? "bg-zinc-700 border-zinc-600 text-white" : "border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-600"}`}>
              {l} {list.sort === f ? (list.sortDir === "asc" ? "↑" : "↓") : ""}
            </button>
          ))}
          <select value={list.pageSize} onChange={e => list.setPageSize(Number(e.target.value))}
            className="ml-auto bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-zinc-600">
            {[20, 50, 100].map(size => <option key={size} value={size}>{size}/sayfa</option>)}
          </select>
        </div>

        {canEdit && (
          <BulkActionBar
            selectedCount={list.selectedIds.length}
            pageCount={paginated.length}
            filteredCount={filtered.length}
            onSelectPage={() => list.selectMany(pageIds)}
            onSelectFiltered={() => list.setSelectedIds(filteredIds)}
            onClear={list.clearSelection}
          >
            <button onClick={bulkDeactivate} className="rounded-lg border border-sky-700 px-3 py-2 text-xs font-semibold text-sky-100 transition-colors hover:bg-sky-900">
              Toplu pasife al
            </button>
            <button disabled className="rounded-lg border border-sky-800 px-3 py-2 text-xs font-semibold text-sky-400/70 opacity-70">
              Export · yakında
            </button>
          </BulkActionBar>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24 text-zinc-600 text-sm">Yükleniyor...</div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginated.map(v => {
                const expiryDays = v.min_doc_expiry ? Math.ceil((new Date(v.min_doc_expiry).getTime() - Date.now()) / 86400000) : null;
                const hasExpiryWarning = expiryDays !== null && expiryDays < 30;
                const selected = list.isSelected(String(v.id));
                return (
                  <div key={v.id} onClick={() => router.push(`/araclar/${v.id}`)}
                    className={`bg-zinc-900 border rounded-xl p-5 hover:border-zinc-600 transition-colors cursor-pointer ${selected ? "ring-2 ring-sky-500/70 border-sky-700" : hasExpiryWarning ? (expiryDays! < 0 ? "border-red-800" : "border-amber-800/60") : "border-zinc-800"}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-start gap-3">
                        {canEdit && (
                          <input
                            type="checkbox"
                            checked={selected}
                            onClick={e => e.stopPropagation()}
                            onChange={() => list.toggleSelected(String(v.id))}
                            className="mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-800 accent-sky-500"
                            aria-label={`${v.plate} seç`}
                          />
                        )}
                        <div>
                          <span
                            className="inline-flex items-stretch rounded overflow-hidden mb-1"
                            style={{ border: '1.5px solid #9ca3af', height: '28px', background: 'white' }}
                          >
                            <span style={{ background: '#003DA5', color: '#FFD700', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 4px', minWidth: '18px' }}>
                              <span style={{ fontSize: '4px', lineHeight: 1, letterSpacing: '-0.5px' }}>★★★</span>
                              <span style={{ fontSize: '7px', fontWeight: 900, lineHeight: 1, fontFamily: 'monospace' }}>TR</span>
                            </span>
                            <span style={{ color: '#111', fontWeight: 700, fontSize: '12px', padding: '0 8px', display: 'flex', alignItems: 'center', letterSpacing: '0.08em', fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)" }}>
                              {v.plate}
                            </span>
                          </span>
                          <p className="text-zinc-500 text-xs">{TYPE_LABELS[v.type] || v.type} · {v.capacity} kişi</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge status={v.status_code} showLabel />
                        {hasExpiryWarning && (
                          <span className={`text-xs font-medium ${expiryDays! < 0 ? "text-red-400" : "text-amber-400"}`}>
                            ⚠ {expiryDays! < 0 ? "Süresi doldu" : `${expiryDays}g kaldı`}
                          </span>
                        )}
                      </div>
                    </div>
                    {(v.brand || v.model) && <p className="text-zinc-400 text-sm mb-2">{[v.brand, v.model, v.year].filter(Boolean).join(" ")}</p>}
                    {v.driver_name && (
                      <div className="border-t border-zinc-800 pt-3 mt-3">
                        <p className="text-zinc-400 text-xs">Sürücü: <span className="text-white">{v.driver_name}</span></p>
                        {v.driver_phone && <p className="text-zinc-500 text-xs">{v.driver_phone}</p>}
                      </div>
                    )}
                    {v.companies && v.companies.length > 0 && (
                      <div className="border-t border-zinc-800 pt-3 mt-3">
                        <div className="flex flex-wrap gap-1.5">
                          {v.companies.map((c: any) => (
                            <span key={c.company_id} title={c.company_name} className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 px-2 py-0.5 rounded-full max-w-[150px] truncate block">{c.company_name}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {filtered.length === 0 && <div className="col-span-3 py-16 text-center text-zinc-600 text-sm">Araç bulunamadı</div>}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <button onClick={() => list.setPage(1)} disabled={list.page === 1}
                  className="text-zinc-500 hover:text-white disabled:opacity-30 text-sm px-2 py-1 transition-colors">«</button>
                <button onClick={() => list.setPage(p => Math.max(1, p - 1))} disabled={list.page === 1}
                  className="text-zinc-500 hover:text-white disabled:opacity-30 text-sm px-2 py-1 transition-colors">‹</button>
                <span className="text-zinc-400 text-sm px-3">{list.page} / {totalPages}</span>
                <button onClick={() => list.setPage(p => Math.min(totalPages, p + 1))} disabled={list.page === totalPages}
                  className="text-zinc-500 hover:text-white disabled:opacity-30 text-sm px-2 py-1 transition-colors">›</button>
                <button onClick={() => list.setPage(totalPages)} disabled={list.page === totalPages}
                  className="text-zinc-500 hover:text-white disabled:opacity-30 text-sm px-2 py-1 transition-colors">»</button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Add/Edit Vehicle Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4 overflow-y-auto py-8">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">{editing ? "Araç Düzenle" : "Araç Ekle"}</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-600 hover:text-white text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Plaka *</label>
                  <input value={form.plate} onChange={e => setForm(f => ({ ...f, plate: e.target.value.toUpperCase() }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 uppercase" placeholder="34 AB 1234" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Tip</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                    {TYPE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Kapasite</label>
                  <input type="number" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: +e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Marka</label>
                  <input value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Model</label>
                  <input value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Yıl</label>
                  <input value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} type="number" min="1980" max="2030"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Durum</label>
                  <select value={form.status_code} onChange={e => setForm(f => ({ ...f, status_code: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                    {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              {!editing && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Firma *</label>
                  <select value={form.company_id} onChange={e => setForm(f => ({ ...f, company_id: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                    <option value="">— Firma seçilmedi —</option>
                    {companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {!form.company_id && (
                    <p className="text-amber-500 text-xs mt-1">Firma seçilmezse bu araç hiçbir firmaya bağlı olmaz ve listelerde bulunması zorlaşır.</p>
                  )}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Sürücü</label>
                <select value={form.driver_id} onChange={e => {
                  const did = e.target.value;
                  const drv = drivers.find((d: any) => d.id === did);
                  setForm(f => ({ ...f, driver_id: did, driver_name: drv ? drv.name : "", driver_phone: drv ? (drv.phone || "") : "" }));
                }} className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                  <option value="">— Sürücü yok —</option>
                  {drivers.map((d: any) => <option key={d.id} value={d.id}>{d.name}{d.phone ? ` · ${d.phone}` : ""}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Ruhsat Sahibi</label>
                <select value={form.ruhsat_sahibi_id} onChange={e => setForm(f => ({ ...f, ruhsat_sahibi_id: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                  <option value="">— Ruhsat sahibi yok —</option>
                  {ruhsatSahipleri.map((i: any) => <option key={i.id} value={i.id}>{i.unvan}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Not</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </div>
            </div>
            {saveError && <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-3 py-2 mt-3">{saveError}</p>}
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving || !form.plate.trim() || (!editing && !form.company_id)}
                className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vehicle Detail Popup */}
      {selectedVehicle && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4 overflow-y-auto py-8">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg">
            {/* Header */}
            <div className="flex items-center justify-between p-6 pb-0">
              <div>
                <h2 className="text-xl font-bold text-white font-mono">{selectedVehicle.plate}</h2>
                <p className="text-zinc-500 text-sm mt-0.5">{TYPE_LABELS[selectedVehicle.type] || selectedVehicle.type} · {selectedVehicle.capacity} kişi</p>
              </div>
              <div className="flex items-center gap-3">
                {canEdit && (
                  <button onClick={() => { closePopup(); openEdit(selectedVehicle); }} className="text-xs text-zinc-500 hover:text-white border border-zinc-700 hover:border-zinc-500 px-3 py-1.5 rounded-lg transition-colors">Düzenle</button>
                )}
                <button onClick={closePopup} className="text-zinc-600 hover:text-white text-2xl leading-none">×</button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mx-6 mt-4 bg-zinc-800/50 border border-zinc-800 rounded-xl p-1">
              {(["genel", "belgeler", "surucu"] as const).map(t => (
                <button key={t} onClick={() => setPopupTab(t)}
                  className={"flex-1 py-2 text-sm font-medium rounded-lg transition-colors " + (popupTab === t ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-white")}>
                  {t === "genel" ? "Genel" : t === "belgeler" ? "Araç Belgeleri" : "Sürücü"}
                </button>
              ))}
            </div>

            <div className="p-6 pt-4">
              {/* GENEL TAB */}
              {popupTab === "genel" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-zinc-800/50 rounded-lg px-3 py-2.5">
                      <p className="text-zinc-500 text-xs mb-0.5">Marka / Model</p>
                      <p className="text-white text-sm">{[selectedVehicle.brand, selectedVehicle.model, selectedVehicle.year].filter(Boolean).join(" ") || "—"}</p>
                    </div>
                    <div className="bg-zinc-800/50 rounded-lg px-3 py-2.5">
                      <p className="text-zinc-500 text-xs mb-0.5">Durum</p>
                      <Badge status={selectedVehicle.status_code} showLabel />
                    </div>
                  </div>
                  {selectedVehicle.companies?.length > 0 && (
                    <div className="bg-zinc-800/50 rounded-lg px-3 py-2.5">
                      <p className="text-zinc-500 text-xs mb-1.5">Firma Atamaları</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedVehicle.companies.map((c: any) => (
                          <span key={c.company_id} title={c.company_name} className="text-xs bg-zinc-700 border border-zinc-600 text-zinc-300 px-2 py-0.5 rounded-full max-w-[180px] truncate block">{c.company_name}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedVehicle.notes && (
                    <div className="bg-zinc-800/50 rounded-lg px-3 py-2.5">
                      <p className="text-zinc-500 text-xs mb-0.5">Not</p>
                      <p className="text-zinc-300 text-sm">{selectedVehicle.notes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* BELGELER TAB */}
              {popupTab === "belgeler" && (
                <div>
                  {loadingDocs ? <p className="text-zinc-600 text-sm py-4 text-center">Yükleniyor...</p> : (
                    <>
                      <div className="space-y-2 mb-4">
                        {vehicleDocs_vehicle.length === 0 && !showAddVehicleDoc && (
                          <p className="text-zinc-600 text-sm text-center py-4">Araç belgesi henüz eklenmemiş</p>
                        )}
                        {vehicleDocs_vehicle.map(doc => (
                          <div key={doc.id} className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-3 py-2.5">
                            <div>
                              <span className="text-white text-sm font-medium">{DOC_TYPES_VEHICLE.find(t => t.value === doc.doc_type)?.label || doc.doc_type}</span>
                              {doc.doc_label && <span className="text-zinc-400 text-xs ml-2">{doc.doc_label}</span>}
                              {doc.expiry_date && <div className={`text-xs mt-0.5 ${expiryColor(doc.expiry_date)}`}>Geçerlilik: {doc.expiry_date}</div>}
                              {doc.notes && <div className="text-zinc-500 text-xs mt-0.5">{doc.notes}</div>}
                            </div>
                            {canEdit && (
                              <button onClick={() => deleteDoc(selectedVehicle.id, doc.id)} disabled={deletingDoc === doc.id} className="text-zinc-600 hover:text-red-400 text-xs transition-colors ml-2">
                                {deletingDoc === doc.id ? "..." : "✕"}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {showAddVehicleDoc ? (
                        <div className="bg-zinc-800/50 rounded-xl p-4 space-y-3">
                          <select value={docForm.doc_type} onChange={e => setDocForm(f => ({ ...f, doc_type: e.target.value }))}
                            className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                            {DOC_TYPES_VEHICLE.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                          <input value={docForm.doc_label} onChange={e => setDocForm(f => ({ ...f, doc_label: e.target.value }))} placeholder="Açıklama (opsiyonel)"
                            className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                          <div>
                            <label className="block text-xs text-zinc-500 mb-1">Son Geçerlilik Tarihi</label>
                            <input type="date" value={docForm.expiry_date} min={new Date().toISOString().split("T")[0]} onChange={e => setDocForm(f => ({ ...f, expiry_date: e.target.value }))}
                              className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
                          </div>
                          <textarea value={docForm.notes} onChange={e => setDocForm(f => ({ ...f, notes: e.target.value }))} placeholder="Not..." rows={2}
                            className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
                          <div className="flex gap-2">
                            <button onClick={() => saveDoc(selectedVehicle.id)} disabled={savingDoc} className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors">{savingDoc ? "..." : "Ekle"}</button>
                            <button onClick={() => setShowAddVehicleDoc(false)} className="text-zinc-500 hover:text-white px-3 py-2 rounded-lg border border-zinc-700 text-sm transition-colors">İptal</button>
                          </div>
                        </div>
                      ) : canEdit ? (
                        <button onClick={() => { setDocForm({ doc_type: "muayene", doc_label: "", expiry_date: "", notes: "" }); setShowAddVehicleDoc(true); }}
                          className="w-full text-xs text-zinc-500 hover:text-white border border-zinc-700 hover:border-zinc-500 px-3 py-2 rounded-lg transition-colors">
                          + Belge Ekle
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              )}

              {/* SÜRÜCÜ TAB */}
              {popupTab === "surucu" && (
                <div>
                  {!editingDriver ? (
                    <div className="space-y-3 mb-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-zinc-800/50 rounded-lg px-3 py-2.5">
                          <p className="text-zinc-500 text-xs mb-0.5">Ad</p>
                          <p className="text-white text-sm">{selectedVehicle.driver_name || "—"}</p>
                        </div>
                        <div className="bg-zinc-800/50 rounded-lg px-3 py-2.5">
                          <p className="text-zinc-500 text-xs mb-0.5">Telefon</p>
                          <p className="text-white text-sm">{selectedVehicle.driver_phone || "—"}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-zinc-800/50 rounded-lg px-3 py-2.5">
                          <p className="text-zinc-500 text-xs mb-0.5">Ehliyet Sınıfı</p>
                          <p className="text-white text-sm">{selectedVehicle.driver_license_class || "—"}</p>
                        </div>
                        <div className="bg-zinc-800/50 rounded-lg px-3 py-2.5">
                          <p className="text-zinc-500 text-xs mb-0.5">Ehliyet Geçerlilik</p>
                          <p className={`text-sm ${expiryColor(selectedVehicle.driver_license_expiry)}`}>{selectedVehicle.driver_license_expiry || "—"}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: "SRC", field: "driver_src_expiry" },
                          { label: "Psikoteknik", field: "driver_psiko_expiry" },
                          { label: "Sağlık", field: "driver_health_expiry" },
                        ].map(({ label, field }) => (
                          <div key={field} className="bg-zinc-800/50 rounded-lg px-3 py-2.5">
                            <p className="text-zinc-500 text-xs mb-0.5">{label}</p>
                            <p className={`text-xs ${expiryColor(selectedVehicle[field])}`}>{selectedVehicle[field] || "—"}</p>
                          </div>
                        ))}
                      </div>
                      {canEdit && (
                        <button onClick={() => {
                          setDriverForm({
                            driver_id: selectedVehicle.driver_id || "",
                            driver_name: selectedVehicle.driver_name || "",
                            driver_phone: selectedVehicle.driver_phone || "",
                            driver_license_class: selectedVehicle.driver_license_class || "",
                            driver_license_expiry: selectedVehicle.driver_license_expiry || "",
                            driver_src_expiry: selectedVehicle.driver_src_expiry || "",
                            driver_psiko_expiry: selectedVehicle.driver_psiko_expiry || "",
                            driver_health_expiry: selectedVehicle.driver_health_expiry || "",
                          });
                          setEditingDriver(true);
                        }} className="text-xs text-zinc-500 hover:text-white border border-zinc-700 hover:border-zinc-500 px-3 py-1.5 rounded-lg transition-colors">
                          Sürücü Bilgilerini Düzenle
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3 mb-4">
                      <div>
                        <label className="block text-xs text-zinc-500 mb-1">Sürücü</label>
                        <select value={driverForm.driver_id} onChange={e => {
                          const did = e.target.value;
                          const drv = drivers.find((d: any) => d.id === did);
                          setDriverForm(f => ({ ...f, driver_id: did, driver_name: drv ? drv.name : "", driver_phone: drv ? (drv.phone || "") : "" }));
                        }} className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                          <option value="">— Sürücü yok —</option>
                          {drivers.map((d: any) => <option key={d.id} value={d.id}>{d.name}{d.phone ? ` · ${d.phone}` : ""}</option>)}
                        </select>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1">Ehliyet Sınıfı</label>
                          <select value={driverForm.driver_license_class} onChange={e => setDriverForm(f => ({ ...f, driver_license_class: e.target.value }))}
                            className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                            <option value="">— Seç —</option>
                            {LICENSE_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1">Ehliyet Geçerlilik</label>
                          <input type="date" value={driverForm.driver_license_expiry} min={new Date().toISOString().split("T")[0]} onChange={e => setDriverForm(f => ({ ...f, driver_license_expiry: e.target.value }))}
                            className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: "SRC", field: "driver_src_expiry" as const },
                          { label: "Psikoteknik", field: "driver_psiko_expiry" as const },
                          { label: "Sağlık", field: "driver_health_expiry" as const },
                        ].map(({ label, field }) => (
                          <div key={field}>
                            <label className="block text-xs text-zinc-500 mb-1">{label}</label>
                            <input type="date" value={driverForm[field]} min={new Date().toISOString().split("T")[0]} onChange={e => setDriverForm(f => ({ ...f, [field]: e.target.value }))}
                              className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => saveDriverInfo(selectedVehicle.id)} disabled={savingDriver}
                          className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors">{savingDriver ? "Kaydediliyor..." : "Kaydet"}</button>
                        <button onClick={() => setEditingDriver(false)} className="text-zinc-500 hover:text-white px-3 py-2 rounded-lg border border-zinc-700 text-sm transition-colors">İptal</button>
                      </div>
                    </div>
                  )}

                  {/* Driver documents */}
                  <div className="border-t border-zinc-800 pt-4">
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Sürücü Belgeleri</p>
                    {loadingDocs ? <p className="text-zinc-600 text-sm text-center py-2">Yükleniyor...</p> : (
                      <>
                        <div className="space-y-2 mb-3">
                          {vehicleDocs_driver.length === 0 && !showAddDriverDoc && (
                            <p className="text-zinc-600 text-sm text-center py-2">Sürücü belgesi henüz eklenmemiş</p>
                          )}
                          {vehicleDocs_driver.map(doc => (
                            <div key={doc.id} className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-3 py-2.5">
                              <div>
                                <span className="text-white text-sm font-medium">{DOC_TYPES_DRIVER.find(t => t.value === doc.doc_type)?.label || doc.doc_type}</span>
                                {doc.doc_label && <span className="text-zinc-400 text-xs ml-2">{doc.doc_label}</span>}
                                {doc.expiry_date && <div className={`text-xs mt-0.5 ${expiryColor(doc.expiry_date)}`}>Geçerlilik: {doc.expiry_date}</div>}
                              </div>
                              {canEdit && (
                                <button onClick={() => deleteDoc(selectedVehicle.id, doc.id)} disabled={deletingDoc === doc.id} className="text-zinc-600 hover:text-red-400 text-xs transition-colors ml-2">
                                  {deletingDoc === doc.id ? "..." : "✕"}
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                        {showAddDriverDoc ? (
                          <div className="bg-zinc-800/50 rounded-xl p-4 space-y-3">
                            <select value={docForm.doc_type} onChange={e => setDocForm(f => ({ ...f, doc_type: e.target.value }))}
                              className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                              {DOC_TYPES_DRIVER.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                            <input value={docForm.doc_label} onChange={e => setDocForm(f => ({ ...f, doc_label: e.target.value }))} placeholder="Açıklama"
                              className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                            <div>
                              <label className="block text-xs text-zinc-500 mb-1">Son Geçerlilik Tarihi</label>
                              <input type="date" value={docForm.expiry_date} min={new Date().toISOString().split("T")[0]} onChange={e => setDocForm(f => ({ ...f, expiry_date: e.target.value }))}
                                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => saveDoc(selectedVehicle.id)} disabled={savingDoc} className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50">{savingDoc ? "..." : "Ekle"}</button>
                              <button onClick={() => setShowAddDriverDoc(false)} className="text-zinc-500 px-3 py-2 rounded-lg border border-zinc-700 text-sm">İptal</button>
                            </div>
                          </div>
                        ) : canEdit ? (
                          <button onClick={() => { setDocForm({ doc_type: "ehliyet", doc_label: "", expiry_date: "", notes: "" }); setShowAddDriverDoc(true); }}
                            className="w-full text-xs text-zinc-500 hover:text-white border border-zinc-700 hover:border-zinc-500 px-3 py-2 rounded-lg transition-colors">
                            + Sürücü Belgesi Ekle
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
