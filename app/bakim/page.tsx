"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import AppSelect from "@/components/AppSelect";
import ComboboxSearch from "@/components/ComboboxSearch";
import { hasPermission } from "@/lib/permissions";

const MAINTENANCE_TYPES: { value: string; label: string; color: string }[] = [
  { value: "oil_change",   label: "Yağ Değişimi",   color: "bg-amber-950 text-amber-400 border border-amber-800" },
  { value: "tire",         label: "Lastik",          color: "bg-blue-950 text-blue-400 border border-blue-800" },
  { value: "brake",        label: "Fren",            color: "bg-red-950 text-red-400 border border-red-800" },
  { value: "filter",       label: "Filtre",          color: "bg-purple-950 text-purple-400 border border-purple-800" },
  { value: "engine",       label: "Motor",           color: "bg-orange-950 text-orange-400 border border-orange-800" },
  { value: "electrical",   label: "Elektrik",        color: "bg-yellow-950 text-yellow-400 border border-yellow-800" },
  { value: "bodywork",     label: "Kaporta",         color: "bg-zinc-800 text-zinc-300 border border-zinc-700" },
  { value: "inspection",   label: "Periyodik Muayene", color: "bg-emerald-950 text-emerald-400 border border-emerald-800" },
  { value: "general",      label: "Genel Bakım",     color: "bg-zinc-800 text-zinc-400 border border-zinc-700" },
];

const TYPE_MAP = Object.fromEntries(MAINTENANCE_TYPES.map(t => [t.value, t]));

const EMPTY_FORM = {
  vehicle_id: "",
  plate: "",
  company_id: "",
  type: "oil_change",
  maintenance_date: new Date().toISOString().split("T")[0],
  km_at_service: "",
  next_service_km: "",
  next_service_date: "",
  cost: "",
  technician: "",
  notes: "",
  receipt_url: "",
};

function typeColor(type: string) {
  return TYPE_MAP[type]?.color ?? "bg-zinc-800 text-zinc-400";
}

function typeLabel(type: string) {
  return TYPE_MAP[type]?.label ?? type;
}

