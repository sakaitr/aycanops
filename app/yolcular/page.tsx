"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Nav from "@/components/Nav";
import BulkActionBar from "@/components/BulkActionBar";
import { SkeletonLine } from "@/components/Skeleton";
import { IconUsers, IconSearch, IconX } from "@/components/Icons";
import { toast } from "@/lib/toast";
import { useListState } from "@/hooks/useListState";

const TYPE_LABELS: Record<string, string> = {
  yolcu: "Yolcu",
  personel: "Personel",
  musteri: "Müşteri",
};

const TYPE_COLORS: Record<string, string> = {
  yolcu: "bg-blue-500/15 text-blue-400 border border-blue-500/25",
  personel: "bg-violet-500/15 text-violet-400 border border-violet-500/25",
  musteri: "bg-amber-500/15 text-amber-400 border border-amber-500/25",
};

type Passenger = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  id_number: string | null;
  type: string;
  company_id: string | null;
  company_name: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  notes: string | null;
  status: string;
  sinif: string | null;
  sube: string | null;
  barkod_no: string | null;
  odeme_plani_id: string | null;
  sozlesme_durumu: string;
  hizmet_durumu: string;
  route_id: string | null;
  route_name?: string | null;
};

type Company = { id: string; name: string };
type OdemePlani = { id: string; plan_adi: string };
type RouteOpt = { id: string; name: string };

const EMPTY = {
  full_name: "", phone: "", email: "", id_number: "",
  type: "yolcu", status: "aktif",
  company_id: "", pickup_address: "", dropoff_address: "", notes: "",
  sinif: "", sube: "", barkod_no: "", odeme_plani_id: "",
  sozlesme_durumu: "yok", hizmet_durumu: "aktif", route_id: "",
};

const SOZLESME_DURUMU_OPTS = [
  { value: "yok", label: "Yok" },
  { value: "gonderildi", label: "Gönderildi" },
  { value: "imzalandi", label: "İmzalandı" },
];
const HIZMET_DURUMU_OPTS = [
  { value: "aktif", label: "Aktif" },
  { value: "pasif", label: "Pasif" },
  { value: "askida", label: "Askıda" },
];

type PassengerSort = "full_name" | "company_name" | "type" | "status";

