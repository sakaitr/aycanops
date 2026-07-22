"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import ComboboxSearch from "@/components/ComboboxSearch";
import { toast } from "@/lib/toast";
import { hasPermission } from "@/lib/permissions";
import { useGlobalCompany } from "@/contexts/CompanyContext";

function todayStr() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());
}

function addDays(dateStr: string, delta: number) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + delta);
  return new Intl.DateTimeFormat("sv-SE").format(d);
}

function formatDateLabel(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long" }).format(d);
}

// Eski sabit hareket tipi değerleri (geriye dönük kayıtların okunaklı gösterimi için).
// Yeni kayıtlarda hareket_tipi artık güzergahın kendi tanımladığı vardiya adıdır (serbest metin).
const LEGACY_HAREKET_TIPI_LABELS: Record<string, string> = {
  sabah: "Sabah", aksam: "Akşam", ring: "Ring", transfer: "Transfer",
};
function hareketTipiLabel(v: string) { return LEGACY_HAREKET_TIPI_LABELS[v] || v; }

const DURUM_BADGE: Record<string, { label: string; cls: string }> = {
  bekliyor: { label: "Bekliyor", cls: "bg-amber-950 border-amber-800 text-amber-300" },
  onaylandi: { label: "Onaylandı", cls: "bg-emerald-950 border-emerald-800 text-emerald-300" },
  iptal: { label: "İptal", cls: "bg-zinc-800 border-zinc-700 text-zinc-500" },
};

const EMPTY_FORM = { vehicle_id: "", route_id: "", hareket_tipi: "", yolcu_sayisi: "", aciklama: "" };

interface VehicleOverride {
  vehicle_id: string;
  plate: string;
  kalici: boolean;
}

type RangePreset = "bugun" | "dun" | "son5" | "son1hafta" | "son30gun" | "ozel";

const RANGE_PRESET_OPTS: { value: RangePreset; label: string }[] = [
  { value: "bugun", label: "Bugün" },
  { value: "dun", label: "Dün" },
  { value: "son5", label: "Son 5 Gün" },
  { value: "son1hafta", label: "Son 1 Hafta" },
  { value: "son30gun", label: "Son 30 Gün" },
  { value: "ozel", label: "Özel Aralık" },
];

function presetToRange(preset: RangePreset, customFrom: string, customTo: string): { from: string; to: string } {
  const today = todayStr();
  switch (preset) {
    case "bugun": return { from: today, to: today };
    case "dun": { const d = addDays(today, -1); return { from: d, to: d }; }
    case "son5": return { from: addDays(today, -4), to: today };
    case "son1hafta": return { from: addDays(today, -6), to: today };
    case "son30gun": return { from: addDays(today, -29), to: today };
    case "ozel": return { from: customFrom || today, to: customTo || today };
  }
}

function dateRangeArray(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard < 366) {
    out.push(cur);
    cur = addDays(cur, 1);
    guard++;
  }
  return out;
}

function formatDateShort(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit" }).format(d);
}

function formatWeekdayShort(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return new Intl.DateTimeFormat("tr-TR", { weekday: "short" }).format(d);
}

// DB'den DATETIME olarak gelen tarih değerini (UTC serileştirilmiş) İstanbul yerel
// gününe çevirir — ham ISO string'i dilimlemek bir gün kaydırma hatasına yol açar.
function toLocalDateStr(value: string) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date(value));
}