function isDueSoon(nextDate?: string | null, nextKm?: number | null, currentKm?: number | null) {
  if (!nextDate && !nextKm) return false;
  if (nextDate) {
    const d = new Date(nextDate);
    const diff = (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (diff < 0) return "overdue";
    if (diff <= 30) return "soon";
  }
  if (nextKm && currentKm && nextKm - currentKm <= 1000) return "soon";
  return false;
}

export default function BakimPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterVehicle, setFilterVehicle] = useState("");
  const [filterCompany, setFilterCompany] = useState("");
  const [filterType, setFilterType] = useState("");

  // Form modal
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [formCompanyFilter, setFormCompanyFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Expanded details
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data);
      else router.replace("/login");
    }).catch(() => router.replace("/login"));
    load();
    loadMeta();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/bakim");
      const d = await r.json();
      if (d.ok) setRecords(d.data);
    } finally { setLoading(false); }
  }

  async function loadMeta() {
    const [vr, cr] = await Promise.all([fetch("/api/vehicles?limit=9999"), fetch("/api/companies?limit=9999")]);
    const vd = await vr.json();
    const cd = await cr.json();
    if (vd.ok) setVehicles(vd.data);
    if (cd.ok) setCompanies(cd.data);
  }

  function openCreate() {
    setEditing(null);
    setFormCompanyFilter("");
    setForm({ ...EMPTY_FORM });
    setFormError("");
    setShowForm(true);
  }

  function openEdit(rec: any) {
    setEditing(rec);
    setFormCompanyFilter(rec.company_id || "");
    setForm({
      vehicle_id:       rec.vehicle_id       || "",
      plate:            rec.plate            || "",
      company_id:       rec.company_id       || "",
      type:             rec.type             || "general",
      maintenance_date: rec.maintenance_date || "",
      km_at_service:    rec.km_at_service    != null ? String(rec.km_at_service) : "",
      next_service_km:  rec.next_service_km  != null ? String(rec.next_service_km) : "",
      next_service_date: rec.next_service_date || "",
      cost:             rec.cost             != null ? String(rec.cost) : "",
      technician:       rec.technician       || "",
      notes:            rec.notes            || "",
      receipt_url:      rec.receipt_url      || "",
    });
    setFormError("");
    setShowForm(true);
  }

  function onVehicleChange(vehicleId: string) {
    const v = vehicles.find(v => v.id === vehicleId);
    const resolvedCompanyId = v?.company_id || formCompanyFilter || "";
    setForm(f => ({
      ...f,
      vehicle_id: vehicleId,
      plate: vehicleId && v?.plate ? v.plate : f.plate,
      company_id: vehicleId ? resolvedCompanyId : f.company_id,
    }));
  }

  async function save() {
    if (!form.vehicle_id)              return setFormError("Araç seçiniz.");
    if (!form.type)                    return setFormError("Bakım tipi seçiniz.");
    if (!form.maintenance_date.trim()) return setFormError("Tarih zorunludur.");
    const derivedPlate = vehicles.find(v => v.id === form.vehicle_id)?.plate || "";
    setSaving(true);
    setFormError("");
    try {
      const url     = editing ? `/api/bakim/${editing.id}` : "/api/bakim";
      const method  = editing ? "PUT"                      : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, plate: derivedPlate }),
      });
      const d = await res.json();
      if (d.ok) { setShowForm(false); load(); }
      else setFormError(d.error || "Kayıt başarısız.");
    } finally { setSaving(false); }
  }

  async function del(rec: any) {
    if (!confirm(`"${rec.plate}" için bu bakım kaydı silinsin mi?`)) return;
    await fetch(`/api/bakim/${rec.id}`, { method: "DELETE" });
    setExpanded(null);
    load();
  }

  const canEdit   = hasPermission(user, "maintenance:update");
  const canDelete = hasPermission(user, "maintenance:close");

  const filtered = useMemo(() => {
    return records.filter(r => {
      if (filterVehicle && r.vehicle_id !== filterVehicle) return false;
      if (filterCompany && r.company_id !== filterCompany) return false;
      if (filterType    && r.type       !== filterType)    return false;
      return true;
    });
  }, [records, filterVehicle, filterCompany, filterType]);

  // Stats
  const totalCost = filtered.reduce((s, r) => s + Number(r.cost || 0), 0);
  const overdueCount = filtered.filter(r => isDueSoon(r.next_service_date, r.next_service_km, null) === "overdue").length;
  const soonCount    = filtered.filter(r => isDueSoon(r.next_service_date, r.next_service_km, null) === "soon").length;

  const uniqueCompanies = useMemo(() => {
    const seen = new Map<string, string>();
    records.forEach(r => { if (r.company_id && r.company_name) seen.set(r.company_id, r.company_name); });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [records]);

  const uniqueVehicles = useMemo(() => {
    const seen = new Map<string, string>();
    records.forEach(r => { if (r.vehicle_id) seen.set(r.vehicle_id, r.plate || r.vehicle_plate); });
    return Array.from(seen.entries()).map(([id, plate]) => ({ id, plate }));
  }, [records]);

  const sortedFiltered = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const p: Record<string, number> = { overdue: 0, soon: 1 };
      const dA = String(isDueSoon(a.next_service_date, a.next_service_km, null));
      const dB = String(isDueSoon(b.next_service_date, b.next_service_km, null));
      return (p[dA] ?? 2) - (p[dB] ?? 2);
    });
  }, [filtered]);

  const costByVehicle = useMemo(() => {
    const map = new Map<string, { plate: string; count: number; total: number }>();
    filtered.forEach(r => {
      if (r.vehicle_id) {
        const e = map.get(r.vehicle_id) || { plate: r.plate || r.vehicle_plate || r.vehicle_id, count: 0, total: 0 };
        e.count++;
        e.total += Number(r.cost || 0);
        map.set(r.vehicle_id, e);
      }
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filtered]);

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Araç Bakım</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{filtered.length} kayıt · Toplam maliyet: ₺{totalCost.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</p>
          </div>
          {canEdit && (
            <button
              onClick={openCreate}
              className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors shrink-0 min-h-[44px]"
            >
              + Bakım Ekle
            </button>
          )}
        </div>

        {/* Alert bar */}
        {(overdueCount > 0 || soonCount > 0) && (
          <div className="mb-5 flex flex-wrap gap-2">
            {overdueCount > 0 && (
              <div className="flex items-center gap-2 bg-red-950 border border-red-800 text-red-400 text-sm px-4 py-2 rounded-lg">
                <span className="font-bold">⚠</span>
                {overdueCount} araçta bakım süresi dolmuş
              </div>
            )}
            {soonCount > 0 && (
              <div className="flex items-center gap-2 bg-amber-950 border border-amber-800 text-amber-400 text-sm px-4 py-2 rounded-lg">
                <span className="font-bold">!</span>
                {soonCount} araçta bakım yaklaşıyor (30 gün içinde)
              </div>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-5">
          <AppSelect
            value={filterVehicle}
            onChange={setFilterVehicle}
            options={[
              { value: "", label: "Tüm Araçlar" },
              ...uniqueVehicles.map(v => ({ value: v.id, label: v.plate })),
            ]}
            triggerClass="bg-zinc-900 border-zinc-800"
            className="min-w-[150px] max-w-[200px]"
          />
          <AppSelect
            value={filterCompany}
            onChange={setFilterCompany}
            options={[
              { value: "", label: "Tüm Firmalar" },
              ...uniqueCompanies.map(c => ({ value: c.id, label: c.name })),
            ]}
            triggerClass="bg-zinc-900 border-zinc-800"
            className="min-w-[150px] max-w-[220px]"
          />
          <AppSelect
            value={filterType}
            onChange={setFilterType}
            options={[
              { value: "", label: "Tüm Türler" },
              ...MAINTENANCE_TYPES.map(t => ({ value: t.value, label: t.label })),
            ]}
            triggerClass="bg-zinc-900 border-zinc-800"
            className="min-w-[150px] max-w-[200px]"
          />
          {(filterVehicle || filterCompany || filterType) && (
            <button
              onClick={() => { setFilterVehicle(""); setFilterCompany(""); setFilterType(""); }}
              className="text-xs text-zinc-500 underline hover:text-white px-1"
            >
              Filtreyi temizle
            </button>
          )}
        </div>

        {/* Araç bazında maliyet özeti */}
        {costByVehicle.length > 0 && (
          <div className="mb-5 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Araç Bazında Toplam Maliyet</h2>
            <div className="flex flex-wrap gap-2">
              {costByVehicle.slice(0, 12).map(v => (
                <div key={v.plate} className="flex items-center gap-2 bg-zinc-800 px-3 py-1.5 rounded-lg text-xs">
                  <span className="font-mono text-white font-semibold">{v.plate}</span>
                  <span className="text-zinc-500">·</span>
                  <span className="text-zinc-400">{v.count} bakım</span>
                  <span className="text-zinc-500">·</span>
                  <span className="text-emerald-400 font-medium">₺{v.total.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-24 text-zinc-600 text-sm">Yükleniyor...</div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            {records.length === 0 ? (
              <>
                <div className="text-5xl mb-4">🔧</div>
                <p className="text-zinc-300 font-medium mb-1">Henüz bakım kaydı yok</p>
                <p className="text-zinc-600 text-sm max-w-xs mx-auto">Araçlarınızın periyodik bakım ve servis kayıtlarını buradan takip edin. Sağ üstteki butona tıklayarak ilk kaydı oluşturun.</p>
              </>
            ) : (
              <>
                <div className="text-4xl mb-3">🔍</div>
                <p className="text-zinc-400 font-medium mb-1">Filtreye uyan kayıt yok</p>
                <p className="text-zinc-600 text-sm">Farklı filtre seçenekleri deneyin.</p>
              </>
            )}
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            {sortedFiltered.map((rec, i) => {
              const isExpanded = expanded === rec.id;
              const due = isDueSoon(rec.next_service_date, rec.next_service_km, null);
              return (
                <div key={rec.id} className={i < sortedFiltered.length - 1 ? "border-b border-zinc-800/50" : ""}>
                  {/* Row */}
                  <button
                    className="w-full text-left px-5 py-4 hover:bg-zinc-800/40 transition-colors"
                    onClick={() => setExpanded(isExpanded ? null : rec.id)}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-white font-mono font-semibold text-sm">{rec.plate}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeColor(rec.type)}`}>
                            {typeLabel(rec.type)}
                          </span>
                          {due === "overdue" && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-950 text-red-400 border border-red-800">
                              Bakım Geçti!
                            </span>
                          )}
                          {due === "soon" && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-950 text-amber-400 border border-amber-800">
                              Yaklaşıyor
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-zinc-500 text-xs">
                          <span>{rec.maintenance_date}</span>
                          {rec.company_name && <span>{rec.company_name}</span>}
                          {rec.km_at_service != null && <span>{rec.km_at_service.toLocaleString("tr-TR")} km</span>}
                          {rec.cost != null && <span className="text-zinc-400">₺{Number(rec.cost).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</span>}
                        </div>
                      </div>
                      <svg
                        className={`w-4 h-4 text-zinc-600 shrink-0 mt-0.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {/* Detail panel */}
                  {isExpanded && (
                    <div className="px-5 pb-5 border-t border-zinc-800/50 bg-zinc-950/40">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 text-sm">
                        {rec.technician && (
                          <div>
                            <span className="text-zinc-500">Teknisyen</span>
                            <p className="text-white mt-0.5">{rec.technician}</p>
                          </div>
                        )}
                        {rec.next_service_km != null && (
                          <div>
                            <span className="text-zinc-500">Sonraki Bakım (km)</span>
                            <p className="text-white mt-0.5">{rec.next_service_km.toLocaleString("tr-TR")} km</p>
                          </div>
                        )}
                        {rec.next_service_date && (
                          <div>
                            <span className="text-zinc-500">Sonraki Bakım (tarih)</span>
                            <p className={`mt-0.5 font-medium ${due === "overdue" ? "text-red-400" : due === "soon" ? "text-amber-400" : "text-white"}`}>
                              {rec.next_service_date}
                            </p>
                          </div>
                        )}
                        {rec.notes && (
                          <div className="sm:col-span-2">
                            <span className="text-zinc-500">Notlar</span>
                            <p className="text-white mt-0.5 whitespace-pre-wrap">{rec.notes}</p>
                          </div>
                        )}
                        {rec.receipt_url && (
                          <div className="sm:col-span-2">
                            <span className="text-zinc-500">Servis Fişi</span>
                            <p className="mt-0.5">
                              <a href={rec.receipt_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline text-sm break-all">
                                Fişi Görüntüle →
                              </a>
                            </p>
                          </div>
                        )}
                        {rec.creator_name && (
                          <div>
                            <span className="text-zinc-500">Kaydeden</span>
                            <p className="text-zinc-400 mt-0.5 text-xs">{rec.creator_name}</p>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      {(canEdit || canDelete) && (
                        <div className="flex gap-2 mt-4">
                          {canEdit && (
                            <button
                              onClick={() => openEdit(rec)}
                              className="text-xs bg-zinc-800 text-zinc-300 px-3 py-2 rounded-lg hover:bg-zinc-700 transition-colors min-h-[36px]"
                            >
                              Düzenle
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => del(rec)}
                              className="text-xs bg-red-950 text-red-400 border border-red-800 px-3 py-2 rounded-lg hover:bg-red-900 transition-colors min-h-[36px]"
                            >
                              Sil
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Add / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4" onClick={() => setShowForm(false)}>
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <h2 className="text-white font-semibold">{editing ? "Bakım Kaydını Düzenle" : "Bakım Kaydı Ekle"}</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg">✕</button>
            </div>

            <div className="p-6 space-y-4">
              {/* Firma filtresi (araç listesini daralt) */}
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Firma (araç filtresi)</label>
                <AppSelect
                  value={formCompanyFilter}
                  onChange={v => { setFormCompanyFilter(v); setForm(f => ({ ...f, vehicle_id: "", company_id: v, plate: "" })); }}
                  options={[
                    { value: "", label: "— Tüm firmalar —" },
                    ...companies.map(c => ({ value: c.id, label: c.name })),
                  ]}
                />
              </div>

              {/* Araç seç */}
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Araç *</label>
                <ComboboxSearch
                  value={form.vehicle_id}
                  onChange={onVehicleChange}
                  placeholder="Plaka ile ara..."
                  options={[
                    { value: "", label: "— Araç seçin —" },
                    ...(() => {
                      const filtered = formCompanyFilter
                        ? vehicles.filter(v => v.company_id === formCompanyFilter)
                        : vehicles;
                      const list = (filtered.length > 0 || !formCompanyFilter) ? filtered : vehicles;
                      return list.map(v => ({ value: v.id, label: v.plate }));
                    })(),
                  ]}
                />
              </div>

              {/* Bakım tipi + Tarih */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Bakım Tipi *</label>
                  <AppSelect
                    value={form.type}
                    onChange={v => setForm(f => ({ ...f, type: v }))}
                    options={MAINTENANCE_TYPES.map(t => ({ value: t.value, label: t.label }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Tarih *</label>
                  <input
                    type="date"
                    value={form.maintenance_date}
                    onChange={e => setForm(f => ({ ...f, maintenance_date: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark] min-h-[44px]"
                  />
                </div>
              </div>

              {/* KM + Maliyet */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Yapıldığı KM</label>
                  <input
                    type="number"
                    value={form.km_at_service}
                    onChange={e => setForm(f => ({ ...f, km_at_service: e.target.value }))}
                    placeholder="150000"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Maliyet (₺)</label>
                  <input
                    type="number"
                    value={form.cost}
                    onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
                    placeholder="500.00"
                    step="0.01"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 min-h-[44px]"
                  />
                </div>
              </div>

              {/* Sonraki bakım */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Sonraki Bakım KM</label>
                  <input
                    type="number"
                    value={form.next_service_km}
                    onChange={e => setForm(f => ({ ...f, next_service_km: e.target.value }))}
                    placeholder="160000"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Sonraki Bakım Tarihi</label>
                  <input
                    type="date"
                    value={form.next_service_date}
                    min={new Date().toISOString().split("T")[0]}
                    onChange={e => setForm(f => ({ ...f, next_service_date: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark] min-h-[44px]"
                  />
                </div>
              </div>

              {/* Teknisyen */}
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Teknisyen / Servis</label>
                <input
                  value={form.technician}
                  onChange={e => setForm(f => ({ ...f, technician: e.target.value }))}
                  placeholder="Servis adı veya teknisyen adı"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 min-h-[44px]"
                />
              </div>

              {/* Servis Fişi URL */}
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Servis Fişi URL (opsiyonel)</label>
                <input
                  type="url"
                  value={form.receipt_url}
                  onChange={e => setForm(f => ({ ...f, receipt_url: e.target.value }))}
                  placeholder="https://..."
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 min-h-[44px]"
                />
              </div>

              {/* Notlar */}
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Notlar</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 resize-none"
                />
              </div>

              {formError && (
                <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-3 py-2">{formError}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors min-h-[44px]"
                >
                  İptal
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors min-h-[44px]"
                >
                  {saving ? "Kaydediliyor..." : editing ? "Güncelle" : "Kaydet"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