function formatPhone(raw: string | null): string {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  if (d.length === 10 && d.startsWith("5"))
    return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}`;
  if (d.length === 11 && d.startsWith("05"))
    return `${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9)}`;
  return raw; // unchanged if unknown format
}

export default function YolcularPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data); else router.replace("/login");
    }).catch(() => { router.replace("/login"); });
  }, []);

  const [data, setData] = useState<Passenger[]>([]);
  const [loading, setLoading] = useState(false);
  const list = useListState<PassengerSort, { type: string; status: string; company_id: string }>({
    defaultSort: "full_name",
    defaultSortDir: "asc",
    defaultPageSize: 50,
    defaultFilters: { type: "", status: "aktif", company_id: "" },
  });

  const [companies, setCompanies] = useState<Company[]>([]);
  const [odemePlanlari, setOdemePlanlari] = useState<OdemePlani[]>([]);
  const [routes, setRoutes] = useState<RouteOpt[]>([]);

  // Servis değişiklikleri (sadece mevcut bir yolcu düzenlenirken)
  const [servisDegisiklikleri, setServisDegisiklikleri] = useState<any[]>([]);
  const [servisLoading, setServisLoading] = useState(false);
  const [showServisForm, setShowServisForm] = useState(false);
  const [servisForm, setServisForm] = useState({ gecici_route_id: "", baslangic_tarihi: "", bitis_tarihi: "", yon: "her_iki", aciklama: "" });
  const [servisSaving, setServisSaving] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Passenger | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Bulk add state
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkTab, setBulkTab] = useState<"manuel" | "excel">("manuel");
  const [bulkNames, setBulkNames] = useState("");
  const [bulkType, setBulkType] = useState("yolcu");
  const [bulkStatus, setBulkStatus] = useState("aktif");
  const [bulkCompanyId, setBulkCompanyId] = useState("");
  const [bulkPickup, setBulkPickup] = useState("");
  const [bulkDropoff, setBulkDropoff] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  // Excel import state
  const [excelRows, setExcelRows] = useState<any[] | null>(null);
  const [excelParsing, setExcelParsing] = useState(false);
  const [excelType, setExcelType] = useState("personel");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (list.filters.type) params.set("type", list.filters.type);
      if (list.filters.status) params.set("status", list.filters.status);
      if (list.filters.company_id) params.set("company_id", list.filters.company_id);
      if (list.search) params.set("q", list.search);
      const res = await fetch(`/api/yolcular?${params}`);
      const json = await res.json();
      if (json.ok) setData(json.data);
    } finally {
      setLoading(false);
    }
  }, [list.filters.company_id, list.filters.status, list.filters.type, list.search]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/companies?limit=200")
      .then(r => r.json())
      .then(d => { if (d.ok) setCompanies(d.data ?? []); })
      .catch(() => {});
    fetch("/api/odeme-planlari")
      .then(r => r.json())
      .then(d => { if (d.ok) setOdemePlanlari(d.data ?? []); })
      .catch(() => {});
    fetch("/api/routes?limit=500")
      .then(r => r.json())
      .then(d => { if (d.ok) setRoutes(d.data ?? []); })
      .catch(() => {});
  }, []);

  const loadServisDegisiklikleri = useCallback(async (passengerId: string) => {
    setServisLoading(true);
    try {
      const r = await fetch(`/api/yolcular/${passengerId}/servis-degisiklikleri`);
      const d = await r.json();
      if (d.ok) setServisDegisiklikleri(d.data);
    } finally { setServisLoading(false); }
  }, []);

  async function addServisDegisikligi() {
    if (!editTarget) return;
    if (!servisForm.gecici_route_id || !servisForm.baslangic_tarihi) { toast.error("Geçici güzergah ve başlangıç tarihi zorunludur"); return; }
    setServisSaving(true);
    try {
      const res = await fetch(`/api/yolcular/${editTarget.id}/servis-degisiklikleri`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...servisForm, orijinal_route_id: editTarget.route_id }),
      });
      const d = await res.json();
      if (!d.ok) { toast.error(d.error || "Hata"); return; }
      toast.success("Servis değişikliği eklendi");
      setShowServisForm(false);
      setServisForm({ gecici_route_id: "", baslangic_tarihi: "", bitis_tarihi: "", yon: "her_iki", aciklama: "" });
      loadServisDegisiklikleri(editTarget.id);
    } finally { setServisSaving(false); }
  }

  async function deleteServisDegisikligi(changeId: string) {
    if (!editTarget) return;
    if (!confirm("Bu servis değişikliği kaydı silinsin mi?")) return;
    const res = await fetch(`/api/yolcular/${editTarget.id}/servis-degisiklikleri/${changeId}`, { method: "DELETE" });
    const d = await res.json();
    if (!d.ok) { toast.error(d.error || "Hata"); return; }
    loadServisDegisiklikleri(editTarget.id);
  }

  function openNew() {
    setEditTarget(null);
    setForm({ ...EMPTY });
    setServisDegisiklikleri([]);
    setShowServisForm(false);
    setModalOpen(true);
  }

  function openEdit(p: Passenger) {
    setEditTarget(p);
    setForm({
      full_name: p.full_name,
      phone: p.phone ?? "",
      email: p.email ?? "",
      id_number: p.id_number ?? "",
      type: p.type,
      status: p.status,
      company_id: p.company_id ?? "",
      pickup_address: p.pickup_address ?? "",
      dropoff_address: p.dropoff_address ?? "",
      notes: p.notes ?? "",
      sinif: p.sinif ?? "",
      sube: p.sube ?? "",
      barkod_no: p.barkod_no ?? "",
      odeme_plani_id: p.odeme_plani_id ?? "",
      sozlesme_durumu: p.sozlesme_durumu ?? "yok",
      hizmet_durumu: p.hizmet_durumu ?? "aktif",
      route_id: p.route_id ?? "",
    });
    setShowServisForm(false);
    loadServisDegisiklikleri(p.id);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditTarget(null);
  }

  function setField(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!form.full_name?.trim()) return;
    setSaving(true);
    try {
      const url = editTarget ? `/api/yolcular/${editTarget.id}` : "/api/yolcular";
      const method = editTarget ? "PUT" : "POST";
      await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, company_id: form.company_id || null }),
      });
      closeModal();
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleExcelUpload(file: File) {
    setExcelParsing(true);
    setExcelRows(null);
    setBulkResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/yolcular/import", { method: "POST", body: fd });
      const json = await res.json();
      if (json.ok) {
        setExcelRows(json.rows);
        if (json.skipped > 0) setBulkResult(`${json.skipped} satır atlandı (boş ad).`);
      } else {
        toast.error(json.error ?? "Dosya okunamadı");
      }
    } catch {
      toast.error("Dosya yüklenirken hata oluştu");
    } finally {
      setExcelParsing(false);
    }
  }

  async function handleExcelImport() {
    if (!excelRows || excelRows.length === 0) return;
    setBulkSaving(true);
    setBulkResult(null);
    try {
      const payload = excelRows.map(r => ({ ...r, type: excelType }));
      const res = await fetch("/api/yolcular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.ok) {
        toast.success(`${json.count} kişi başarıyla eklendi.`);
        setExcelRows(null);
        setBulkOpen(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        await load();
      } else {
        toast.error(json.error ?? "Hata oluştu");
      }
    } catch {
      toast.error("Sunucuya bağlanılamadı");
    } finally {
      setBulkSaving(false);
    }
  }

  async function handleBulkSave() {
    const names = bulkNames.split("\n").map(s => s.trim()).filter(Boolean);
    if (names.length === 0) return;
    setBulkSaving(true);
    setBulkResult(null);
    try {
      const payload = names.map(name => ({
        full_name: name,
        type: bulkType,
        status: bulkStatus,
        company_id: bulkCompanyId || null,
        pickup_address: bulkPickup || null,
        dropoff_address: bulkDropoff || null,
      }));
      const res = await fetch("/api/yolcular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.ok) {
        setBulkResult(`${json.count} kişi başarıyla eklendi.`);
        setBulkNames("");
        await load();
      } else {
        setBulkResult("Hata: " + (json.error ?? "Bilinmeyen hata"));
      }
    } catch {
      setBulkResult("Hata oluştu.");
    } finally {
      setBulkSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/yolcular/${id}`, { method: "DELETE" });
    setDeleteConfirm(null);
    await load();
  }

  async function bulkDeactivate() {
    if (list.selectedIds.length === 0) return;
    const res = await fetch("/api/bulk-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module: "passengers", action: "deactivate", ids: list.selectedIds, execute: true }),
    });
    const json = await res.json();
    if (json.ok) {
      toast.success(`${json.job?.success_count ?? list.selectedIds.length} kayıt pasife alındı.`);
      list.clearSelection();
      await load();
    } else {
      toast.error(json.error ?? "Toplu işlem başarısız");
    }
  }

  const sortedData = useMemo(() => {
    const collator = new Intl.Collator("tr-TR");
    return [...data].sort((a, b) => {
      const av = String(a[list.sort] ?? "");
      const bv = String(b[list.sort] ?? "");
      const result = collator.compare(av, bv);
      return list.sortDir === "asc" ? result : -result;
    });
  }, [data, list.sort, list.sortDir]);

  const pageCount = Math.max(1, Math.ceil(sortedData.length / list.pageSize));
  const currentPage = Math.min(list.page, pageCount);
  const pageData = useMemo(() => {
    const start = (currentPage - 1) * list.pageSize;
    return sortedData.slice(start, start + list.pageSize);
  }, [currentPage, list.pageSize, sortedData]);

  const selectPage = () => list.selectMany(pageData.map(item => item.id));
  const selectFiltered = () => list.selectMany(sortedData.map(item => item.id));

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Nav user={user} />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--t-accent)]/20 flex items-center justify-center">
            <IconUsers className="text-[var(--t-accent)]" size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--foreground)]">Yolcu & Personel</h1>
            <p className="text-sm text-[var(--t-400)]">Kayıtlı yolcular, müşteriler ve personel</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setBulkOpen(true); setBulkResult(null); }}
            className="px-4 py-2 rounded-xl border border-[var(--t-accent)] text-[var(--t-accent)] text-sm font-semibold hover:bg-[var(--t-accent)]/10 transition-colors"
          >
            Toplu Ekle
          </button>
          <button
            onClick={openNew}
            className="px-4 py-2 rounded-xl bg-[var(--t-accent)] hover:opacity-90 text-white text-sm font-semibold transition-opacity"
          >
            + Yeni Kayıt
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--t-500)]" />
          <input
            value={list.search}
            onChange={e => list.setSearch(e.target.value)}
            placeholder="Ad, telefon, e-posta ara…"
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-[var(--t-700)] bg-[var(--t-900)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]/50"
          />
        </div>

        <select
          value={list.filters.type}
          onChange={e => list.setFilter("type", e.target.value)}
          className="py-2 px-3 rounded-lg border border-[var(--t-700)] bg-[var(--t-900)] text-[var(--foreground)] text-sm focus:outline-none"
        >
          <option value="">Tüm türler</option>
          <option value="yolcu">Yolcu</option>
          <option value="personel">Personel</option>
          <option value="musteri">Müşteri</option>
        </select>

        <select
          value={list.filters.status}
          onChange={e => list.setFilter("status", e.target.value)}
          className="py-2 px-3 rounded-lg border border-[var(--t-700)] bg-[var(--t-900)] text-[var(--foreground)] text-sm focus:outline-none"
        >
          <option value="aktif">Aktif</option>
          <option value="pasif">Pasif</option>
          <option value="">Tümü</option>
        </select>

        {companies.length > 0 && (
          <select
            value={list.filters.company_id}
            onChange={e => list.setFilter("company_id", e.target.value)}
            className="py-2 px-3 rounded-lg border border-[var(--t-700)] bg-[var(--t-900)] text-[var(--foreground)] text-sm focus:outline-none"
          >
            <option value="">Tüm firmalar</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        <select
          value={list.sort}
          onChange={e => list.toggleSort(e.target.value as PassengerSort)}
          className="py-2 px-3 rounded-lg border border-[var(--t-700)] bg-[var(--t-900)] text-[var(--foreground)] text-sm focus:outline-none"
        >
          <option value="full_name">Ada göre</option>
          <option value="company_name">Firmaya göre</option>
          <option value="type">Türe göre</option>
          <option value="status">Duruma göre</option>
        </select>
        {(list.search || list.filters.type || list.filters.status !== "aktif" || list.filters.company_id) && (
          <button onClick={list.clearFilters} className="text-xs text-[var(--t-accent)] hover:underline">
            Filtreleri temizle
          </button>
        )}
      </div>

      {/* Count */}
      <div className="flex items-center justify-between gap-3 text-xs text-[var(--t-500)]">
        <p>{sortedData.length} kayıt · sayfa {currentPage}/{pageCount}</p>
        <select
          value={list.pageSize}
          onChange={e => list.setPageSize(Number(e.target.value))}
          className="rounded-lg border border-[var(--t-700)] bg-[var(--t-900)] px-2 py-1 text-[var(--foreground)]"
        >
          {[25, 50, 100, 250].map(size => <option key={size} value={size}>{size}/sayfa</option>)}
        </select>
      </div>

      <BulkActionBar
        selectedCount={list.selectedIds.length}
        pageCount={pageData.length}
        filteredCount={sortedData.length}
        onSelectPage={selectPage}
        onSelectFiltered={selectFiltered}
        onClear={list.clearSelection}
      >
        <button onClick={bulkDeactivate} className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-zinc-950 transition-colors hover:bg-amber-400">
          Toplu pasife al
        </button>
      </BulkActionBar>

      {/* List */}
      <div className="bg-[var(--t-900)] border border-[var(--t-800)] rounded-xl overflow-hidden">
        {loading ? (
          <div className="divide-y divide-[var(--t-800)]">
            {Array.from({length:6}).map((_,i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <div className="w-9 h-9 rounded-full bg-zinc-800 animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <SkeletonLine w="60%" h="14px" />
                  <SkeletonLine w="40%" h="11px" />
                </div>
                <SkeletonLine w="50px" h="20px" className="rounded-full" />
              </div>
            ))}
          </div>
        ) : pageData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-[var(--t-500)]">
            <IconUsers size={32} className="opacity-30" />
            <p className="text-sm">Kayıt bulunamadı</p>
            <button
              onClick={openNew}
              className="text-xs text-[var(--t-accent)] hover:underline"
            >
              İlk kaydı ekle
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[var(--t-800)]">
            {pageData.map(p => (
              <div key={p.id} className="flex items-start justify-between px-4 py-3 hover:bg-[var(--t-800)]/50 gap-3">
                <label className="pt-1">
                  <input
                    type="checkbox"
                    checked={list.isSelected(p.id)}
                    onChange={() => list.toggleSelected(p.id)}
                    className="h-4 w-4 rounded border-[var(--t-700)] bg-[var(--t-900)]"
                    aria-label={`${p.full_name} seç`}
                  />
                </label>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-[var(--foreground)] text-sm">{p.full_name}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${TYPE_COLORS[p.type] ?? "bg-zinc-700 text-zinc-300"}`}>
                      {TYPE_LABELS[p.type] ?? p.type}
                    </span>
                    {p.status === "pasif" && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-400">Pasif</span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--t-400)] mt-0.5 flex items-center gap-3 flex-wrap">
                    {p.phone && <span>📞 {formatPhone(p.phone)}</span>}
                    {p.email && <span>✉ {p.email}</span>}
                    {p.company_name && p.company_id
                      ? <Link href={`/firmalar/${p.company_id}`} className="hover:underline" onClick={e => e.stopPropagation()}>🏢 {p.company_name}</Link>
                      : p.company_name && <span>🏢 {p.company_name}</span>}
                  </div>
                  {(p.pickup_address || p.dropoff_address) && (
                    <div className="text-xs text-[var(--t-500)] mt-1">
                      {p.pickup_address && <span>📍 Alış: {p.pickup_address}</span>}
                      {p.pickup_address && p.dropoff_address && <span className="mx-1">·</span>}
                      {p.dropoff_address && <span>📍 Bırakış: {p.dropoff_address}</span>}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEdit(p)}
                    className="px-2.5 py-1 text-xs bg-[var(--t-800)] hover:bg-[var(--t-700)] text-[var(--t-300)] rounded-lg transition-colors"
                  >
                    Düzenle
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(p.id)}
                    className="px-2.5 py-1 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                  >
                    Sil
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {sortedData.length > list.pageSize && (
        <div className="flex items-center justify-end gap-2">
          <button onClick={() => list.setPage(currentPage - 1)} disabled={currentPage <= 1} className="rounded-lg border border-[var(--t-700)] px-3 py-2 text-xs text-[var(--t-300)] disabled:opacity-40">
            Önceki
          </button>
          <button onClick={() => list.setPage(currentPage + 1)} disabled={currentPage >= pageCount} className="rounded-lg border border-[var(--t-700)] px-3 py-2 text-xs text-[var(--t-300)] disabled:opacity-40">
            Sonraki
          </button>
        </div>
      )}

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="bg-[var(--t-900)] border border-[var(--t-700)] rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--t-800)] sticky top-0 bg-[var(--t-900)]">
              <h2 className="font-semibold text-[var(--foreground)]">
                {editTarget ? "Kaydı Düzenle" : "Yeni Kayıt Ekle"}
              </h2>
              <button
                onClick={closeModal}
                className="w-7 h-7 rounded-lg bg-[var(--t-800)] hover:bg-[var(--t-700)] text-[var(--t-400)] flex items-center justify-center transition-colors"
              >
                <IconX size={14} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[var(--t-400)] mb-1.5">Ad Soyad *</label>
                  <input
                    value={form.full_name ?? ""}
                    onChange={e => setField("full_name", e.target.value)}
                    placeholder="Adı Soyadı"
                    className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]/50"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[var(--t-400)] mb-1.5">Firma</label>
                  <select
                    value={form.company_id ?? ""}
                    onChange={e => setField("company_id", e.target.value)}
                    className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="">Firma seçin (opsiyonel)</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--t-400)] mb-1.5">Tür</label>
                  <select
                    value={form.type}
                    onChange={e => setField("type", e.target.value)}
                    className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="yolcu">Yolcu</option>
                    <option value="personel">Personel</option>
                    <option value="musteri">Müşteri</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--t-400)] mb-1.5">Durum</label>
                  <select
                    value={form.status}
                    onChange={e => setField("status", e.target.value)}
                    className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="aktif">Aktif</option>
                    <option value="pasif">Pasif</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--t-400)] mb-1.5">Telefon</label>
                  <input
                    value={form.phone ?? ""}
                    onChange={e => setField("phone", e.target.value)}
                    placeholder="+90 5xx xxx xx xx"
                    type="tel"
                    className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--t-400)] mb-1.5">E-posta</label>
                  <input
                    value={form.email ?? ""}
                    onChange={e => setField("email", e.target.value)}
                    placeholder="ornek@mail.com"
                    type="email"
                    className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]/50"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[var(--t-400)] mb-1.5">TC Kimlik / Pasaport No</label>
                  <input
                    value={form.id_number ?? ""}
                    onChange={e => setField("id_number", e.target.value)}
                    placeholder="TC Kimlik veya pasaport numarası"
                    className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]/50"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[var(--t-400)] mb-1.5">Alış Adresi / Noktası</label>
                  <input
                    value={form.pickup_address ?? ""}
                    onChange={e => setField("pickup_address", e.target.value)}
                    placeholder="Alış yeri"
                    className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]/50"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[var(--t-400)] mb-1.5">Bırakış Adresi / Noktası</label>
                  <input
                    value={form.dropoff_address ?? ""}
                    onChange={e => setField("dropoff_address", e.target.value)}
                    placeholder="Bırakış yeri"
                    className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--t-400)] mb-1.5">Sınıf</label>
                  <input
                    value={form.sinif ?? ""}
                    onChange={e => setField("sinif", e.target.value)}
                    placeholder="örn. 8"
                    className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--t-400)] mb-1.5">Şube</label>
                  <input
                    value={form.sube ?? ""}
                    onChange={e => setField("sube", e.target.value)}
                    placeholder="örn. A"
                    className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--t-400)] mb-1.5">Barkod No</label>
                  <input
                    value={form.barkod_no ?? ""}
                    onChange={e => setField("barkod_no", e.target.value)}
                    placeholder="Kart/barkod numarası"
                    className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--t-400)] mb-1.5">Ödeme Planı</label>
                  <select
                    value={form.odeme_plani_id ?? ""}
                    onChange={e => setField("odeme_plani_id", e.target.value)}
                    className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="">— Plan Yok —</option>
                    {odemePlanlari.map(p => <option key={p.id} value={p.id}>{p.plan_adi}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--t-400)] mb-1.5">Sözleşme Durumu</label>
                  <select
                    value={form.sozlesme_durumu ?? "yok"}
                    onChange={e => setField("sozlesme_durumu", e.target.value)}
                    className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none"
                  >
                    {SOZLESME_DURUMU_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--t-400)] mb-1.5">Hizmet Durumu</label>
                  <select
                    value={form.hizmet_durumu ?? "aktif"}
                    onChange={e => setField("hizmet_durumu", e.target.value)}
                    className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none"
                  >
                    {HIZMET_DURUMU_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--t-400)] mb-1.5">Güzergah</label>
                  <select
                    value={form.route_id ?? ""}
                    onChange={e => setField("route_id", e.target.value)}
                    className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="">— Güzergah Yok —</option>
                    {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[var(--t-400)] mb-1.5">Not</label>
                  <textarea
                    value={form.notes ?? ""}
                    onChange={e => setField("notes", e.target.value)}
                    rows={2}
                    placeholder="Özel talimat, tercihler…"
                    className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]/50 resize-none"
                  />
                </div>
              </div>

              {/* Servis Değişiklikleri — sadece mevcut yolcu düzenlenirken */}
              {editTarget && (
                <div className="mt-5 pt-5 border-t border-[var(--t-800)]">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-[var(--foreground)]">Servis Değişiklikleri</h3>
                    <button
                      onClick={() => setShowServisForm(v => !v)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-[var(--t-800)] text-[var(--t-200)] hover:bg-[var(--t-700)] transition-colors"
                    >
                      {showServisForm ? "Vazgeç" : "+ Ekle"}
                    </button>
                  </div>

                  {showServisForm && (
                    <div className="bg-[var(--t-800)]/50 border border-[var(--t-700)] rounded-xl p-3 mb-3 space-y-2">
                      <select
                        value={servisForm.gecici_route_id}
                        onChange={e => setServisForm(f => ({ ...f, gecici_route_id: e.target.value }))}
                        className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-900)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none"
                      >
                        <option value="">Geçici güzergah seç...</option>
                        {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                        <input type="date" value={servisForm.baslangic_tarihi}
                          onChange={e => setServisForm(f => ({ ...f, baslangic_tarihi: e.target.value }))}
                          className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-900)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none [color-scheme:dark]" />
                        <input type="date" value={servisForm.bitis_tarihi}
                          onChange={e => setServisForm(f => ({ ...f, bitis_tarihi: e.target.value }))}
                          placeholder="Bitiş (opsiyonel)"
                          className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-900)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none [color-scheme:dark]" />
                      </div>
                      <select
                        value={servisForm.yon}
                        onChange={e => setServisForm(f => ({ ...f, yon: e.target.value }))}
                        className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-900)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none"
                      >
                        <option value="her_iki">Her İki Yön</option>
                        <option value="sabah">Sadece Sabah</option>
                        <option value="aksam">Sadece Akşam</option>
                      </select>
                      <input value={servisForm.aciklama} onChange={e => setServisForm(f => ({ ...f, aciklama: e.target.value }))}
                        placeholder="Açıklama"
                        className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-900)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none" />
                      <button onClick={addServisDegisikligi} disabled={servisSaving}
                        className="w-full py-2 rounded-lg bg-[var(--t-accent)] hover:opacity-90 text-white text-sm font-semibold disabled:opacity-50">
                        {servisSaving ? "Kaydediliyor..." : "Kaydet"}
                      </button>
                    </div>
                  )}

                  {servisLoading ? (
                    <p className="text-xs text-[var(--t-500)]">Yükleniyor...</p>
                  ) : servisDegisiklikleri.length === 0 ? (
                    <p className="text-xs text-[var(--t-600)]">Servis değişikliği kaydı yok</p>
                  ) : (
                    <div className="space-y-1.5">
                      {servisDegisiklikleri.map((sd: any) => (
                        <div key={sd.id} className="flex items-center justify-between gap-2 bg-[var(--t-800)]/40 border border-[var(--t-800)] rounded-lg px-3 py-2">
                          <div className="text-xs text-[var(--t-300)]">
                            <span className="text-[var(--foreground)]">{sd.gecici_route_name || "—"}</span>
                            {sd.orijinal_route_name && <span className="text-[var(--t-600)]"> ← {sd.orijinal_route_name}</span>}
                            <span className="text-[var(--t-600)]"> · {sd.baslangic_tarihi?.slice(0, 10)}{sd.bitis_tarihi ? ` — ${sd.bitis_tarihi.slice(0, 10)}` : ""}</span>
                          </div>
                          <button onClick={() => deleteServisDegisikligi(sd.id)} className="text-[var(--t-600)] hover:text-red-400 text-xs shrink-0">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={closeModal}
                className="flex-1 py-2.5 rounded-xl border border-[var(--t-700)] text-[var(--t-300)] text-sm font-medium hover:bg-[var(--t-800)] transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.full_name?.trim()}
                className="flex-1 py-2.5 rounded-xl bg-[var(--t-accent)] hover:opacity-90 text-white text-sm font-semibold transition-opacity disabled:opacity-50"
              >
                {saving ? "Kaydediliyor…" : editTarget ? "Güncelle" : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[var(--t-900)] border border-[var(--t-700)] rounded-2xl p-6 max-w-xs w-full shadow-2xl space-y-4">
            <p className="text-sm text-[var(--foreground)] font-medium">Bu kaydı silmek istediğinizden emin misiniz?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2 rounded-xl border border-[var(--t-700)] text-sm text-[var(--t-300)] hover:bg-[var(--t-800)] transition-colors"
              >
                İptal
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
              >
                Sil
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Bulk Add Modal */}
      {bulkOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={e => { if (e.target === e.currentTarget) setBulkOpen(false); }}
        >
          <div className="bg-[var(--t-900)] border border-[var(--t-700)] rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--t-800)] sticky top-0 bg-[var(--t-900)]">
              <div>
                <h2 className="font-semibold text-[var(--foreground)]">Toplu Yolcu Ekle</h2>
              </div>
              <button
                onClick={() => setBulkOpen(false)}
                className="w-7 h-7 rounded-lg bg-[var(--t-800)] hover:bg-[var(--t-700)] text-[var(--t-400)] flex items-center justify-center transition-colors"
              >
                <IconX size={14} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[var(--t-800)] px-6">
              {(["manuel", "excel"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setBulkTab(tab)}
                  className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors capitalize ${bulkTab === tab ? "border-[var(--t-accent)] text-[var(--t-accent)]" : "border-transparent text-[var(--t-500)] hover:text-[var(--t-300)]"}`}
                >
                  {tab === "manuel" ? "Manuel" : "Excel"}
                </button>
              ))}
            </div>

            <div className="px-6 py-5 space-y-4">
              {bulkTab === "excel" ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-[var(--t-400)] mb-1.5">Tür</label>
                    <select
                      value={excelType}
                      onChange={e => setExcelType(e.target.value)}
                      className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none"
                    >
                      <option value="personel">Personel</option>
                      <option value="yolcu">Yolcu</option>
                      <option value="musteri">Müşteri</option>
                    </select>
                  </div>
                  <div
                    className="border-2 border-dashed border-[var(--t-700)] rounded-xl p-8 text-center cursor-pointer hover:border-[var(--t-accent)] transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleExcelUpload(f); }}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleExcelUpload(f); }}
                    />
                    {excelParsing ? (
                      <p className="text-sm text-[var(--t-400)]">Dosya işleniyor…</p>
                    ) : excelRows ? (
                      <p className="text-sm text-green-400">{excelRows.length} kayıt hazır · farklı dosya için tıkla</p>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-sm text-[var(--t-400)]">Excel dosyasını buraya sürükle veya tıkla</p>
                        <p className="text-xs text-[var(--t-600)]">.xlsx · .xls</p>
                        <p className="text-xs text-[var(--t-700)] mt-2">Sütunlar: Kurum | Adı | Soyadı | Cep Telefonu | Servis Kayıt No | Özel Durum | Ev Adresi | Sicil No</p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
              <>
              <div>
                <label className="block text-xs font-medium text-[var(--t-400)] mb-1.5">
                  İsim Listesi *
                  {bulkNames && (
                    <span className="ml-2 text-[var(--t-accent)]">
                      {bulkNames.split("\n").map(s => s.trim()).filter(Boolean).length} kişi
                    </span>
                  )}
                </label>
                <textarea
                  value={bulkNames}
                  onChange={e => setBulkNames(e.target.value)}
                  rows={8}
                  placeholder={"Ahmet Yılmaz\nMehmet Demir\nAyşe Kara\n..."}
                  className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]/50 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--t-400)] mb-1.5">Firma</label>
                  <select
                    value={bulkCompanyId}
                    onChange={e => setBulkCompanyId(e.target.value)}
                    className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="">Firma yok</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--t-400)] mb-1.5">Tür</label>
                  <select
                    value={bulkType}
                    onChange={e => setBulkType(e.target.value)}
                    className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="yolcu">Yolcu</option>
                    <option value="personel">Personel</option>
                    <option value="musteri">Müşteri</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--t-400)] mb-1.5">Durum</label>
                  <select
                    value={bulkStatus}
                    onChange={e => setBulkStatus(e.target.value)}
                    className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="aktif">Aktif</option>
                    <option value="pasif">Pasif</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--t-400)] mb-1.5">Alış Noktası (hepsi için)</label>
                <input
                  value={bulkPickup}
                  onChange={e => setBulkPickup(e.target.value)}
                  placeholder="Ortak alış noktası (opsiyonel)"
                  className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--t-400)] mb-1.5">Bırakış Noktası (hepsi için)</label>
                <input
                  value={bulkDropoff}
                  onChange={e => setBulkDropoff(e.target.value)}
                  placeholder="Ortak bırakış noktası (opsiyonel)"
                  className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]/50"
                />
              </div>

              {bulkResult && (
                <p className={`text-sm px-3 py-2 rounded-lg ${bulkResult.startsWith("Hata") ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"}`}>
                  {bulkResult}
                </p>
              )}
              </>
              )}
            </div>

            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={() => setBulkOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-[var(--t-700)] text-[var(--t-300)] text-sm font-medium hover:bg-[var(--t-800)] transition-colors"
              >
                Kapat
              </button>
              {bulkTab === "excel" ? (
                <button
                  onClick={handleExcelImport}
                  disabled={bulkSaving || !excelRows?.length}
                  className="flex-1 py-2.5 rounded-xl bg-[var(--t-accent)] hover:opacity-90 text-white text-sm font-semibold transition-opacity disabled:opacity-50"
                >
                  {bulkSaving ? "Ekleniyor…" : `${excelRows?.length ?? 0} Kişiyi Içe Aktar`}
                </button>
              ) : (
                <button
                  onClick={handleBulkSave}
                  disabled={bulkSaving || !bulkNames.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-[var(--t-accent)] hover:opacity-90 text-white text-sm font-semibold transition-opacity disabled:opacity-50"
                >
                  {bulkSaving ? "Ekleniyor…" : `${bulkNames.split("\n").filter(s => s.trim()).length || 0} Kişiyi Ekle`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      </main>
    </div>
  );
}
