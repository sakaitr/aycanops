"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import BulkActionBar from "@/components/BulkActionBar";
import ComboboxSearch from "@/components/ComboboxSearch";
import { useListState } from "@/hooks/useListState";
import { useGlobalCompany } from "@/contexts/CompanyContext";
import { toast } from "@/lib/toast";
import { isValidTrPhone } from "@/lib/phone";
import { hasPermission } from "@/lib/permissions";

// ─── Helpers ────────────────────────────────────────────────────────────────

function expiryBadge(date: string | null | undefined) {
  if (!date) return null;
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: "Süresi Geçti", cls: "bg-red-950 text-red-300 border-red-800" };
  if (days <= 30) return { label: `${days}g kaldı`, cls: "bg-amber-950 text-amber-300 border-amber-800" };
  if (days <= 90) return { label: `${days}g`, cls: "bg-yellow-950 text-yellow-300 border-yellow-800" };
  return null; // Geçerli, uyarıya gerek yok
}

function expiryColor(date: string | null | undefined) {
  if (!date) return "text-zinc-600";
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  if (days < 0) return "text-red-400";
  if (days <= 30) return "text-amber-400";
  if (days <= 90) return "text-yellow-400";
  return "text-emerald-400";
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("tr-TR").format(new Date(d));
}

function scoreColor(score: number) {
  if (score >= 85) return { text: "text-emerald-400", bg: "bg-emerald-950 border-emerald-800 text-emerald-300", label: "İyi" };
  if (score >= 70) return { text: "text-yellow-400", bg: "bg-yellow-950 border-yellow-800 text-yellow-300", label: "Dikkat" };
  if (score >= 50) return { text: "text-orange-400", bg: "bg-orange-950 border-orange-800 text-orange-300", label: "Sorunlu" };
  return { text: "text-red-400", bg: "bg-red-950 border-red-800 text-red-300", label: "Kritik" };
}

const STATUS_OPTS = [
  { value: "aktif", label: "Aktif" },
  { value: "pasif", label: "Pasif" },
  { value: "izinli", label: "İzinli" },
];

const EMPTY_FORM = {
  name: "", phone: "", email: "", tc_no: "", birth_date: "",
  license_number: "", license_class: "",
  license_expiry: "", src_expiry: "", psiko_expiry: "", health_expiry: "",
  notes: "", status: "aktif", company_id: "",
};
const DEFAULT_DRIVER_FILTERS = { company: "", status: "aktif" };

