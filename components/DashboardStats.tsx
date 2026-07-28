"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { isAtLeastLevel } from "@/lib/permissions";

type StatsData = {
  todayArrivals: number;
  totalActiveVehicles: number;
  checkedCompanies: number;
  uncheckedCompanies: number;
  denetimGerektiren: number;
  openTodosCount: number;
  openTickets: number;
  slaBreaches: number;
  openRoutesCount: number;
  activeTransfers?: number;
  todayCompletedTransfers?: number;
};

type OpenRoute = {
  id: string;
  company_id: string;
  company_name: string;
  name: string;
  distance_km: string | null;
  duration_min: number | null;
  price: string | null;
  notes: string | null;
  status: string;
  created_at: string;
};

type Company = { id: string; name: string };

// ── Animated counter ──────────────────────────────────────────────────────
function AnimatedNumber({ value }: { value: string | number }) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const num = parseInt(String(value));
    if (isNaN(num) || (typeof value === 'string' && value.includes('/'))) {
      setDisplay(value); return;
    }
    if (num <= 0) { setDisplay(value); return; }
    const duration = Math.min(700, num * 30);
    const steps = Math.ceil(duration / 16);
    const step = Math.ceil(num / steps);
    let cur = 0;
    const timer = setInterval(() => {
      cur = Math.min(cur + step, num);
      setDisplay(cur === num ? value : cur);
      if (cur >= num) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [value]);
  return <>{display}</>;
}

// ── Stat Card ──────────────────────────────────────────────────────────────
function StatCard({
  title, value, accent, onClick, index = 0,
}: {
  title: string;
  value: string | number;
  accent?: "blue" | "red" | "green" | "amber";
  onClick?: () => void;
  index?: number;
}) {
  const accentMap = {
    blue:  { text: "text-blue-400",    bar: "bg-blue-400",    glow: "hover:shadow-blue-500/10" },
    red:   { text: "text-red-400",     bar: "bg-red-400",     glow: "hover:shadow-red-500/10" },
    green: { text: "text-emerald-400", bar: "bg-emerald-400", glow: "hover:shadow-emerald-500/10" },
    amber: { text: "text-amber-400",   bar: "bg-amber-400",   glow: "hover:shadow-amber-500/10" },
  }[accent || "blue"];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.06, ease: "easeOut" }}
      onClick={onClick}
      className={`group relative bg-zinc-900 border border-zinc-800/80 rounded-2xl p-4 flex flex-col gap-2.5 overflow-hidden
        ${onClick ? `cursor-pointer hover:border-zinc-700 hover:bg-zinc-800/60 hover:shadow-lg ${accentMap.glow} active:scale-[0.98] transition-all duration-200` : "transition-all duration-200"}`}
    >
      {/* Top */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-zinc-500 leading-snug">{title}</p>
        {onClick && (
          <div className="w-6 h-6 rounded-lg bg-zinc-800 group-hover:bg-zinc-700 flex items-center justify-center transition-colors shrink-0">
            <svg className="w-3 h-3 text-zinc-500 group-hover:text-zinc-300 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        )}
      </div>

      {/* Value */}
      <p className={`text-2xl font-bold tabular-nums leading-none ${accentMap.text}`}>
        <AnimatedNumber value={value} />
      </p>

      {/* Bottom accent bar */}
      <div className={`absolute bottom-0 left-0 h-[2px] ${accentMap.bar} opacity-40 group-hover:opacity-70 transition-opacity`}
        style={{ width: "100%" }}
      />
    </motion.div>
  );
}

// ── Checked Companies Modal ────────────────────────────────────────────────
function todayStr() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());
}

function CheckedCompaniesModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => todayStr());
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setData([]);
    fetch(`/api/stats/companies-detail?type=checked&date=${selectedDate}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setData(d.data); })
      .finally(() => setLoading(false));
  }, [selectedDate]);

  function fmt(iso: string) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  }

  const isToday = selectedDate === todayStr();

  return (
    <div
      ref={backdropRef}
      onClick={e => { if (e.target === backdropRef.current) onClose(); }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4"
    >
      <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div>
            <p className="font-semibold text-white">Kontrol Edilen Firmalar</p>
            <p className="text-xs text-zinc-500 mt-0.5">{isToday ? "Bugün" : selectedDate} araç girişi yapılmış firmalar</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={selectedDate}
              max={todayStr()}
              onChange={e => { setSelectedDate(e.target.value); setExpanded(null); }}
              className="text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-zinc-500"
            />
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-400 text-lg">✕</button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-zinc-800 rounded-xl animate-pulse" />)}</div>
          ) : data.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-10">{isToday ? "Bugün" : selectedDate} için giriş kaydı yok</p>
          ) : data.map(co => (
            <div key={co.id} className="bg-zinc-800/40 border border-zinc-700/50 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === co.id ? null : co.id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/60 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
                  <div>
                    <p className="font-medium text-white text-sm">{co.name}</p>
                    <p className="text-xs text-zinc-500">{co.arrival_count} / {co.total_vehicles} araç geldi</p>
                  </div>
                </div>
                <span className="text-zinc-600 text-xs">{expanded === co.id ? "▲" : "▼"}</span>
              </button>
              {expanded === co.id && (
                <div className="border-t border-zinc-700/50 px-4 py-3">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-zinc-500 border-b border-zinc-700/50">
                        <th className="text-left pb-2 font-medium">Plaka</th>
                        <th className="text-left pb-2 font-medium">Şöför</th>
                        <th className="text-left pb-2 font-medium">Güzergah</th>
                        <th className="text-left pb-2 font-medium">Saat</th>
                        <th className="text-left pb-2 font-medium">Kaydeden</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {co.arrivals.map((a: any, i: number) => (
                        <tr key={i} className="text-zinc-300">
                          <td className="py-1.5 font-mono font-semibold">{a.plate}</td>
                          <td className="py-1.5 text-zinc-400">{a.driver_name || "—"}</td>
                          <td className="py-1.5 text-emerald-400/80 truncate max-w-[100px]">{a.route_name || "—"}</td>
                          <td className="py-1.5 tabular-nums">{fmt(a.arrived_at)}</td>
                          <td className="py-1.5 text-zinc-500">{a.recorded_by || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {co.arrivals.some((a: any) => a.arrival_note) && (
                    <div className="mt-2 space-y-1">
                      {co.arrivals.filter((a: any) => a.arrival_note).map((a: any, i: number) => (
                        <p key={i} className="text-xs text-amber-400/80"><span className="font-mono font-semibold">{a.plate}</span>: {a.arrival_note}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Unchecked Companies Modal ──────────────────────────────────────────────
function UncheckedCompaniesModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/stats/companies-detail?type=unchecked")
      .then(r => r.json())
      .then(d => { if (d.ok) setData(d.data); })
      .finally(() => setLoading(false));
  }, []);

  function daysSince(dateStr: string | null) {
    if (!dateStr) return null;
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
    return diff;
  }

  return (
    <div
      ref={backdropRef}
      onClick={e => { if (e.target === backdropRef.current) onClose(); }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4"
    >
      <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div>
            <p className="font-semibold text-white">Kontrol Edilmeyen Firmalar</p>
            <p className="text-xs text-zinc-500 mt-0.5">Bugün araç girişi olmayan firmalar</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-400 text-lg">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-zinc-800 rounded-xl animate-pulse" />)}</div>
          ) : data.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-10">Tüm firmalar kontrol edilmiş 🎉</p>
          ) : data.map(co => {
            const days = daysSince(co.last_arrival_date);
            return (
              <div key={co.id} className="bg-zinc-800/40 border border-zinc-700/50 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                  <div className="min-w-0">
                    <p className="font-medium text-white text-sm truncate">{co.name}</p>
                    <p className="text-xs text-zinc-500">{co.vehicle_count} araç</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {co.last_arrival_date ? (
                    <>
                      <p className="text-xs text-zinc-400">{new Date(co.last_arrival_date).toLocaleDateString("tr-TR")}</p>
                      <p className={`text-xs font-medium ${days !== null && days > 14 ? "text-red-400" : "text-amber-400"}`}>
                        {days !== null ? `${days} gün önce` : ""}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-zinc-600">Hiç giriş yok</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Open Routes Modal ──────────────────────────────────────────────────────
function OpenRoutesModal({ onClose, canEdit }: { onClose: () => void; canEdit: boolean }) {
  const [routes, setRoutes] = useState<OpenRoute[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ company_id: "", name: "", distance_km: "", duration_min: "", price: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  const fetchRoutes = () => {
    fetch("/api/open-routes")
      .then(r => r.json())
      .then(d => { if (d.ok) setRoutes(d.data); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRoutes();
    fetch("/api/companies").then(r => r.json()).then(d => { if (d.ok) setCompanies(d.data); });
  }, []);

  async function handleClose(id: string) {
    await fetch(`/api/open-routes/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "closed" }) });
    fetchRoutes();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.company_id || !form.name.trim()) { setError("Firma ve güzergah adı zorunludur"); return; }
    setSubmitting(true); setError("");
    try {
      const r = await fetch("/api/open-routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: form.company_id,
          name: form.name,
          distance_km: form.distance_km ? parseFloat(form.distance_km) : undefined,
          duration_min: form.duration_min ? parseInt(form.duration_min) : undefined,
          price: form.price ? parseFloat(form.price) : undefined,
          notes: form.notes || undefined,
        }),
      });
      const d = await r.json();
      if (d.ok) {
        setForm({ company_id: "", name: "", distance_km: "", duration_min: "", price: "", notes: "" });
        setShowForm(false);
        fetchRoutes();
      } else {
        setError(typeof d.error === "string" ? d.error : "Hata oluştu");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const openList = routes.filter(r => r.status === "open");
  const closedList = routes.filter(r => r.status === "closed");

  const inputCls = "w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500";

  return (
    <div
      ref={backdropRef}
      onClick={e => { if (e.target === backdropRef.current) onClose(); }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4"
    >
      <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div>
            <p className="font-semibold text-white">Açık Güzergahlar</p>
            <p className="text-xs text-zinc-500 mt-0.5">{openList.length} açık güzergah</p>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                onClick={() => setShowForm(f => !f)}
                className="text-xs bg-white text-zinc-950 font-semibold px-3 py-1.5 rounded-lg hover:bg-zinc-200 transition-colors"
              >
                + Yeni Güzergah
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-400 text-lg">✕</button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* Add form */}
          {canEdit && showForm && (
            <form onSubmit={handleSubmit} className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Yeni Güzergah Ekle</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Firma *</label>
                  <select value={form.company_id} onChange={e => setForm(f => ({ ...f, company_id: e.target.value }))} className={inputCls}>
                    <option value="">— Firma seçin —</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Güzergah Adı *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Güzergah adı" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Mesafe (km)</label>
                  <input type="number" step="0.1" value={form.distance_km} onChange={e => setForm(f => ({ ...f, distance_km: e.target.value }))} placeholder="0.0" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Süre (dakika)</label>
                  <input type="number" value={form.duration_min} onChange={e => setForm(f => ({ ...f, duration_min: e.target.value }))} placeholder="0" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Fiyat (₺)</label>
                  <input type="number" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Not</label>
                  <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Opsiyonel not" className={inputCls} />
                </div>
              </div>
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={submitting} className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                  {submitting ? "Kaydediliyor..." : "Kaydet"}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="text-sm text-zinc-500 hover:text-white px-4 py-2 rounded-lg hover:bg-zinc-800 transition-colors">
                  İptal
                </button>
              </div>
            </form>
          )}

          {/* Open list */}
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-16 bg-zinc-800 rounded-xl animate-pulse" />)}
            </div>
          ) : openList.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-zinc-600 text-sm">Açık güzergah bulunmuyor</p>
              {canEdit && <p className="text-zinc-700 text-xs mt-1">Yukarıdan yeni güzergah ekleyebilirsiniz</p>}
            </div>
          ) : (
            <div className="space-y-2">
              {openList.map(route => (
                <div key={route.id} className="bg-zinc-800/40 border border-zinc-700/50 rounded-xl px-4 py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-white text-sm">{route.name}</p>
                      <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">Açık</span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">{route.company_name}</p>
                    <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-zinc-500">
                      {route.distance_km && <span>{parseFloat(route.distance_km)} km</span>}
                      {route.duration_min && <span>{route.duration_min} dk</span>}
                      {route.price && <span>₺{parseFloat(route.price).toLocaleString("tr-TR")}</span>}
                      {route.notes && <span className="text-zinc-600 italic truncate max-w-[200px]">{route.notes}</span>}
                    </div>
                  </div>
                  {canEdit && (
                    <button
                      onClick={() => handleClose(route.id)}
                      className="text-xs text-zinc-500 hover:text-red-400 hover:bg-zinc-800 px-2.5 py-1 rounded-lg border border-zinc-700 hover:border-red-800 transition-colors shrink-0"
                    >
                      Kapat
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Closed list (collapsible) */}
          {closedList.length > 0 && (
            <details className="group">
              <summary className="text-xs text-zinc-600 hover:text-zinc-400 cursor-pointer list-none flex items-center gap-1 select-none">
                <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                Kapalı güzergahlar ({closedList.length})
              </summary>
              <div className="mt-2 space-y-2">
                {closedList.map(route => (
                  <div key={route.id} className="bg-zinc-800/20 border border-zinc-800 rounded-xl px-4 py-3 opacity-60">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-zinc-400 text-sm">{route.name}</p>
                      <span className="text-xs bg-zinc-700/50 text-zinc-500 px-2 py-0.5 rounded-full">Kapalı</span>
                    </div>
                    <p className="text-xs text-zinc-600 mt-0.5">{route.company_name}</p>
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-zinc-600">
                      {route.distance_km && <span>{parseFloat(route.distance_km)} km</span>}
                      {route.duration_min && <span>{route.duration_min} dk</span>}
                      {route.price && <span>₺{parseFloat(route.price).toLocaleString("tr-TR")}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Export ────────────────────────────────────────────────────────────
export default function DashboardStats({ stats, hierarchyLevel }: { stats: StatsData; hierarchyLevel: number }) {
  const [showRoutesModal, setShowRoutesModal] = useState(false);
  const [showCheckedModal, setShowCheckedModal] = useState(false);
  const [showUncheckedModal, setShowUncheckedModal] = useState(false);
  const [routesCount, setRoutesCount] = useState(stats.openRoutesCount);

  const canEdit = isAtLeastLevel(hierarchyLevel, "yetkili");
  const isManager = isAtLeastLevel(hierarchyLevel, "yonetici");

  // Refresh count after modal closes
  function handleModalClose() {
    setShowRoutesModal(false);
    fetch("/api/open-routes?status=open")
      .then(r => r.json())
      .then(d => { if (d.ok) setRoutesCount(d.data.length); })
      .catch(() => {});
  }

  return (
    <>
      {/* Row 1 — always visible */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard index={0} title="Araç Girişi" value={`${stats.todayArrivals}${stats.totalActiveVehicles > 0 ? " / " + stats.totalActiveVehicles : ""}`} accent="green" />
        <StatCard index={1} title="Kontrol Edilen Firma" value={stats.checkedCompanies} accent="blue" onClick={() => setShowCheckedModal(true)} />
        <StatCard index={2} title="Kontrol Edilmeyen Firma" value={stats.uncheckedCompanies} accent="amber" onClick={() => setShowUncheckedModal(true)} />
        {isManager && stats.denetimGerektiren > 0
          ? <StatCard index={3} title="Denetim Gerektiren" value={`${stats.denetimGerektiren} araç`} accent="amber" />
          : <div />}
      </div>

      {/* Row 2 — manager stats + open routes for all */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard index={4} title="Açık Görev" value={stats.openTodosCount} accent="blue" />
        {isManager
          ? <StatCard index={5} title="Açık Sorunlar" value={stats.openTickets} accent="amber" />
          : <div />}
        <StatCard index={6} title="Termini Geçen" value={stats.slaBreaches} accent="red" />
        <StatCard
          index={7}
          title="Açık Güzergah"
          value={routesCount}
          accent="blue"
          onClick={() => setShowRoutesModal(true)}
        />
      </div>

      {/* Row 3 — transfer stats */}
      {((stats.activeTransfers ?? 0) > 0 || (stats.todayCompletedTransfers ?? 0) > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard index={8} title="Aktif Transfer" value={stats.activeTransfers ?? 0} accent="green" />
          <StatCard index={9} title="Bugün Tamamlanan" value={stats.todayCompletedTransfers ?? 0} accent="blue" />
          <div /><div />
        </div>
      )}

      {showRoutesModal && (
        <OpenRoutesModal onClose={handleModalClose} canEdit={canEdit} />
      )}
      {showCheckedModal && (
        <CheckedCompaniesModal onClose={() => setShowCheckedModal(false)} />
      )}
      {showUncheckedModal && (
        <UncheckedCompaniesModal onClose={() => setShowUncheckedModal(false)} />
      )}
    </>
  );
}