export default function CeteleePage() {
  const router = useRouter();
  const { selectedCompanyId, selectedCompanyName } = useGlobalCompany();
  const [user, setUser] = useState<any>(null);
  const [date, setDate] = useState(todayStr());
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [durumFilter, setDurumFilter] = useState("");

  // Grid — hızlı toplu onay. Her güzergah kendi vardiyasını taşır (rowSlot),
  // sabit tek bir "hareket tipi" artık yok.
  const [rowSlot, setRowSlot] = useState<Record<string, string>>({});
  const [selectedRouteIds, setSelectedRouteIds] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, VehicleOverride>>({});
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; routeId: string; yon: "giris" | "cikis" | null } | null>(null);
  const [swapModal, setSwapModal] = useState<{ routeId: string; yon: "giris" | "cikis" | null; mode: "gecici" | "kalici" } | null>(null);
  const [swapVehicleId, setSwapVehicleId] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Takvim (matrix) görünümü
  const [viewMode, setViewMode] = useState<"gunluk" | "takvim">("gunluk");
  const [rangePreset, setRangePreset] = useState<RangePreset>("son1hafta");
  const [customFrom, setCustomFrom] = useState(addDays(todayStr(), -6));
  const [customTo, setCustomTo] = useState(todayStr());
  const [matrixHareketTipi, setMatrixHareketTipi] = useState("");
  // Seçili firmanın güzergahlarında tanımlı vardiya adlarının birleşimi (dedup)
  const availableSlotNames = Array.from(new Set(routes.flatMap((r: any) => (r.time_slots || []).map((s: any) => s.ad))));
  useEffect(() => {
    if (!matrixHareketTipi && availableSlotNames.length > 0) setMatrixHareketTipi(availableSlotNames[0]);
  }, [availableSlotNames.join(",")]);
  const [matrixRows, setMatrixRows] = useState<any[]>([]);
  const [matrixLoading, setMatrixLoading] = useState(false);

  const { from: rangeFrom, to: rangeTo } = presetToRange(rangePreset, customFrom, customTo);
  const rangeDates = dateRangeArray(rangeFrom, rangeTo);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data);
      else router.replace("/login");
    });
    fetch("/api/vehicles?limit=500&status=active").then(r => r.json()).then(d => { if (d.ok) setVehicles(d.data); });
  }, []);

  async function loadRoutes() {
    setRoutesLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCompanyId) params.set("company_id", selectedCompanyId);
      const r = await fetch(`/api/routes?${params}`);
      const d = await r.json();
      if (!d.ok) return;
      setRoutes(d.data);
      // Her güzergah için varsayılan vardiya: tek vardiya varsa otomatik, birden
      // fazlaysa ilkini seç (kullanıcı dropdown'dan değiştirebilir) — "kolaylık".
      setRowSlot(prev => {
        const next: Record<string, string> = { ...prev };
        for (const rt of d.data as any[]) {
          if (!next[rt.id] && rt.time_slots?.length > 0) next[rt.id] = rt.time_slots[0].ad;
        }
        return next;
      });
    } finally { setRoutesLoading(false); }
  }

  useEffect(() => {
    loadRoutes();
    // Firma değişince seçim/override sıfırlanır
    setSelectedRouteIds(new Set());
    setOverrides({});
  }, [selectedCompanyId]);

  useEffect(() => { load(); }, [date, durumFilter]);

  // Tarih değişince seçim sıfırlanır (farklı gün için farklı satırlar işlenmiş olabilir)
  useEffect(() => { setSelectedRouteIds(new Set()); }, [date]);

  async function loadMatrix() {
    if (!selectedCompanyId) return;
    setMatrixLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("tarih", rangeFrom);
      params.set("tarih_bitis", rangeTo);
      params.set("hareket_tipi", matrixHareketTipi);
      const r = await fetch(`/api/cetele?${params}`);
      const d = await r.json();
      if (d.ok) setMatrixRows(d.data);
    } finally { setMatrixLoading(false); }
  }

  useEffect(() => {
    if (viewMode !== "takvim") return;
    loadMatrix();
  }, [viewMode, selectedCompanyId, rangeFrom, rangeTo, matrixHareketTipi]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) setContextMenu(null);
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("contextmenu", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("contextmenu", handler);
    };
  }, []);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("tarih", date);
      if (durumFilter) params.set("durum", durumFilter);
      const r = await fetch(`/api/cetele?${params}`);
      const d = await r.json();
      if (d.ok) setRows(d.data);
    } finally { setLoading(false); }
  }

  async function save() {
    if (!form.vehicle_id) { setSaveError("Araç seçiniz"); return; }
    if (!form.hareket_tipi.trim()) { setSaveError("Hareket/vardiya adı zorunludur"); return; }
    setSaving(true); setSaveError(null);
    try {
      const res = await fetch("/api/cetele", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, tarih: date }),
      });
      const d = await res.json();
      if (!d.ok) { setSaveError(d.error || "Kayıt hatası"); return; }
      toast.success("Çetele kaydı eklendi");
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      load();
    } finally { setSaving(false); }
  }

  async function onayla(id: string) {
    const res = await fetch(`/api/cetele/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "onayla" }),
    });
    const d = await res.json();
    if (!d.ok) { toast.error(d.error || "Hata"); return; }
    toast.success("Onaylandı");
    load();
  }

  async function iptalEt(id: string) {
    const reason = prompt("İptal nedeni (opsiyonel):");
    if (reason === null) return;
    const res = await fetch(`/api/cetele/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "iptal", geri_alma_nedeni: reason || null }),
    });
    const d = await res.json();
    if (!d.ok) { toast.error(d.error || "Hata"); return; }
    toast.success("İptal edildi");
    load();
  }

  const canCreate = hasPermission(user, "cetele:create");
  const canApprove = hasPermission(user, "cetele:approve");

  // Global firma seçiliyse, sadece o firmaya bağlı araçları göster
  const filteredVehicles = selectedCompanyId
    ? vehicles.filter(v => (v.companies || []).some((c: any) => c.company_id === selectedCompanyId))
    : vehicles;

  const visibleRows = selectedCompanyId
    ? rows.filter(r => {
        const veh = vehicles.find(v => v.id === r.vehicle_id);
        return veh && (veh.companies || []).some((c: any) => c.company_id === selectedCompanyId);
      })
    : rows;

  const bekleyen = visibleRows.filter(r => r.durum === "bekliyor").length;
  const onaylanan = visibleRows.filter(r => r.durum === "onaylandi").length;

  // Seçim/işlem anahtarı: sabit modda routeId, ayrı modda routeId::giris / routeId::cikis
  function rowKey(routeId: string, yon: "giris" | "cikis" | null) {
    return yon ? `${routeId}::${yon}` : routeId;
  }

  // Bugün, her güzergahın kendi seçili vardiyası (+ yön) için işlenmiş mi (iptal hariç)
  function isProcessed(routeId: string, yon: "giris" | "cikis" | null = null): boolean {
    const slot = rowSlot[routeId];
    if (!slot) return false;
    return rows.some(r => r.route_id === routeId && r.hareket_tipi === slot && (r.yon || null) === yon && r.durum !== "iptal");
  }

  // Ayrı araç modunda, o yön için güncel atamayı (varsa vardiyaya özel, yoksa genel) bulur
  function activeAssignmentFor(route: any, yon: "giris" | "cikis"): { vehicle_id: string; plate: string } | null {
    const slot = rowSlot[route.id];
    const list: any[] = route.atama_aktif || [];
    const exact = list.find(a => a.yon === yon && a.hareket_tipi === slot);
    if (exact) return { vehicle_id: exact.vehicle_id, plate: exact.plate };
    const general = list.find(a => a.yon === yon && !a.hareket_tipi);
    if (general) return { vehicle_id: general.vehicle_id, plate: general.plate };
    return null;
  }

  function effectiveVehicle(route: any, yon: "giris" | "cikis" | null = null): { vehicle_id: string; plate: string; kalici: boolean } | null {
    const key = rowKey(route.id, yon);
    const override = overrides[key];
    if (override) return { vehicle_id: override.vehicle_id, plate: override.plate, kalici: override.kalici };
    if (route.arac_modu === "ayri" && yon) {
      const active = activeAssignmentFor(route, yon);
      if (active) return { vehicle_id: active.vehicle_id, plate: active.plate, kalici: false };
      return null;
    }
    if (route.vehicle_id) return { vehicle_id: route.vehicle_id, plate: route.vehicle_plate, kalici: false };
    return null;
  }

  function toggleRoute(routeId: string, yon: "giris" | "cikis" | null = null) {
    if (!canApprove) { toast.error("Çetele onaylama yetkiniz yok"); return; }
    if (!rowSlot[routeId]) { toast.error("Önce bu güzergah için vardiya seçin"); return; }
    if (isProcessed(routeId, yon)) { toast.error("Bu satır bugün bu vardiya için zaten işlendi"); return; }
    const route = routes.find(r => r.id === routeId);
    const veh = effectiveVehicle(route, yon);
    if (!veh) { openAssign(routeId, yon, "kalici"); return; }
    const key = rowKey(routeId, yon);
    setSelectedRouteIds(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function openContextMenu(e: React.MouseEvent, routeId: string, yon: "giris" | "cikis" | null = null) {
    e.preventDefault();
    if (!canApprove || isProcessed(routeId, yon)) return;
    setContextMenu({ x: e.clientX, y: e.clientY, routeId, yon });
  }

  function openSwap(mode: "gecici" | "kalici") {
    if (!contextMenu) return;
    openAssign(contextMenu.routeId, contextMenu.yon, mode);
    setContextMenu(null);
  }

  // Bir güzergaha (yöne) araç atama/değiştirme modalını doğrudan açar — hem sağ
  // tık menüsünden hem de araç atanmamış bir satıra sol tıklandığında kullanılır.
  function openAssign(routeId: string, yon: "giris" | "cikis" | null, mode: "gecici" | "kalici") {
    setSwapModal({ routeId, yon, mode });
    setSwapVehicleId("");
  }

  function applySwap() {
    if (!swapModal || !swapVehicleId) return;
    const veh = filteredVehicles.find(v => v.id === swapVehicleId);
    if (!veh) return;
    const key = rowKey(swapModal.routeId, swapModal.yon);
    setOverrides(prev => ({
      ...prev,
      [key]: { vehicle_id: veh.id, plate: veh.plate, kalici: swapModal.mode === "kalici" },
    }));
    if (!isProcessed(swapModal.routeId, swapModal.yon)) {
      setSelectedRouteIds(prev => new Set(prev).add(key));
    }
    toast.success(swapModal.mode === "kalici" ? "Araç kalıcı değiştirildi (onaylandığında güzergaha işlenir)" : "Araç bugün için geçici değiştirildi");
    setSwapModal(null);
    setSwapVehicleId("");
  }

  // Seçili anahtarları {route, yon} çiftlerine çözer
  const selectedEntries2 = Array.from(selectedRouteIds).map(key => {
    const [routeId, yon] = key.split("::") as [string, "giris" | "cikis" | undefined];
    const route = routes.find(r => r.id === routeId);
    return { key, route, yon: yon || null };
  }).filter(e => e.route);

  // Takvim: route_id + tarih (YYYY-MM-DD) → çetele kaydı
  const matrixLookup: Record<string, any> = {};
  for (const r of matrixRows) {
    if (!r.route_id) continue;
    const key = `${r.route_id}__${toLocalDateStr(r.tarih)}`;
    matrixLookup[key] = r;
  }

  async function submitBulk() {
    setBulkSaving(true);
    try {
      const entries = selectedEntries2.map(e => {
        const veh = effectiveVehicle(e.route, e.yon)!;
        return { route_id: e.route.id, vehicle_id: veh.vehicle_id, hareket_tipi: rowSlot[e.route.id], yon: e.yon, kalici_degisim: veh.kalici };
      });
      const res = await fetch("/api/cetele/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tarih: date, entries }),
      });
      const d = await res.json();
      if (!d.ok) { toast.error(d.error || "Toplu onay başarısız"); return; }
      const skippedCount = d.data.skipped?.length || 0;
      toast.success(`${d.data.created} kayıt onaylandı${skippedCount ? `, ${skippedCount} zaten vardı` : ""}`);
      setShowSummary(false);
      setSelectedRouteIds(new Set());
      const hadKalici = entries.some(e => e.kalici_degisim);
      setOverrides({});
      load();
      // Kalıcı araç değişimi güzergahın vehicle_id'sini sunucuda güncelledi —
      // aksi halde ekran, override temizlendikten sonra "araç atanmamış" gösterir.
      if (hadKalici) loadRoutes();
    } finally { setBulkSaving(false); }
  }

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-5xl mx-auto px-4 py-6">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Çetele</h1>
              <p className="text-zinc-500 text-sm mt-0.5">
                {selectedCompanyName ? `${selectedCompanyName} · ` : ""}
                {visibleRows.length} kayıt · {bekleyen} bekliyor · {onaylanan} onaylı
              </p>
            </div>
            {canCreate && (
              <button
                onClick={() => { setShowForm(true); setForm({ ...EMPTY_FORM }); setSaveError(null); }}
                disabled={!selectedCompanyId}
                title={!selectedCompanyId ? "Önce sağ üstten firma seçin" : undefined}
                className="bg-zinc-800 text-zinc-200 font-medium text-sm px-4 py-2 rounded-xl hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                + Serbest Kayıt
              </button>
            )}
          </div>

          {!selectedCompanyId && (
            <div className="bg-amber-950/50 border border-amber-800/60 text-amber-300 text-sm px-4 py-3 rounded-xl mb-6">
              Güzergah tablosunu görmek için sağ üstten bir firma seçin.
            </div>
          )}

          {/* Görünüm toggle */}
          <div className="flex gap-1 mb-4 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
            {([["gunluk", "Günlük"], ["takvim", "Takvim"]] as const).map(([value, label]) => (
              <button key={value} onClick={() => setViewMode(value)}
                className={`text-sm px-4 py-1.5 rounded-lg transition-colors ${
                  viewMode === value ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-white"
                }`}>
                {label}
              </button>
            ))}
          </div>

          {viewMode === "takvim" ? (
            <CeteleTakvim
              selectedCompanyId={selectedCompanyId}
              routes={routes}
              routesLoading={routesLoading}
              rangePreset={rangePreset}
              setRangePreset={setRangePreset}
              customFrom={customFrom}
              setCustomFrom={setCustomFrom}
              customTo={customTo}
              setCustomTo={setCustomTo}
              rangeDates={rangeDates}
              matrixHareketTipi={matrixHareketTipi}
              setMatrixHareketTipi={setMatrixHareketTipi}
              availableSlotNames={availableSlotNames}
              matrixLoading={matrixLoading}
              matrixLookup={matrixLookup}
              date={date}
              setDate={setDate}
              setViewMode={setViewMode}
              canApprove={canApprove}
              reloadMatrix={loadMatrix}
            />
          ) : (
          <>
          {/* Date navigator */}
          <div className="flex items-center gap-2 mb-4">
            <button onClick={() => setDate(d => addDays(d, -1))}
              className="text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm transition-colors">
              ‹
            </button>
            <div className="flex-1 flex items-center gap-2">
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-600 [color-scheme:dark]" />
              <span className="text-zinc-500 text-sm capitalize hidden sm:inline">{formatDateLabel(date)}</span>
            </div>
            <button onClick={() => setDate(todayStr())}
              className="text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs transition-colors whitespace-nowrap">
              Bugün
            </button>
            <button onClick={() => setDate(d => addDays(d, 1))}
              className="text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm transition-colors">
              ›
            </button>
          </div>

          {/* ── Grid: Güzergah bazlı hızlı onay ────────────────────────── */}
          {selectedCompanyId && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden mb-8">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 flex-wrap gap-3">
                <p className="text-zinc-400 text-xs font-medium">Her güzergahın kendi vardiyası vardır — çok vardiyalı güzergahlarda satırdaki listeden seçin</p>
                <p className="text-zinc-600 text-xs">Satıra sol tık: seç/kaldır · Sağ tık: araç değiştir</p>
              </div>

              {routesLoading ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 bg-zinc-800/60 rounded-lg animate-pulse" />)}
                </div>
              ) : routes.length === 0 ? (
                <div className="text-center py-10 text-zinc-600 text-sm">Bu firmaya bağlı güzergah yok</div>
              ) : (
                <div className="divide-y divide-zinc-800/80">
                  {routes.map(route => {
                    const slots: any[] = route.time_slots || [];
                    const noSlots = slots.length === 0;
                    const isAyri = route.arac_modu === "ayri";

                    const slotPicker = noSlots ? (
                      <span className="text-zinc-600 text-xs italic">vardiya tanımlanmadı</span>
                    ) : slots.length === 1 ? (
                      <span className="text-zinc-500 text-xs">{slots[0].ad}</span>
                    ) : (
                      <select
                        value={rowSlot[route.id] || ""}
                        onClick={e => e.stopPropagation()}
                        onChange={e => setRowSlot(prev => ({ ...prev, [route.id]: e.target.value }))}
                        className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs px-2 py-1 rounded-lg focus:outline-none focus:border-zinc-500"
                      >
                        {slots.map((s: any) => <option key={s.id} value={s.ad}>{s.ad}</option>)}
                      </select>
                    );

                    if (isAyri) {
                      return (
                        <div key={route.id}>
                          <div className="flex items-center gap-2 px-4 pt-2.5 pb-1">
                            <span className="text-white text-sm font-medium truncate">{route.name}</span>
                            {slotPicker}
                            <span className="text-[10px] px-1.5 py-0.5 rounded border bg-blue-950 border-blue-800 text-blue-300 shrink-0">Ayrı Araç</span>
                          </div>
                          {(["giris", "cikis"] as const).map(yon => {
                            const processed = isProcessed(route.id, yon);
                            const key = rowKey(route.id, yon);
                            const selected = selectedRouteIds.has(key);
                            const veh = effectiveVehicle(route, yon);
                            const override = overrides[key];
                            const openFreeEntryForRoute = () => {
                              setForm({ ...EMPTY_FORM, route_id: route.id, vehicle_id: veh?.vehicle_id || "" });
                              setSaveError(null);
                              setShowForm(true);
                            };
                            return (
                              <div
                                key={key}
                                onClick={() => noSlots ? openFreeEntryForRoute() : toggleRoute(route.id, yon)}
                                onContextMenu={e => openContextMenu(e, route.id, yon)}
                                title={noSlots ? "Bu güzergahta vardiya tanımlı değil — tıklayınca Serbest Kayıt açılır" : undefined}
                                className={`flex items-center gap-3 px-4 pl-8 py-2 select-none transition-colors cursor-pointer ${
                                  noSlots
                                    ? "hover:bg-amber-950/20"
                                    : processed
                                      ? "opacity-50 cursor-not-allowed bg-zinc-900"
                                      : selected
                                        ? "bg-indigo-950/50"
                                        : "hover:bg-zinc-800/40"
                                }`}
                              >
                                <div className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${
                                  selected ? "bg-indigo-500 border-indigo-500" : "border-zinc-700"
                                }`}>
                                  {selected && <span className="text-white text-[10px] leading-none">✓</span>}
                                </div>
                                <span className="text-zinc-400 text-xs w-12 shrink-0">{yon === "giris" ? "Giriş" : "Çıkış"}</span>
                                {veh ? (
                                  <span className={`font-mono text-xs px-1.5 py-0.5 rounded border ${
                                    override ? "bg-amber-950 border-amber-800 text-amber-300" : "bg-zinc-800 border-zinc-700 text-zinc-300"
                                  }`}>
                                    {veh.plate}{override ? (override.kalici ? " · kalıcı" : " · bugün") : ""}
                                  </span>
                                ) : (
                                  <span className="text-zinc-600 text-xs italic">araç atanmamış</span>
                                )}
                                {noSlots && (
                                  <span className="text-amber-500 text-[11px] ml-auto shrink-0">Serbest Kayıt açmak için tıkla →</span>
                                )}
                                {processed && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded border bg-emerald-950 border-emerald-800 text-emerald-300 shrink-0 ml-auto">
                                    İşlendi
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    }

                    const processed = isProcessed(route.id);
                    const selected = selectedRouteIds.has(route.id);
                    const veh = effectiveVehicle(route);
                    const override = overrides[route.id];
                    const openFreeEntryForRoute = () => {
                      setForm({ ...EMPTY_FORM, route_id: route.id, vehicle_id: veh?.vehicle_id || "" });
                      setSaveError(null);
                      setShowForm(true);
                    };
                    return (
                      <div
                        key={route.id}
                        onClick={() => noSlots ? openFreeEntryForRoute() : toggleRoute(route.id)}
                        onContextMenu={e => openContextMenu(e, route.id)}
                        title={noSlots ? "Bu güzergahta vardiya tanımlı değil — tıklayınca Serbest Kayıt açılır" : undefined}
                        className={`flex items-center gap-3 px-4 py-2.5 select-none transition-colors cursor-pointer ${
                          noSlots
                            ? "hover:bg-amber-950/20"
                            : processed
                              ? "opacity-50 cursor-not-allowed bg-zinc-900"
                              : selected
                                ? "bg-indigo-950/50"
                                : "hover:bg-zinc-800/40"
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${
                          selected ? "bg-indigo-500 border-indigo-500" : "border-zinc-700"
                        }`}>
                          {selected && <span className="text-white text-[10px] leading-none">✓</span>}
                        </div>
                        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                          <span className="text-white text-sm font-medium truncate">{route.name}</span>
                          {slotPicker}
                          {veh ? (
                            <span className={`font-mono text-xs px-1.5 py-0.5 rounded border ${
                              override ? "bg-amber-950 border-amber-800 text-amber-300" : "bg-zinc-800 border-zinc-700 text-zinc-300"
                            }`}>
                              {veh.plate}{override ? (override.kalici ? " · kalıcı" : " · bugün") : ""}
                            </span>
                          ) : (
                            <span className="text-zinc-600 text-xs italic">araç atanmamış</span>
                          )}
                          {noSlots && (
                            <span className="text-amber-500 text-[11px] ml-auto shrink-0">Serbest Kayıt açmak için tıkla →</span>
                          )}
                        </div>
                        {processed && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-emerald-950 border-emerald-800 text-emerald-300 shrink-0">
                            İşlendi
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {selectedRouteIds.size > 0 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800 bg-zinc-900/80">
                  <span className="text-zinc-400 text-sm">{selectedRouteIds.size} kayıt seçili</span>
                  <button onClick={() => setShowSummary(true)}
                    className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors">
                    Seçilenleri Onayla
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Durum filter */}
          <div className="flex gap-2 mb-6">
            {[
              { value: "", label: "Tümü" },
              { value: "bekliyor", label: "Bekliyor" },
              { value: "onaylandi", label: "Onaylı" },
              { value: "iptal", label: "İptal" },
            ].map(f => (
              <button key={f.value} onClick={() => setDurumFilter(f.value)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  durumFilter === f.value
                    ? "bg-zinc-700 border-zinc-600 text-white"
                    : "border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-600"
                }`}>
                {f.label}
              </button>
            ))}
          </div>

          {/* List */}
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-16 animate-pulse" />
              ))}
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="text-center py-16 text-zinc-600">Bu tarih için çetele kaydı yok</div>
          ) : (
            <div className="space-y-2">
              {visibleRows.map(row => {
                const badge = DURUM_BADGE[row.durum] || DURUM_BADGE.bekliyor;
                return (
                  <div key={row.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-mono font-semibold text-sm">{row.plate}</span>
                        <span className="text-zinc-500 text-xs">{hareketTipiLabel(row.hareket_tipi)}</span>
                        {row.route_name && <span className="text-zinc-600 text-xs">· {row.route_name}</span>}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${badge.cls}`}>{badge.label}</span>
                      </div>
                      <p className="text-zinc-600 text-xs mt-0.5">
                        {row.yolcu_sayisi ? `${row.yolcu_sayisi} yolcu · ` : ""}
                        {row.onaylayan_name ? `${row.onaylayan_name} onayladı` : "Onay bekliyor"}
                        {row.aciklama ? ` · ${row.aciklama}` : ""}
                      </p>
                    </div>
                    {canApprove && row.durum === "bekliyor" && (
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => onayla(row.id)}
                          className="text-xs px-3 py-1.5 rounded-lg border border-emerald-800 bg-emerald-950 text-emerald-300 hover:bg-emerald-900 transition-colors">
                          Onayla
                        </button>
                        <button onClick={() => iptalEt(row.id)}
                          className="text-xs px-3 py-1.5 rounded-lg border border-red-800 bg-red-950 text-red-300 hover:bg-red-900 transition-colors">
                          İptal
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          </>
          )}
        </div>
      </div>

      {/* Sağ tık context menu */}
      {contextMenu && (
        <div ref={contextMenuRef} style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-[60] bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden w-56">
          <button onClick={() => openSwap("gecici")}
            className="w-full text-left px-4 py-2.5 text-sm text-zinc-200 hover:bg-zinc-800 transition-colors">
            Aracı Değiştir (bugün için)
          </button>
          <button onClick={() => openSwap("kalici")}
            className="w-full text-left px-4 py-2.5 text-sm text-zinc-200 hover:bg-zinc-800 transition-colors border-t border-zinc-800">
            Aracı Kalıcı Değiştir
          </button>
        </div>
      )}

      {/* Araç atama/değiştirme modalı */}
      {swapModal && (() => {
        const swapRoute = routes.find((r: any) => r.id === swapModal.routeId);
        const hasExisting = swapRoute && !!effectiveVehicle(swapRoute, swapModal.yon);
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSwapModal(null)} />
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm mx-4 space-y-4">
            <h3 className="text-white font-semibold">
              {!hasExisting ? "Araç Ata" : swapModal.mode === "kalici" ? "Aracı Kalıcı Değiştir" : "Aracı Bugün İçin Değiştir"}
            </h3>
            {!hasExisting && (
              <p className="text-zinc-500 text-xs">
                Bu güzergaha henüz araç atanmamış. Tek seferlik mi (yalnızca bu kayıt için) yoksa kalıcı olarak mı (güzergahın varsayılan aracı) atamak istediğinizi seçin.
              </p>
            )}
            <div className="flex gap-1 bg-zinc-800 border border-zinc-700 rounded-lg p-1">
              {([["gecici", "Tek Seferlik"], ["kalici", "Kalıcı"]] as const).map(([m, label]) => (
                <button key={m} onClick={() => setSwapModal(s => s && { ...s, mode: m })}
                  className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${
                    swapModal.mode === m ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
            <p className="text-zinc-500 text-xs">
              {swapModal.mode === "kalici"
                ? "Bu değişiklik güzergahın atanmış aracını kalıcı olarak günceller. Onayladığınızda uygulanır."
                : "Bu değişiklik sadece bugünkü kayıt için geçerli olur, güzergahın atanmış aracını değiştirmez."}
            </p>
            <label className="block">
              <span className="text-zinc-400 text-xs font-medium mb-1 block">{hasExisting ? "Yeni Araç" : "Araç"}</span>
              <ComboboxSearch
                options={filteredVehicles.map(v => ({ value: v.id, label: `${v.plate} — ${v.brand} ${v.model}` }))}
                value={swapVehicleId}
                onChange={setSwapVehicleId}
                placeholder="Araç seç..."
                emptyLabel="— Araç Yok —"
              />
            </label>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setSwapModal(null)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm py-2.5 rounded-xl">İptal</button>
              <button onClick={applySwap} disabled={!swapVehicleId}
                className="flex-1 bg-white text-zinc-950 font-semibold text-sm py-2.5 rounded-xl disabled:opacity-50">
                Uygula
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Toplu onay özet modalı — 2. onay adımı */}
      {showSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => !bulkSaving && setShowSummary(false)} />
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md mx-4 space-y-4">
            <h3 className="text-white font-semibold">Onay Özeti</h3>
            <p className="text-zinc-500 text-sm">
              {formatDateLabel(date)} · {selectedEntries2.length} kayıt
            </p>
            <div className="max-h-64 overflow-y-auto space-y-1.5 border border-zinc-800 rounded-xl p-2">
              {selectedEntries2.map(e => {
                const veh = effectiveVehicle(e.route, e.yon)!;
                return (
                  <div key={e.key} className="flex items-center justify-between text-sm px-2 py-1.5 rounded-lg bg-zinc-800/50">
                    <span className="text-zinc-200 truncate">{e.route.name}{e.yon ? ` · ${e.yon === "giris" ? "Giriş" : "Çıkış"}` : ""}</span>
                    <span className="text-zinc-500 text-xs shrink-0 ml-2">{rowSlot[e.route.id]}</span>
                    <span className={`font-mono text-xs px-1.5 py-0.5 rounded border shrink-0 ml-2 ${
                      overrides[e.key] ? "bg-amber-950 border-amber-800 text-amber-300" : "bg-zinc-800 border-zinc-700 text-zinc-400"
                    }`}>
                      {veh.plate}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-zinc-600 text-xs">Onayladığınızda bu kayıtlar doğrudan "Onaylandı" durumunda işlenir ve geri alınamaz (sadece iptal edilebilir).</p>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowSummary(false)} disabled={bulkSaving}
                className="flex-1 bg-zinc-800 text-zinc-300 text-sm py-2.5 rounded-xl disabled:opacity-50">
                Vazgeç
              </button>
              <button onClick={submitBulk} disabled={bulkSaving}
                className="flex-1 bg-emerald-600 text-white font-semibold text-sm py-2.5 rounded-xl hover:bg-emerald-500 disabled:opacity-50 transition-colors">
                {bulkSaving ? "İşleniyor..." : "Onayla ve İşle"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slide-over form — serbest kayıt (güzergaha bağlı olmayan) */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/60" onClick={() => setShowForm(false)} />
          <div className="w-full max-w-md bg-zinc-900 border-l border-zinc-800 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
              <h2 className="text-white font-semibold">Serbest Kayıt — {formatDateLabel(date)}</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {saveError && (
                <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">{saveError}</div>
              )}

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Araç *</span>
                <ComboboxSearch
                  options={filteredVehicles.map(v => ({ value: v.id, label: `${v.plate} — ${v.brand} ${v.model}` }))}
                  value={form.vehicle_id}
                  onChange={v => setForm(f => ({ ...f, vehicle_id: v }))}
                  placeholder="Araç seç..."
                  emptyLabel="— Araç Yok —"
                />
              </label>

              {routes.length > 0 && (
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Güzergah</span>
                  <ComboboxSearch
                    options={routes.map((r: any) => ({ value: r.id, label: r.name }))}
                    value={form.route_id}
                    onChange={v => setForm(f => ({ ...f, route_id: v, hareket_tipi: "" }))}
                    placeholder="Güzergah seç..."
                    emptyLabel="— Güzergah Yok (serbest) —"
                  />
                </label>
              )}

              {(() => {
                const selectedRoute = routes.find((r: any) => r.id === form.route_id);
                const slots: any[] = selectedRoute?.time_slots || [];
                if (form.route_id && slots.length > 0) {
                  return (
                    <label className="block">
                      <span className="text-zinc-400 text-xs font-medium mb-1 block">Vardiya *</span>
                      <select value={form.hareket_tipi} onChange={e => setForm(f => ({ ...f, hareket_tipi: e.target.value }))}
                        className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                        <option value="">— Seçin —</option>
                        {slots.map((s: any) => <option key={s.id} value={s.ad}>{s.ad}</option>)}
                      </select>
                    </label>
                  );
                }
                return (
                  <label className="block">
                    <span className="text-zinc-400 text-xs font-medium mb-1 block">Hareket / Vardiya Adı *</span>
                    <input value={form.hareket_tipi} onChange={e => setForm(f => ({ ...f, hareket_tipi: e.target.value }))}
                      placeholder="örn. Ring, Ek Araç, Mesai"
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                    {form.route_id && (
                      <p className="text-zinc-600 text-[11px] mt-1">Bu güzergahta vardiya tanımlanmadı — serbest metin girebilir veya güzergah ayarlarından vardiya ekleyebilirsiniz.</p>
                    )}
                  </label>
                );
              })()}

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Yolcu Sayısı</span>
                <input type="number" min="0" value={form.yolcu_sayisi} onChange={e => setForm(f => ({ ...f, yolcu_sayisi: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
              </label>

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Açıklama</span>
                <textarea value={form.aciklama} onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))} rows={2}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </label>
            </div>

            <div className="px-5 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={() => setShowForm(false)}
                className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors">
                İptal
              </button>
              <button onClick={save} disabled={saving || !form.vehicle_id || !form.hareket_tipi.trim()}
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

// ─── Takvim (matrix) görünümü ────────────────────────────────────────────────

function CeteleTakvim({
  selectedCompanyId, routes, routesLoading,
  rangePreset, setRangePreset, customFrom, setCustomFrom, customTo, setCustomTo,
  rangeDates, matrixHareketTipi, setMatrixHareketTipi, availableSlotNames, matrixLoading, matrixLookup,
  date, setDate, setViewMode, canApprove, reloadMatrix,
}: {
  selectedCompanyId: string;
  routes: any[];
  routesLoading: boolean;
  rangePreset: RangePreset;
  setRangePreset: (p: RangePreset) => void;
  customFrom: string;
  setCustomFrom: (v: string) => void;
  customTo: string;
  setCustomTo: (v: string) => void;
  rangeDates: string[];
  matrixHareketTipi: string;
  setMatrixHareketTipi: (v: string) => void;
  availableSlotNames: string[];
  matrixLoading: boolean;
  matrixLookup: Record<string, any>;
  date: string;
  setDate: (v: string) => void;
  setViewMode: (v: "gunluk" | "takvim") => void;
  canApprove: boolean;
  reloadMatrix: () => Promise<void> | void;
}) {
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [showMatrixSummary, setShowMatrixSummary] = useState(false);
  const [matrixBulkSaving, setMatrixBulkSaving] = useState(false);
  const vardiyaInputRef = useRef<HTMLInputElement>(null);

  const rangeKey = rangeDates.length ? `${rangeDates[0]}_${rangeDates[rangeDates.length - 1]}` : "";
  useEffect(() => { setSelectedCells(new Set()); }, [matrixHareketTipi, rangeKey, selectedCompanyId]);

  function goToDay(dateStr: string) {
    setDate(dateStr);
    setViewMode("gunluk");
  }

  // Hücre seçilebilir değilse nedenini ayırt eder: araç yoksa gerçekten Günlük'e
  // gitmek gerekir (Serbest Kayıt), ama sadece vardiya girilmediyse kullanıcıyı
  // sayfadan atmak yerine vardiya kutusuna yönlendiririz.
  function handleDeadEndClick(dateStr: string, hasVehicle: boolean) {
    if (hasVehicle && !matrixHareketTipi) {
      toast.error("Önce yukarıdaki Vardiya kutusuna bir isim yazın");
      vardiyaInputRef.current?.focus();
      return;
    }
    goToDay(dateStr);
  }

  function toggleCell(routeId: string, dateStr: string, hasVehicle: boolean, processed: boolean) {
    if (!canApprove) { toast.error("Çetele onaylama yetkiniz yok"); return; }
    if (processed) { toast.error("Bu kayıt zaten işlendi"); return; }
    if (!hasVehicle) { toast.error("Bu güzergaha atanmış araç yok"); return; }
    if (!matrixHareketTipi) { toast.error("Bu firmanın güzergahlarında vardiya tanımlı değil — takvimden toplu onay yapılamaz. Güzergahlar sayfasından vardiya ekleyin veya Günlük görünümden Serbest Kayıt kullanın."); return; }
    const key = `${routeId}__${dateStr}`;
    setSelectedCells(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const selectedEntries = Array.from(selectedCells).map(key => {
    const [routeId, d] = key.split("__");
    const route = routes.find(r => r.id === routeId);
    return { key, routeId, date: d, route, plate: route?.vehicle_plate, vehicleId: route?.vehicle_id };
  }).filter(e => e.route && e.vehicleId);

  async function submitMatrixBulk() {
    if (!matrixHareketTipi) {
      toast.error("Vardiya seçilmeden onay gönderilemez — güzergahlarda vardiya tanımlı değil.");
      return;
    }
    if (selectedEntries.length === 0) {
      toast.error("Seçili hücre kalmadı — araç ataması olmayan güzergahlar gönderilemez.");
      return;
    }
    setMatrixBulkSaving(true);
    try {
      const byDate = new Map<string, { route_id: string; vehicle_id: string; hareket_tipi: string }[]>();
      for (const e of selectedEntries) {
        if (!byDate.has(e.date)) byDate.set(e.date, []);
        byDate.get(e.date)!.push({ route_id: e.routeId, vehicle_id: e.vehicleId!, hareket_tipi: matrixHareketTipi });
      }
      let totalCreated = 0;
      let totalSkipped = 0;
      const skipReasons: string[] = [];
      const apiErrors: string[] = [];
      for (const [d, entries] of byDate) {
        const res = await fetch("/api/cetele/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tarih: d, entries }),
        });
        const data = await res.json();
        if (data.ok) {
          totalCreated += data.data.created;
          totalSkipped += data.data.skipped?.length || 0;
          for (const s of data.data.skipped || []) skipReasons.push(s.reason);
        } else {
          apiErrors.push(data.error || `Sunucu hatası (${res.status})`);
        }
      }
      if (apiErrors.length > 0) {
        toast.error(`Onaylanamadı: ${[...new Set(apiErrors)].join(", ")}`);
      } else if (totalCreated === 0) {
        toast.error(totalSkipped ? `Hiçbiri onaylanmadı — ${[...new Set(skipReasons)].join(", ")}` : "Hiçbir kayıt onaylanmadı");
      } else {
        toast.success(`${totalCreated} kayıt onaylandı${totalSkipped ? `, ${totalSkipped} zaten vardı` : ""}`);
      }
      setShowMatrixSummary(false);
      setSelectedCells(new Set());
      await reloadMatrix();
    } finally { setMatrixBulkSaving(false); }
  }

  if (!selectedCompanyId) return null;

  return (
    <div>
      {/* Aralık seçici */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {RANGE_PRESET_OPTS.map(o => (
          <button key={o.value} onClick={() => setRangePreset(o.value)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              rangePreset === o.value
                ? "bg-zinc-700 border-zinc-600 text-white"
                : "border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-600"
            }`}>
            {o.label}
          </button>
        ))}
        {rangePreset === "ozel" && (
          <div className="flex items-center gap-2 ml-1">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 text-white text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-zinc-600 [color-scheme:dark]" />
            <span className="text-zinc-600 text-xs">—</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 text-white text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-zinc-600 [color-scheme:dark]" />
          </div>
        )}
      </div>

      {/* Vardiya sekmeleri — güzergahların kendi tanımladığı vardiya adlarının birleşimi */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-zinc-400 text-xs font-medium">Vardiya:</span>
        {availableSlotNames.length === 0 ? (
          <>
            <input
              ref={vardiyaInputRef}
              value={matrixHareketTipi}
              onChange={e => setMatrixHareketTipi(e.target.value)}
              placeholder="örn. Sabah, Ring, Mesai — yazınca hücreler işlenebilir olur"
              className="bg-zinc-900 border border-zinc-800 text-white text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-amber-500 w-72"
            />
            <span className="text-zinc-600 text-xs">Bu firmanın güzergahlarında tanımlı vardiya yok — burada geçici bir isim girebilirsiniz veya Güzergahlar sayfasından kalıcı ekleyin.</span>
          </>
        ) : availableSlotNames.map(name => (
          <button key={name} onClick={() => setMatrixHareketTipi(name)}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
              matrixHareketTipi === name
                ? "bg-zinc-700 border-zinc-600 text-white"
                : "border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-600"
            }`}>
            {name}
          </button>
        ))}
      </div>

      {/* Matrix tablo */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        {routesLoading || matrixLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 bg-zinc-800/60 rounded-lg animate-pulse" />)}
          </div>
        ) : routes.length === 0 ? (
          <div className="text-center py-10 text-zinc-600 text-sm">Bu firmaya bağlı güzergah yok</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="sticky left-0 bg-zinc-900 text-left text-zinc-400 text-xs font-medium px-4 py-2.5 min-w-[180px] z-10">
                    Güzergah
                  </th>
                  {rangeDates.map(d => (
                    <th key={d} className="text-center text-zinc-400 text-xs font-medium px-2 py-2.5 min-w-[86px]">
                      <div>{formatWeekdayShort(d)}</div>
                      <div className="text-zinc-600">{formatDateShort(d)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {routes.map(route => (
                  <tr key={route.id} className="border-b border-zinc-800/60 hover:bg-zinc-800/20">
                    <td className="sticky left-0 bg-zinc-900 text-white text-sm px-4 py-2 truncate max-w-[180px]">
                      {route.name}
                    </td>
                    {rangeDates.map(d => {
                      const record = matrixLookup[`${route.id}__${d}`];
                      const plate = record?.plate || route.vehicle_plate;
                      const durum = record?.durum;
                      const processed = !!record;
                      const hasVehicle = !!route.vehicle_id;
                      const key = `${route.id}__${d}`;
                      const selected = selectedCells.has(key);
                      const selectable = canApprove && !processed && hasVehicle && !!matrixHareketTipi;
                      return (
                        <td key={d}
                          onClick={() => { if (selectable) toggleCell(route.id, d, hasVehicle, processed); else if (!processed) handleDeadEndClick(d, hasVehicle); }}
                          title={
                            durum ? DURUM_BADGE[durum]?.label
                            : selectable ? "Tıkla: seç/kaldır"
                            : hasVehicle && !matrixHareketTipi ? "Önce Vardiya kutusuna bir isim yazın"
                            : "Günlük görünümde işlemek için tıkla"
                          }
                          className={`text-center px-2 py-2 ${processed && !selectable ? "cursor-default" : "cursor-pointer"} ${selected ? "bg-indigo-950/60" : ""}`}
                        >
                          {plate ? (
                            <span className={`inline-flex items-center gap-1 font-mono text-xs px-1.5 py-0.5 rounded border ${
                              selected ? "bg-indigo-900 border-indigo-600 text-indigo-100"
                              : durum === "onaylandi" ? "bg-emerald-950 border-emerald-800 text-emerald-300"
                              : durum === "bekliyor" ? "bg-amber-950 border-amber-800 text-amber-300"
                              : durum === "iptal" ? "bg-zinc-800 border-zinc-700 text-zinc-600 line-through"
                              : "bg-zinc-800/60 border-zinc-800 text-zinc-500"
                            }`}>
                              {selected && "✓ "}{plate}
                            </span>
                          ) : (
                            <span className="text-zinc-700 text-xs">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
        <div className="flex items-center gap-4 text-xs text-zinc-600">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-emerald-900 border border-emerald-800 inline-block" /> Onaylandı</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-amber-900 border border-amber-800 inline-block" /> Bekliyor</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-zinc-800/60 border border-zinc-800 inline-block" /> Planlı (işlenmedi)</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-zinc-800 border border-zinc-700 inline-block" /> İptal</span>
        </div>
        {canApprove && selectedCells.size > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-zinc-400 text-xs">{selectedCells.size} hücre seçili</span>
            <button onClick={() => setShowMatrixSummary(true)}
              className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors">
              Seçilenleri Onayla
            </button>
          </div>
        )}
      </div>

      {/* Takvimden toplu onay — özet modalı */}
      {showMatrixSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => !matrixBulkSaving && setShowMatrixSummary(false)} />
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md mx-4 space-y-4">
            <h3 className="text-white font-semibold">Onay Özeti</h3>
            <p className="text-zinc-500 text-sm">{matrixHareketTipi} · {selectedEntries.length} kayıt</p>
            <div className="max-h-64 overflow-y-auto space-y-1.5 border border-zinc-800 rounded-xl p-2">
              {selectedEntries.map(e => (
                <div key={e.key} className="flex items-center justify-between text-sm px-2 py-1.5 rounded-lg bg-zinc-800/50">
                  <span className="text-zinc-200 truncate">{e.route.name}</span>
                  <span className="text-zinc-500 text-xs shrink-0 mx-2">{formatDateShort(e.date)}</span>
                  <span className="font-mono text-xs px-1.5 py-0.5 rounded border bg-zinc-800 border-zinc-700 text-zinc-400 shrink-0">
                    {e.plate}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-zinc-600 text-xs">Onayladığınızda bu kayıtlar doğrudan "Onaylandı" durumunda işlenir ve geri alınamaz (sadece iptal edilebilir).</p>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowMatrixSummary(false)} disabled={matrixBulkSaving}
                className="flex-1 bg-zinc-800 text-zinc-300 text-sm py-2.5 rounded-xl disabled:opacity-50">
                Vazgeç
              </button>
              <button onClick={submitMatrixBulk} disabled={matrixBulkSaving}
                className="flex-1 bg-emerald-600 text-white font-semibold text-sm py-2.5 rounded-xl hover:bg-emerald-500 disabled:opacity-50 transition-colors">
                {matrixBulkSaving ? "İşleniyor..." : "Onayla ve İşle"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