function minDocumentDays(driver: any) {
  const days = [driver.license_expiry, driver.src_expiry, driver.psiko_expiry, driver.health_expiry]
    .filter(Boolean)
    .map((date: string) => Math.ceil((new Date(date).getTime() - Date.now()) / 86400000));
  return days.length > 0 ? Math.min(...days) : Number.POSITIVE_INFINITY;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SuruculerPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const list = useListState<"name" | "status" | "score" | "expiry", { company: string; status: string }>({
    defaultSort: "expiry",
    defaultPageSize: 24,
    defaultFilters: DEFAULT_DRIVER_FILTERS,
  });
  const { selectedCompanyId } = useGlobalCompany();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.get("f_company") && selectedCompanyId) list.setFilter("company", selectedCompanyId);
  }, [selectedCompanyId]);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data);
      else router.replace("/login");
    }).catch(() => router.replace("/login"));

    fetch("/api/companies?limit=9999").then(r => r.json()).then(d => {
      if (d.ok) setCompanies(d.data);
    });
  }, []);

  useEffect(() => { load(); }, [list.search, list.filters.company, list.filters.status]);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (list.search) params.set("q", list.search);
      if (list.filters.company) params.set("company_id", list.filters.company);
      if (list.filters.status) params.set("status", list.filters.status);
      params.set("limit", "9999");
      const r = await fetch(`/api/suruculer?${params}`);
      const d = await r.json();
      if (d.ok) setDrivers(d.data);
    } finally { setLoading(false); }
  }

  async function saveDriver() {
    if (!form.name.trim()) { setSaveError("Ad zorunludur"); return; }
    if (form.phone.trim() && !isValidTrPhone(form.phone)) { setSaveError("Telefon geçersiz — 05xx xxx xx xx formatında, 11 haneli olmalı"); return; }
    setSaving(true); setSaveError(null);
    try {
      const res = await fetch("/api/suruculer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!d.ok) { setSaveError(d.error || "Kayıt hatası"); return; }
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      load();
    } finally { setSaving(false); }
  }

  const canEdit = hasPermission(user, "drivers:update");

  async function bulkDeactivate() {
    if (list.selectedIds.length === 0) return;
    if (!confirm(`${list.selectedIds.length} sürücü pasife alınsın mı?`)) return;
    const d = await fetch("/api/bulk-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module: "drivers", action: "deactivate", ids: list.selectedIds, execute: true }),
    }).then(r => r.json()).catch(() => null);
    if (!d?.ok) { toast.error(d?.error || "Toplu işlem başarısız"); return; }
    toast.success(`${d.data.success} sürücü pasife alındı`);
    list.clearSelection();
    load();
  }

  const sorted = [...drivers].sort((a, b) => {
    let cmp = 0;
    if (list.sort === "name") cmp = a.name.localeCompare(b.name, "tr");
    else if (list.sort === "status") cmp = (a.status || "").localeCompare(b.status || "", "tr");
    else if (list.sort === "score") cmp = (100 - (a.total_deduction ?? 0)) - (100 - (b.total_deduction ?? 0));
    else if (list.sort === "expiry") cmp = minDocumentDays(a) - minDocumentDays(b);
    if (cmp === 0) cmp = a.name.localeCompare(b.name, "tr");
    return list.sortDir === "asc" ? cmp : -cmp;
  });
  const totalPages = Math.max(1, Math.ceil(sorted.length / list.pageSize));
  const paginated = sorted.slice((list.page - 1) * list.pageSize, list.page * list.pageSize);
  const pageIds = paginated.map(driver => String(driver.id));
  const filteredIds = sorted.map(driver => String(driver.id));

  useEffect(() => {
    if (list.page > totalPages) list.setPage(totalPages);
  }, [list, totalPages]);

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-7xl mx-auto px-4 py-6">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Sürücüler</h1>
              <p className="text-zinc-500 text-sm mt-0.5">{sorted.length} sürücü listeleniyor</p>
            </div>
            {canEdit && (
              <button
                onClick={() => { setShowForm(true); setForm({ ...EMPTY_FORM, company_id: list.filters.company || "" }); setSaveError(null); }}
                className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors whitespace-nowrap"
              >
                + Yeni Sürücü
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2 mb-6">
            <input
              value={list.search}
              onChange={e => list.setSearch(e.target.value)}
              placeholder="Ad ile ara..."
              className="flex-1 bg-zinc-900 border border-zinc-800 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-zinc-600 placeholder-zinc-600"
            />
            <ComboboxSearch
              options={companies.map(c => ({ value: c.id, label: c.name }))}
              value={list.filters.company}
              onChange={value => list.setFilter("company", value)}
              placeholder="Firma filtresi..."
              emptyLabel="— Tüm Firmalar —"
            />
            <select
              value={list.filters.status}
              onChange={e => list.setFilter("status", e.target.value)}
              className="bg-zinc-900 border border-zinc-800 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-zinc-600"
            >
              <option value="">Tüm Durum</option>
              {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {(list.search || list.filters.company || list.filters.status !== DEFAULT_DRIVER_FILTERS.status) && (
              <button onClick={list.clearFilters} className="text-xs font-medium px-3 py-2 rounded-xl border border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-white transition-colors">
                Filtreleri temizle
              </button>
            )}
          </div>

          {/* Sort controls */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-zinc-600 text-xs">Sırala:</span>
            {([["expiry", "Belge"], ["name", "Ad"], ["score", "Puan"], ["status", "Durum"]] as const).map(([field, label]) => (
              <button key={field} onClick={() => list.toggleSort(field)}
                className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${list.sort === field ? "bg-zinc-700 border-zinc-600 text-white" : "border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-600"}`}>
                {label} {list.sort === field ? (list.sortDir === "asc" ? "↑" : "↓") : ""}
              </button>
            ))}
            <select value={list.pageSize} onChange={e => list.setPageSize(Number(e.target.value))}
              className="ml-auto bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-zinc-600">
              {[24, 48, 96].map(size => <option key={size} value={size}>{size}/sayfa</option>)}
            </select>
          </div>

          {canEdit && (
            <BulkActionBar
              selectedCount={list.selectedIds.length}
              pageCount={paginated.length}
              filteredCount={sorted.length}
              onSelectPage={() => list.selectMany(pageIds)}
              onSelectFiltered={() => list.setSelectedIds(filteredIds)}
              onClear={list.clearSelection}
            >
              <button onClick={bulkDeactivate} className="rounded-lg border border-sky-700 px-3 py-2 text-xs font-semibold text-sky-100 transition-colors hover:bg-sky-900">
                Toplu pasife al
              </button>
              <button disabled className="rounded-lg border border-sky-800 px-3 py-2 text-xs font-semibold text-sky-400/70 opacity-70">
                Belge hatırlat · yakında
              </button>
            </BulkActionBar>
          )}

          {/* Driver grid */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 animate-pulse">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 bg-zinc-800 rounded-full" />
                    <div className="flex-1">
                      <div className="h-4 bg-zinc-800 rounded w-3/4 mb-1.5" />
                      <div className="h-3 bg-zinc-800 rounded w-1/2" />
                    </div>
                  </div>
                  <div className="h-3 bg-zinc-800 rounded w-full" />
                </div>
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-zinc-500 text-lg">Sürücü bulunamadı</p>
              <p className="text-zinc-600 text-sm mt-1">Filtre değiştirin veya yeni sürücü ekleyin</p>
            </div>
          ) : (
            <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {paginated.map(driver => {
                const score = Math.max(0, 100 - (driver.total_deduction ?? 0));
                const sc = scoreColor(score);
                const docs = [
                  { label: "Ehliyet", date: driver.license_expiry },
                  { label: "SRC", date: driver.src_expiry },
                  { label: "Psiko", date: driver.psiko_expiry },
                  { label: "Sağlık", date: driver.health_expiry },
                ];
                const warnings = docs.filter(d => expiryBadge(d.date));
                const initials = driver.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("");
                const selected = list.isSelected(String(driver.id));

                return (
                  <div
                    key={driver.id}
                    onClick={() => router.push(`/suruculer/${driver.id}`)}
                    className={`bg-zinc-900 border rounded-2xl p-4 hover:border-zinc-600 hover:bg-zinc-800/60 cursor-pointer transition-all ${selected ? "ring-2 ring-sky-500/70 border-sky-700" : "border-zinc-800"}`}
                  >
                    {/* Header */}
                    <div className="flex items-start gap-3 mb-3">
                      {canEdit && (
                        <input
                          type="checkbox"
                          checked={selected}
                          onClick={e => e.stopPropagation()}
                          onChange={() => list.toggleSelected(String(driver.id))}
                          className="mt-4 h-4 w-4 rounded border-zinc-600 bg-zinc-800 accent-sky-500"
                          aria-label={`${driver.name} seç`}
                        />
                      )}
                      <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-base shrink-0">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold text-sm truncate">{driver.name}</p>
                        {driver.phone && (
                          <p className="text-zinc-500 text-xs truncate">{driver.phone}</p>
                        )}
                        {driver.company_name && (
                          <p className="text-zinc-600 text-xs truncate">{driver.company_name}</p>
                        )}
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${sc.bg} shrink-0`}>
                        {score}
                      </span>
                    </div>

                    {/* Araç */}
                    {driver.current_vehicle_plate && (
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="text-zinc-600 text-[10px]">🚌</span>
                        <span className="text-zinc-400 text-xs font-mono">{driver.current_vehicle_plate}</span>
                      </div>
                    )}

                    {/* Belge uyarıları */}
                    {warnings.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {warnings.map(w => {
                          const badge = expiryBadge(w.date)!;
                          return (
                            <span
                              key={w.label}
                              className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${badge.cls}`}
                            >
                              {w.label}: {badge.label}
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* Durum badge */}
                    {driver.status !== "aktif" && (
                      <span className={`mt-2 inline-block text-[10px] px-1.5 py-0.5 rounded border ${
                        driver.status === "pasif"
                          ? "bg-zinc-800 text-zinc-500 border-zinc-700"
                          : "bg-blue-950 text-blue-300 border-blue-800"
                      }`}>
                        {driver.status === "pasif" ? "Pasif" : "İzinli"}
                      </span>
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
        </div>
      </div>

      {/* Slide-over form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/60" onClick={() => setShowForm(false)} />
          <div className="w-full max-w-md bg-zinc-900 border-l border-zinc-800 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
              <h2 className="text-white font-semibold">Yeni Sürücü Ekle</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
            </div>

            {/* Form body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {saveError && (
                <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">{saveError}</div>
              )}

              <div className="grid grid-cols-1 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Ad Soyad *</span>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" placeholder="Mehmet Yılmaz" />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-zinc-400 text-xs font-medium mb-1 block">Telefon</span>
                    <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      type="tel" inputMode="tel" maxLength={17}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" placeholder="05xx xxx xx xx" />
                    {form.phone.trim() && !isValidTrPhone(form.phone) && (
                      <p className="text-amber-500 text-[11px] mt-1">05xx xxx xx xx formatında, 11 haneli olmalı</p>
                    )}
                  </label>
                  <label className="block">
                    <span className="text-zinc-400 text-xs font-medium mb-1 block">TC Kimlik No</span>
                    <input value={form.tc_no} onChange={e => setForm(f => ({ ...f, tc_no: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" maxLength={11} />
                  </label>
                </div>

                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">E-posta</span>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" placeholder="ornek@mail.com" />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-zinc-400 text-xs font-medium mb-1 block">Doğum Tarihi</span>
                    <input type="date" value={form.birth_date} onChange={e => setForm(f => ({ ...f, birth_date: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                  </label>
                  <label className="block">
                    <span className="text-zinc-400 text-xs font-medium mb-1 block">Ehliyet Sınıfı</span>
                    <select value={form.license_class} onChange={e => setForm(f => ({ ...f, license_class: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                      <option value="">Seç...</option>
                      {["B", "C", "C1", "D", "D1", "DE"].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                </div>

                <div className="border-t border-zinc-800 pt-3">
                  <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-3">Belge Son Tarihleri</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: "license_expiry", label: "Ehliyet" },
                      { key: "src_expiry", label: "SRC Belgesi" },
                      { key: "psiko_expiry", label: "Psikoteknik" },
                      { key: "health_expiry", label: "Sağlık Raporu" },
                    ].map(({ key, label }) => (
                      <label key={key} className="block">
                        <span className="text-zinc-400 text-xs font-medium mb-1 block">{label}</span>
                        <input
                          type="date"
                          value={(form as any)[key]}
                          min={new Date().toISOString().split("T")[0]}
                          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                          className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]"
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-zinc-400 text-xs font-medium mb-1 block">Firma *</span>
                    <ComboboxSearch
                      options={companies.map(c => ({ value: c.id, label: c.name }))}
                      value={form.company_id}
                      onChange={v => setForm(f => ({ ...f, company_id: v }))}
                      placeholder="Firma seç..."
                      emptyLabel="— Firma seçilmedi —"
                    />
                    {!form.company_id && (
                      <p className="text-amber-500 text-[11px] mt-1">Firma seçilmezse bu sürücü firma filtresiyle listelerde görünmez.</p>
                    )}
                  </label>
                  <label className="block">
                    <span className="text-zinc-400 text-xs font-medium mb-1 block">Durum</span>
                    <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                      {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </label>
                </div>

                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Notlar</span>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
                </label>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={() => setShowForm(false)}
                className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors">
                İptal
              </button>
              <button onClick={saveDriver} disabled={saving || !form.name.trim() || !form.company_id}
                className="flex-1 bg-white text-zinc-950 font-semibold text-sm py-2.5 rounded-xl hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
