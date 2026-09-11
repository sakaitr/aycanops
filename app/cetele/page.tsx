"use client";
import { useState, useEffect, useRef, Fragment } from "react";
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

const EMPTY_FORM = { vehicle_id: "", route_id: "", hareket_tipi: "", yon: "" as "" | "giris" | "cikis", yolcu_sayisi: "", aciklama: "" };

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
  const routesRequestIdRef = useRef(0);
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

  // Takvim (matrix) görünümü — varsayılan görünüm, çetele girişinin ana ekranı
  const [viewMode, setViewMode] = useState<"gunluk" | "takvim">("takvim");
  const [rangePreset, setRangePreset] = useState<RangePreset>("son1hafta");
  const [customFrom, setCustomFrom] = useState(addDays(todayStr(), -6));
  const [customTo, setCustomTo] = useState(todayStr());
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
    // Firma context'i (localStorage'dan) mount sonrası asenkron doluyor — ilk render'da
    // selectedCompanyId boş gelip bu efekt "tüm firmalar" için ateşlenebilir, hemen
    // ardından gerçek firma id'siyle tekrar ateşlenir. İki istek yarışırsa ve boş/geniş
    // olan geç dönerse doğru (dar) sonucu ezer — bu yüzden sadece EN SON tetiklenen
    // isteğin cevabı uygulanır, öncekiler sessizce atlanır.
    const myRequestId = ++routesRequestIdRef.current;
    setRoutesLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCompanyId) params.set("company_id", selectedCompanyId);
      const r = await fetch(`/api/routes?${params}`);
      const d = await r.json();
      if (!d.ok) return;
      if (myRequestId !== routesRequestIdRef.current) return;
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
    } finally { if (myRequestId === routesRequestIdRef.current) setRoutesLoading(false); }
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
      params.set("company_id", selectedCompanyId);
      params.set("limit", "3000");
      const r = await fetch(`/api/cetele?${params}`);
      const d = await r.json();
      if (d.ok) setMatrixRows(d.data);
    } finally { setMatrixLoading(false); }
  }

  useEffect(() => {
    if (viewMode !== "takvim") return;
    loadMatrix();
  }, [viewMode, selectedCompanyId, rangeFrom, rangeTo]);

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

  // Bugün, her güzergahın kendi seçili vardiyası (+ yön) için işlenmiş mi (iptal hariç).
  // Vardiya tanımlı olmayan güzergahlarda rowSlot hiç dolmaz (loadRoutes sadece
  // time_slots varsa dolduruyor) — önceden bu durumda hep "işlenmedi" dönüyordu,
  // yani Takvim'den veya Serbest Kayıt'tan gerçekten onaylanmış bir kayıt olsa
  // bile Günlük ızgarası hiç değişmiş görünmüyordu. Vardiya yoksa hareket_tipi
  // zaten serbest metin, o yüzden sadece rota+yön'e göre eşleştir.
  function isProcessed(routeId: string, yon: "giris" | "cikis" | null = null): boolean {
    const slot = rowSlot[routeId];
    if (!slot) {
      return rows.some(r => r.route_id === routeId && (r.yon || null) === yon && r.durum !== "iptal");
    }
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

  // Takvim: route_id + tarih (YYYY-MM-DD) → { giris, cikis } çetele kaydı.
  // Eski (yön ayrımından önceki) kayıtların yon'u NULL — bunlar tüm günü
  // temsil ettiğinden her iki yöne de "işlendi" sayılır, aksi halde eski
  // veri Takvim'de yarım işlenmiş gibi görünür.
  // "__*" (joker) anahtarı, o rota+günün TÜM hareket_tipi değerlerini birleştirir —
  // vardiyasız rotalarda geçmiş serbest metin kayıtları (örn. eski "gebze" gibi)
  // yeni sabit "Genel" etiketiyle tam eşleşmeyebilir, joker olmadan Takvim'in
  // daraltılmış satırı bu eski kayıtları hiç görmez.
  const matrixLookup: Record<string, { giris?: any; cikis?: any }> = {};
  for (const r of matrixRows) {
    if (!r.route_id) continue;
    const d = toLocalDateStr(r.tarih);
    for (const key of [`${r.route_id}__${d}__${r.hareket_tipi}`, `${r.route_id}__${d}__*`]) {
      if (!matrixLookup[key]) matrixLookup[key] = {};
      if (r.yon === "giris") matrixLookup[key].giris = r;
      else if (r.yon === "cikis") matrixLookup[key].cikis = r;
      else { matrixLookup[key].giris = r; matrixLookup[key].cikis = r; }
    }
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
              vehicles={filteredVehicles}
              rangePreset={rangePreset}
              setRangePreset={setRangePreset}
              customFrom={customFrom}
              setCustomFrom={setCustomFrom}
              customTo={customTo}
              setCustomTo={setCustomTo}
              rangeDates={rangeDates}
              matrixLoading={matrixLoading}
              matrixLookup={matrixLookup}
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

                    return (
                      <div key={route.id}>
                        <div className="flex items-center gap-2 px-4 pt-2.5 pb-1">
                          <span className="text-white text-sm font-medium truncate">{route.name}</span>
                          {slotPicker}
                          {isAyri && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded border bg-blue-950 border-blue-800 text-blue-300 shrink-0" title="Giriş ve çıkış için farklı araç atanabilir">Ayrı Araç</span>
                          )}
                        </div>
                        {(["giris", "cikis"] as const).map(yon => {
                            const processed = isProcessed(route.id, yon);
                            const key = rowKey(route.id, yon);
                            const selected = selectedRouteIds.has(key);
                            const veh = effectiveVehicle(route, yon);
                            const override = overrides[key];
                            const openFreeEntryForRoute = () => {
                              setForm({ ...EMPTY_FORM, route_id: route.id, vehicle_id: veh?.vehicle_id || "", yon });
                              setSaveError(null);
                              setShowForm(true);
                            };
                            return (
                              <div
                                key={key}
                                onClick={() => noSlots ? openFreeEntryForRoute() : toggleRoute(route.id, yon)}
                                onContextMenu={e => openContextMenu(e, route.id, yon)}
                                title={noSlots ? (processed ? "Bugün için kayıt var — tıklayınca ek kayıt açılır" : "Bu güzergahta vardiya tanımlı değil — tıklayınca Serbest Kayıt açılır") : undefined}
                                className={`flex items-center gap-3 px-4 pl-8 py-2 select-none transition-colors cursor-pointer ${
                                  noSlots
                                    ? processed ? "bg-emerald-950/20 hover:bg-emerald-950/30" : "hover:bg-amber-950/20"
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
                                {processed && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded border bg-emerald-950 border-emerald-800 text-emerald-300 shrink-0 ml-auto">
                                    İşlendi
                                  </span>
                                )}
                                {noSlots && (
                                  <span className="text-amber-500 text-[11px] shrink-0">
                                    {processed ? "+ ek kayıt" : "Serbest Kayıt açmak için tıkla →"}
                                  </span>
                                )}
                              </div>
                            );
                          })}
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
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Yön</span>
                <select value={form.yon} onChange={e => setForm(f => ({ ...f, yon: e.target.value as "" | "giris" | "cikis" }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                  <option value="">— Belirtilmedi —</option>
                  <option value="giris">Giriş</option>
                  <option value="cikis">Çıkış</option>
                </select>
              </label>

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

// Bir satırın hangi tek'i temsil ettiğini belirler: vardiya tanımlıysa ilk
// (varsayılan) vardiya, tanımlı değilse sabit "Genel" — route_supplier_prices'ta
// hareket_tipi=NULL (genel fiyat) her ikisiyle de eşleşir, bu yüzden fiyatlandırma
// bozulmaz.
function defaultHareketTipi(route: any): string {
  const slots = route.time_slots || [];
  return slots.length > 0 ? slots[0].ad : "Genel";
}

interface MatrixOverride { vehicle_id: string; plate: string; kalici: boolean }
type CellYon = "giris" | "cikis" | "both";
const YON_LABEL: Record<"giris" | "cikis", string> = { giris: "Giriş", cikis: "Çıkış" };

function CeteleTakvim({
  selectedCompanyId, routes, routesLoading, vehicles,
  rangePreset, setRangePreset, customFrom, setCustomFrom, customTo, setCustomTo,
  rangeDates, matrixLoading, matrixLookup,
  canApprove, reloadMatrix,
}: {
  selectedCompanyId: string;
  routes: any[];
  routesLoading: boolean;
  vehicles: any[];
  rangePreset: RangePreset;
  setRangePreset: (p: RangePreset) => void;
  customFrom: string;
  setCustomFrom: (v: string) => void;
  customTo: string;
  setCustomTo: (v: string) => void;
  rangeDates: string[];
  matrixLoading: boolean;
  matrixLookup: Record<string, { giris?: any; cikis?: any }>;
  canApprove: boolean;
  reloadMatrix: () => Promise<void> | void;
}) {
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [showMatrixSummary, setShowMatrixSummary] = useState(false);
  const [matrixBulkSaving, setMatrixBulkSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [expandedRoutes, setExpandedRoutes] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, MatrixOverride>>({});
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; routeId: string; date: string; hareketTipi: string; yon: CellYon; recordIds: string[] } | null>(null);
  const [swapModal, setSwapModal] = useState<{ routeId: string; date: string; hareketTipi: string; yon: CellYon; mode: "gecici" | "kalici" } | null>(null);
  const [swapVehicleId, setSwapVehicleId] = useState("");
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const rangeKey = rangeDates.length ? `${rangeDates[0]}_${rangeDates[rangeDates.length - 1]}` : "";
  useEffect(() => { setSelectedCells(new Set()); setOverrides({}); }, [rangeKey, selectedCompanyId]);

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

  function toggleExpanded(routeId: string) {
    setExpandedRoutes(prev => {
      const next = new Set(prev);
      if (next.has(routeId)) next.delete(routeId); else next.add(routeId);
      return next;
    });
  }

  function cellKey(routeId: string, dateStr: string, hareketTipi: string, yon: CellYon) {
    return `${routeId}__${dateStr}__${hareketTipi}__${yon}`;
  }

  function effectiveVehicle(route: any, key: string): { vehicle_id: string; plate: string; kalici: boolean } | null {
    const override = overrides[key];
    if (override) return override;
    if (route.vehicle_id) return { vehicle_id: route.vehicle_id, plate: route.vehicle_plate, kalici: false };
    return null;
  }

  function openAssign(routeId: string, dateStr: string, hareketTipi: string, yon: CellYon, mode: "gecici" | "kalici") {
    setSwapModal({ routeId, date: dateStr, hareketTipi, yon, mode });
    setSwapVehicleId("");
  }

  // Kayıt varsa (recordIds dolu) İptal Et, yoksa araç değiştirme seçenekleri. Hem sağ
  // tıktan hem de hücredeki "⋮" butonundan (sol tık, trackpad'de sağ tık her zaman
  // çalışmayabiliyor) açılabilir — ikisi de aynı menüyü açar.
  function openContextMenu(e: React.MouseEvent, routeId: string, dateStr: string, hareketTipi: string, yon: CellYon, recordIds: string[]) {
    e.preventDefault();
    e.stopPropagation();
    if (!canApprove) return;
    setContextMenu({ x: e.clientX, y: e.clientY, routeId, date: dateStr, hareketTipi, yon, recordIds });
  }

  // Araç değiştir artık işlenmiş hücrede de çalışır: önce mevcut kaydı (varsa)
  // sessizce iptal eder, sonra yeni aracı seçmesi için atama modalını açar —
  // önceden önce ayrı "İptal Et" sonra tekrar tıklayıp atama gerekiyordu.
  async function openSwapFromMenu(mode: "gecici" | "kalici") {
    if (!contextMenu) return;
    const { routeId, date, hareketTipi, yon, recordIds } = contextMenu;
    setContextMenu(null);
    if (recordIds.length > 0) {
      setCancelling(true);
      try {
        for (const id of recordIds) {
          await fetch(`/api/cetele/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "iptal", geri_alma_nedeni: "Araç değiştirildi" }),
          });
        }
        await reloadMatrix();
      } finally { setCancelling(false); }
    }
    openAssign(routeId, date, hareketTipi, yon, mode);
  }

  async function cancelFromMenu() {
    if (!contextMenu || contextMenu.recordIds.length === 0) return;
    const reason = window.prompt("İptal nedeni (opsiyonel):");
    if (reason === null) { setContextMenu(null); return; }
    const ids = contextMenu.recordIds;
    setContextMenu(null);
    setCancelling(true);
    try {
      for (const id of ids) {
        await fetch(`/api/cetele/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "iptal", geri_alma_nedeni: reason || null }),
        });
      }
      toast.success("İptal edildi");
      await reloadMatrix();
    } finally { setCancelling(false); }
  }

  function applySwap() {
    if (!swapModal || !swapVehicleId) return;
    const veh = vehicles.find(v => v.id === swapVehicleId);
    if (!veh) return;
    const key = cellKey(swapModal.routeId, swapModal.date, swapModal.hareketTipi, swapModal.yon);
    setOverrides(prev => ({ ...prev, [key]: { vehicle_id: veh.id, plate: veh.plate, kalici: swapModal.mode === "kalici" } }));
    setSelectedCells(prev => new Set(prev).add(key));
    toast.success(swapModal.mode === "kalici" ? "Araç kalıcı değiştirildi (onaylandığında güzergaha işlenir)" : "Araç bugün için değiştirildi");
    setSwapModal(null);
    setSwapVehicleId("");
  }

  function toggleCell(route: any, dateStr: string, hareketTipi: string, yon: CellYon, processed: boolean) {
    if (!canApprove) { toast.error("Çetele onaylama yetkiniz yok"); return; }
    if (processed) { toast.error("Bu kayıt zaten işlendi — sağ tık ile iptal edebilirsiniz"); return; }
    const key = cellKey(route.id, dateStr, hareketTipi, yon);
    const veh = effectiveVehicle(route, key);
    if (!veh) { openAssign(route.id, dateStr, hareketTipi, yon, "kalici"); return; }
    setSelectedCells(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const selectedEntries = Array.from(selectedCells).map(key => {
    const [routeId, d, hareketTipi, yon] = key.split("__") as [string, string, string, CellYon];
    const route = routes.find(r => r.id === routeId);
    const veh = route ? effectiveVehicle(route, key) : null;
    return { key, routeId, date: d, hareketTipi, yon, route, plate: veh?.plate, vehicleId: veh?.vehicle_id, kalici: veh?.kalici || false };
  }).filter(e => e.route && e.vehicleId);

  async function submitMatrixBulk() {
    if (selectedEntries.length === 0) {
      toast.error("Seçili hücre kalmadı.");
      return;
    }
    setMatrixBulkSaving(true);
    try {
      const byDate = new Map<string, { route_id: string; vehicle_id: string; hareket_tipi: string; yon: "giris" | "cikis"; kalici_degisim?: boolean }[]>();
      for (const e of selectedEntries) {
        if (!byDate.has(e.date)) byDate.set(e.date, []);
        const list = byDate.get(e.date)!;
        if (e.yon === "both") {
          // Daraltılmış satır "bu gün normal işledi" demek — istisna (tek yön
          // gitmedi) varsa genişletip yön bazlı işlenmeli. Bu yüzden hücre
          // başına giriş+çıkış ikisi birden açılır.
          list.push({ route_id: e.routeId, vehicle_id: e.vehicleId!, hareket_tipi: e.hareketTipi, yon: "giris", kalici_degisim: e.kalici });
          list.push({ route_id: e.routeId, vehicle_id: e.vehicleId!, hareket_tipi: e.hareketTipi, yon: "cikis", kalici_degisim: e.kalici });
        } else {
          list.push({ route_id: e.routeId, vehicle_id: e.vehicleId!, hareket_tipi: e.hareketTipi, yon: e.yon, kalici_degisim: e.kalici });
        }
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
      const hadKalici = selectedEntries.some(e => e.kalici);
      setShowMatrixSummary(false);
      setSelectedCells(new Set());
      setOverrides({});
      await reloadMatrix();
      // Kalıcı araç değişimi güzergahın vehicle_id'sini sunucuda güncelledi — sayfa
      // yeniden yüklenmeden route listesi tazelenmezse eski araç görünmeye devam eder.
      if (hadKalici) window.location.reload();
    } finally { setMatrixBulkSaving(false); }
  }

  if (!selectedCompanyId) return null;

  return (
    <div>
      {/* Aralık seçici */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
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
                  <th className="sticky left-0 bg-zinc-900 text-left text-zinc-400 text-xs font-medium px-4 py-2.5 min-w-[200px] z-10">
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
                {routes.map(route => {
                  const slots: any[] = route.time_slots || [];
                  const isExpanded = expandedRoutes.has(route.id);
                  const vardiyaNames = slots.length > 0 ? slots.map((s: any) => s.ad) : [defaultHareketTipi(route)];
                  const rowDefs: { hareketTipi: string; yon: CellYon; label: string; indent: boolean }[] = isExpanded
                    ? vardiyaNames.flatMap((vt: string) => ([
                        { hareketTipi: vt, yon: "giris" as CellYon, label: slots.length > 0 ? `${vt} · Giriş` : "Giriş", indent: true },
                        { hareketTipi: vt, yon: "cikis" as CellYon, label: slots.length > 0 ? `${vt} · Çıkış` : "Çıkış", indent: true },
                      ]))
                    : [{ hareketTipi: defaultHareketTipi(route), yon: "both" as CellYon, label: route.name, indent: false }];

                  return (
                    <Fragment key={route.id}>
                      {isExpanded && (
                        <tr className="border-b border-zinc-800/40 bg-zinc-900/60">
                          <td colSpan={rangeDates.length + 1} className="sticky left-0 bg-zinc-900/60 px-4 py-1.5">
                            <button onClick={() => toggleExpanded(route.id)}
                              className="flex items-center gap-1.5 text-white text-sm font-medium hover:text-indigo-300 transition-colors">
                              <span className="text-zinc-500 text-xs">▾</span> {route.name}
                              {slots.length > 1 && <span className="text-zinc-600 text-xs font-normal">({slots.length} vardiya)</span>}
                            </button>
                          </td>
                        </tr>
                      )}
                      {rowDefs.map(rowDef => (
                        <tr key={`${rowDef.hareketTipi}__${rowDef.yon}`} className="border-b border-zinc-800/60 hover:bg-zinc-800/20">
                          <td className="sticky left-0 bg-zinc-900 text-sm px-4 py-2 truncate max-w-[200px]">
                            {rowDef.indent ? (
                              <span className="text-zinc-400 pl-4 block truncate">↳ {rowDef.label}</span>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="text-white truncate">{rowDef.label}</span>
                                <button onClick={() => toggleExpanded(route.id)}
                                  title="Giriş/Çıkış ve vardiyaları ayrı göster"
                                  className="text-zinc-500 hover:text-white text-[10px] px-1.5 py-0.5 rounded border border-zinc-700 shrink-0">
                                  {slots.length > 1 ? `${slots.length} vardiya` : "Giriş/Çıkış"}
                                </button>
                              </div>
                            )}
                          </td>
                          {rangeDates.map(d => {
                            const key = cellKey(route.id, d, rowDef.hareketTipi, rowDef.yon);
                            // Vardiyasız rotanın daraltılmış satırı joker anahtarla okur —
                            // geçmiş serbest metinli kayıtlar da (bkz. matrixLookup yorumu) görünsün.
                            // Vardiyasız rota her satırda (daraltılmış VEYA genişletilmiş Giriş/Çıkış)
                            // jokerden okur — sabit "Genel" etiketi eski serbest metin kayıtlarıyla
                            // (örn. "gebze") tam eşleşmez, tek gerçek vardiya bağlamı olmadığından.
                            const lookupKey = slots.length === 0 ? `${route.id}__${d}__*` : `${route.id}__${d}__${rowDef.hareketTipi}`;
                            const lookup = matrixLookup[lookupKey];
                            const girisRec = lookup?.giris;
                            const cikisRec = lookup?.cikis;
                            const girisDone = !!girisRec && girisRec.durum !== "iptal";
                            const cikisDone = !!cikisRec && cikisRec.durum !== "iptal";
                            const bothDone = girisDone && cikisDone;
                            const anyDone = girisDone || cikisDone;
                            const legRec = rowDef.yon === "giris" ? girisRec : rowDef.yon === "cikis" ? cikisRec : null;
                            const legDone = rowDef.yon === "giris" ? girisDone : rowDef.yon === "cikis" ? cikisDone : null;
                            const veh = effectiveVehicle(route, key);
                            const override = overrides[key];
                            const durum = rowDef.yon === "both" ? (girisRec || cikisRec)?.durum : legRec?.durum;
                            const plate = rowDef.yon === "both" ? (girisRec?.plate || cikisRec?.plate || veh?.plate) : (legRec?.plate || veh?.plate);
                            const processed = rowDef.yon === "both" ? bothDone : !!legDone;
                            const recordIds = (rowDef.yon === "both" ? [girisRec?.id, cikisRec?.id] : [legRec?.id]).filter(Boolean) as string[];
                            const selected = selectedCells.has(key);
                            const selectable = canApprove && !processed;
                            return (
                              <td key={d}
                                onClick={() => { if (selectable) toggleCell(route, d, rowDef.hareketTipi, rowDef.yon, processed); }}
                                onContextMenu={e => openContextMenu(e, route.id, d, rowDef.hareketTipi, rowDef.yon, recordIds)}
                                title={
                                  rowDef.yon === "both"
                                    ? (bothDone ? DURUM_BADGE[durum!]?.label
                                       : anyDone ? `Yarım işlendi — ${girisDone ? "çıkış" : "giriş"} eksik, tıkla tamamla`
                                       : veh ? "Tıkla: seç/kaldır · ⋮ / sağ tık: aksiyonlar" : "Araç atanmamış — tıkla ata")
                                    : (processed ? `${DURUM_BADGE[durum!]?.label} — ⋮ / sağ tık: iptal veya araç değiştir`
                                       : veh ? "Tıkla: seç/kaldır · ⋮ / sağ tık: aksiyonlar" : "Araç atanmamış — tıkla ata")
                                }
                                className={`relative group text-center px-2 py-2 ${processed ? "cursor-default" : "cursor-pointer"} ${selected ? "bg-indigo-950/60" : ""}`}
                              >
                                {plate ? (
                                  <span className={`inline-flex items-center gap-1 font-mono text-xs px-1.5 py-0.5 rounded border ${
                                    selected ? "bg-indigo-900 border-indigo-600 text-indigo-100"
                                    : durum === "onaylandi" && (rowDef.yon === "both" ? bothDone : legDone) ? "bg-emerald-950 border-emerald-800 text-emerald-300"
                                    : durum === "bekliyor" && (rowDef.yon === "both" ? bothDone : legDone) ? "bg-amber-950 border-amber-800 text-amber-300"
                                    : rowDef.yon === "both" && anyDone ? "bg-orange-950 border-orange-800 text-orange-300"
                                    : durum === "iptal" ? "bg-zinc-800 border-zinc-700 text-zinc-600 line-through"
                                    : override ? "bg-amber-950 border-amber-800 text-amber-300"
                                    : "bg-zinc-800/60 border-zinc-800 text-zinc-500"
                                  }`}>
                                    {selected && "✓ "}{plate}{rowDef.yon === "both" && anyDone && !bothDone ? " ½" : ""}{override && !processed ? (override.kalici ? " ·kalıcı" : " ·bugün") : ""}
                                  </span>
                                ) : (
                                  <span className="text-zinc-700 text-xs hover:text-zinc-500">+ araç</span>
                                )}
                                {/* Sağ tık her cihazda (özellikle trackpad'de) çalışmayabiliyor —
                                    aynı menüyü açan, her zaman görünür/tıklanabilir yedek buton. */}
                                {canApprove && (
                                  <button
                                    onClick={e => openContextMenu(e, route.id, d, rowDef.hareketTipi, rowDef.yon, recordIds)}
                                    title="Aksiyonlar"
                                    className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-700 rounded-bl opacity-40 hover:opacity-100 transition-opacity text-[10px] leading-none"
                                  >
                                    ⋮
                                  </button>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
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
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-orange-950 border border-orange-800 inline-block" /> Yarım</span>
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

      {/* Aksiyon menüsü: araç değiştirme her zaman var (kayıt varsa önce sessizce
          iptal edip yeniden atar), İptal Et sadece iptal edilecek kayıt varsa görünür */}
      {contextMenu && (
        <div ref={contextMenuRef} className="fixed z-50 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl py-1 min-w-[190px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button onClick={() => openSwapFromMenu("gecici")} disabled={cancelling}
            className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50">
            Tek seferlik araç değiştir
          </button>
          <button onClick={() => openSwapFromMenu("kalici")} disabled={cancelling}
            className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50">
            Kalıcı araç değiştir
          </button>
          {contextMenu.recordIds.length > 0 && (
            <>
              <div className="my-1 border-t border-zinc-800" />
              <button onClick={cancelFromMenu} disabled={cancelling}
                className="w-full text-left px-3 py-2 text-sm text-red-300 hover:bg-red-950/50 disabled:opacity-50">
                {cancelling ? "İşleniyor..." : "İptal Et"}
              </button>
            </>
          )}
        </div>
      )}

      {/* Araç değiştirme/atama modalı */}
      {swapModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSwapModal(null)} />
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm mx-4 space-y-4">
            <h3 className="text-white font-semibold">
              {swapModal.mode === "kalici" ? "Kalıcı araç değiştir" : "Bugün için araç değiştir"}
            </h3>
            <p className="text-zinc-500 text-xs">{formatDateShort(swapModal.date)} · {swapModal.hareketTipi}{swapModal.yon !== "both" ? ` · ${YON_LABEL[swapModal.yon]}` : ""}</p>
            <ComboboxSearch
              options={vehicles.map((v: any) => ({ value: v.id, label: `${v.plate} — ${v.brand} ${v.model}` }))}
              value={swapVehicleId}
              onChange={setSwapVehicleId}
              placeholder="Araç seç..."
              emptyLabel="— Araç Yok —"
            />
            <div className="flex gap-3 pt-1">
              <button onClick={() => setSwapModal(null)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm py-2.5 rounded-xl">
                Vazgeç
              </button>
              <button onClick={applySwap} disabled={!swapVehicleId}
                className="flex-1 bg-white text-zinc-950 font-semibold text-sm py-2.5 rounded-xl disabled:opacity-50">
                Uygula
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Takvimden toplu onay — özet modalı */}
      {showMatrixSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => !matrixBulkSaving && setShowMatrixSummary(false)} />
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md mx-4 space-y-4">
            <h3 className="text-white font-semibold">Onay Özeti</h3>
            <p className="text-zinc-500 text-sm">{selectedEntries.length} kayıt</p>
            <div className="max-h-64 overflow-y-auto space-y-1.5 border border-zinc-800 rounded-xl p-2">
              {selectedEntries.map(e => (
                <div key={e.key} className="flex items-center justify-between text-sm px-2 py-1.5 rounded-lg bg-zinc-800/50">
                  <span className="text-zinc-200 truncate">{e.route.name}<span className="text-zinc-500 text-xs"> · {e.hareketTipi}{e.yon !== "both" ? ` · ${YON_LABEL[e.yon as "giris" | "cikis"]}` : ""}</span></span>
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
