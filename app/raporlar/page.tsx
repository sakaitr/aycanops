"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Nav from "@/components/Nav";
import StatCard from "@/components/StatCard";
import Badge from "@/components/Badge";
import ComboboxSearch from "@/components/ComboboxSearch";
import { AutoChart } from "@/components/ReportCharts";
import { REPORT_CATALOG, REPORT_CATEGORIES, type ReportDef } from "@/lib/reports/catalog";
import type { ReportResult } from "@/lib/reports/queries";

// â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function today() { return new Date().toISOString().split("T")[0]; }
function monthAgo() { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().split("T")[0]; }
function downloadBlob(b64: string, filename: string, mime: string) {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

// ─── KPI Panel Components ─────────────────────────────────────────────────────
function GaugeRing({ percent, color }: { percent: number; color: string }) {
  const r = 36; const circ = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(100, percent)) / 100 * circ;
  return (
    <svg width="96" height="96" viewBox="0 0 96 96">
      <circle cx="48" cy="48" r={r} fill="none" stroke="#27272a" strokeWidth="9" />
      <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="9"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 48 48)" />
      <text x="48" y="53" textAnchor="middle" fill="white" fontSize="15" fontWeight="bold">{percent}%</text>
    </svg>
  );
}

function Sparkline({ data }: { data: number[] }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const w = 160; const h = 40;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`).join(" ");
  return (
    <svg width={w} height={h} className="opacity-70">
      <polyline points={pts} fill="none" stroke="#34d399" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function TrendBadge({ trend }: { trend: number }) {
  const up = trend >= 0;
  return (
    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${up ? "bg-emerald-900 text-emerald-300" : "bg-red-900 text-red-300"}`}>
      {up ? "▲" : "▼"} {Math.abs(trend)}%
    </span>
  );
}

function KpiPanel({ kpi, loading, onRefresh }: { kpi: any; loading: boolean; onRefresh: () => void }) {
  if (loading) return (
    <div className="flex items-center justify-center py-32 text-zinc-500 text-sm gap-2">
      <span className="animate-spin">⟳</span> Yükleniyor…
    </div>
  );
  if (!kpi) return (
    <div className="flex flex-col items-center justify-center py-32 text-zinc-500 text-sm gap-3">
      <span className="text-3xl">📊</span>
      <span>KPI verileri yüklenemedi.</span>
      <button onClick={onRefresh} className="text-xs text-blue-400 hover:underline">Yeniden dene</button>
    </div>
  );

  const { fleet, sla, inspection, maintenance, arrivals, todos, denetimGerektiren, avgResolutionHours, asOf } = kpi;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">KPI Özeti · {asOf}</h2>
        <button onClick={onRefresh} className="text-xs text-blue-400 hover:underline">↻ Yenile</button>
      </div>

      {/* Gauge Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col items-center gap-2">
          <GaugeRing percent={fleet?.percent ?? 0} color="#34d399" />
          <p className="text-sm font-semibold text-white">Filo Kullanılabilirliği</p>
          <p className="text-xs text-zinc-500">{fleet?.active ?? 0} / {fleet?.total ?? 0} araç aktif</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col items-center gap-2">
          <GaugeRing percent={sla?.percent ?? 0} color="#60a5fa" />
          <p className="text-sm font-semibold text-white">SLA Uyum Oranı</p>
          <p className="text-xs text-zinc-500">{sla?.on_time ?? 0} / {sla?.total ?? 0} zamanında çözüm (30g)</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col items-center gap-2">
          <GaugeRing percent={inspection?.percent ?? 0} color="#f59e0b" />
          <p className="text-sm font-semibold text-white">Denetim Geçme Oranı</p>
          <p className="text-xs text-zinc-500">{inspection?.pass ?? 0} / {inspection?.total ?? 0} geçti (30g)</p>
        </div>
      </div>

      {/* Trend Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Bugün Giriş</p>
          <p className="text-2xl font-bold text-white">{arrivals?.today ?? 0}</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">dün: {arrivals?.yesterday ?? 0}</span>
            {arrivals?.trend !== undefined && <TrendBadge trend={arrivals.trend} />}
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Açık Görevler</p>
          <p className="text-2xl font-bold text-white">{todos?.open ?? 0}</p>
          {todos?.trend !== undefined && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">geçen hafta</span>
              <TrendBadge trend={todos.trend} />
            </div>
          )}
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Bakım Gecikmiş</p>
          <p className={`text-2xl font-bold ${(maintenance?.overdue ?? 0) > 0 ? "text-red-400" : "text-white"}`}>{maintenance?.overdue ?? 0}</p>
          <p className="text-xs text-zinc-500">yakında: {maintenance?.due_soon ?? 0}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Ort. Çözüm Süresi</p>
          <p className="text-2xl font-bold text-white">{avgResolutionHours ?? "—"}<span className="text-sm font-normal text-zinc-400 ml-1">sa</span></p>
          <p className="text-xs text-zinc-500">sorun biletleri</p>
        </div>
      </div>

      {/* Arrivals Sparkline */}
      {arrivals?.spark && arrivals.spark.length > 1 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Son 30 Gün Araç Girişleri</p>
          <Sparkline data={arrivals.spark} />
        </div>
      )}

      {/* Maintenance + Alerts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Bu Ay Bakım</p>
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold text-white">{maintenance?.this_month ?? 0}</span>
            <span className="text-xs text-zinc-500">kayıt</span>
          </div>
          <p className="text-sm text-zinc-300">
            Toplam maliyet: <span className="text-white font-semibold">₺{Number(maintenance?.cost ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</span>
          </p>
        </div>
        <div className={`border rounded-xl p-4 space-y-1 ${(denetimGerektiren ?? 0) > 0 ? "bg-amber-950 border-amber-700" : "bg-zinc-900 border-zinc-800"}`}>
          <p className="text-xs uppercase tracking-wider mb-1 text-zinc-400">Denetim Gerektiren Araç</p>
          <p className={`text-2xl font-bold ${(denetimGerektiren ?? 0) > 0 ? "text-amber-300" : "text-white"}`}>{denetimGerektiren ?? 0}</p>
          <p className="text-xs text-zinc-400">son 30 günde denetlenmemiş</p>
        </div>
      </div>
    </div>
  );
}


export default function RaporlarPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  // sidebar / catalog
  const [activeCategory, setActiveCategory] = useState<string>(REPORT_CATEGORIES[0]);
  const [selectedReport, setSelectedReport] = useState<ReportDef | null>(null);

  // filters
  const [companies, setCompanies] = useState<any[]>([]);
  const [selCompanies, setSelCompanies] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState(monthAgo());
  const [dateTo, setDateTo] = useState(today());
  const [selVehiclePlate, setSelVehiclePlate] = useState("");
  const [reportVehicles, setReportVehicles] = useState<any[]>([]);

  // report data
  const [result, setResult] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // legacy tabs
  const [tab, setTab] = useState<"kpi" | "catalog" | "worklogs" | "tickets" | "giris-kontrol" | "gunluk-rapor">("kpi");

  // KPI panel
  const [kpi, setKpi] = useState<any>(null);
  const [kpiLoading, setKpiLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [worklogs, setWorklogs] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [legacyLoading, setLegacyLoading] = useState(true);
  const [wlFilter, setWlFilter] = useState("submitted");
  const [updating, setUpdating] = useState<string | null>(null);
  const [returnNote, setReturnNote] = useState("");
  const [returnTarget, setReturnTarget] = useState<string | null>(null);

  // legacy giris-kontrol
  const [gcCompanies, setGcCompanies] = useState<string[]>([]);
  const [gcDateFrom, setGcDateFrom] = useState(today());
  const [gcDateTo, setGcDateTo] = useState(today());
  const [gcRows, setGcRows] = useState<any[]>([]);
  const [gcLoading, setGcLoading] = useState(false);
  const [gcSearched, setGcSearched] = useState(false);

  // günlük rapor
  const [grDate, setGrDate] = useState(today());
  const [grData, setGrData] = useState<any>(null);
  const [grLoading, setGrLoading] = useState(false);

  // bulk export modal
  const [showBulk, setShowBulk] = useState(false);
  const [bulkIds, setBulkIds] = useState<number[]>([]);
  const [bulkFormat, setBulkFormat] = useState<"xlsx" | "pdf">("xlsx");
  const [bulkLoading, setBulkLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data); else router.replace("/login");
    }).catch(() => router.replace("/login"));
  }, []);

  useEffect(() => {
    fetch("/api/companies").then(r => r.json()).then(d => { if (d.ok) setCompanies(d.data); });
    fetch("/api/vehicles?limit=500").then(r => r.json()).then(d => { if (d.ok) setReportVehicles(d.data); });
  }, []);

  useEffect(() => { loadLegacy(); loadKpi(); }, []);

  async function loadKpi() {
    setKpiLoading(true);
    try {
      const r = await fetch("/api/stats/kpi");
      const d = await r.json();
      if (d.ok) setKpi(d.data);
    } finally { setKpiLoading(false); }
  };

  async function loadLegacy() {
    setLegacyLoading(true);
    try {
      const [wlRes, tcRes] = await Promise.all([fetch("/api/worklogs?status=submitted"), fetch("/api/tickets")]);
      const wld = await wlRes.json(); const tcd = await tcRes.json();
      if (wld.ok) setWorklogs(wld.data);
      if (tcd.ok) setTickets(tcd.data);
      const open = tcd.data?.filter((t: any) => !["solved","closed"].includes(t.status_code)).length || 0;
      const sla  = tcd.data?.filter((t: any) => t.sla_due_at && new Date(t.sla_due_at) < new Date() && !["solved","closed"].includes(t.status_code)).length || 0;
      setStats({ open, sla, pending: wld.data?.length || 0 });
    } finally { setLegacyLoading(false); }
  }

  async function loadWorklogs(status: string) {
    const res = await fetch(`/api/worklogs?status=${status}`); const d = await res.json();
    if (d.ok) setWorklogs(d.data);
  }

  async function approveWorklog(date: string, userId: string) {
    setUpdating(date);
    try {
      await fetch(`/api/worklogs/${date}?userId=${userId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status_code: "approved" }) });
      await loadWorklogs(wlFilter);
    } finally { setUpdating(null); }
  }

  async function returnWorklog(date: string) {
    if (!returnNote.trim()) return;
    setUpdating(date);
    try {
      await fetch(`/api/worklogs/${date}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status_code: "returned", manager_note: returnNote }) });
      setReturnTarget(null); setReturnNote("");
      await loadWorklogs(wlFilter);
    } finally { setUpdating(null); }
  }

  const fetchReport = useCallback(async (def: ReportDef) => {
    setLoading(true); setError(null); setResult(null);
    try {
      const params = new URLSearchParams({ report: String(def.id) });
      selCompanies.forEach(id => params.append("company_id", id));
      if (def.needsDate) { if (dateFrom) params.set("date_from", dateFrom); if (dateTo) params.set("date_to", dateTo); }
      if (def.needsVehicle && selVehiclePlate) params.set("vehicle_plate", selVehiclePlate);
      const res = await fetch(`/api/reports/data?${params.toString()}`);
      const d = await res.json();
      if (d.ok) setResult(d.data); else setError(d.error ?? "Hata");
    } catch { setError("Ag hatasi"); } finally { setLoading(false); }
  }, [selCompanies, dateFrom, dateTo, selVehiclePlate]);

  function selectReport(def: ReportDef) { setSelectedReport(def); setResult(null); setError(null); setSelVehiclePlate(""); }

  function buildExportUrl(format: "xlsx" | "pdf") {
    if (!selectedReport) return "#";
    const params = new URLSearchParams({ report: String(selectedReport.id), format });
    selCompanies.forEach(id => params.append("company_id", id));
    if (dateFrom) params.set("date_from", dateFrom); if (dateTo) params.set("date_to", dateTo);
    if (selectedReport.needsVehicle && selVehiclePlate) params.set("vehicle_plate", selVehiclePlate);
    return `/api/reports/export?${params.toString()}`;
  }

  function buildGcExportUrl(format: "xlsx" | "pdf") {
    const params = new URLSearchParams({ type: "giris-kontrol", format });
    gcCompanies.forEach(id => params.append("company_id", id));
    if (gcDateFrom) params.set("date_from", gcDateFrom); if (gcDateTo) params.set("date_to", gcDateTo);
    return `/api/reports/export?${params.toString()}`;
  }

  async function loadGirisKontrol() {
    setGcLoading(true); setGcSearched(true);
    try {
      const params = new URLSearchParams();
      gcCompanies.forEach(id => params.append("company_id", id));
      if (gcDateFrom) params.set("date_from", gcDateFrom); if (gcDateTo) params.set("date_to", gcDateTo);
      const res = await fetch(`/api/reports/giris-kontrol?${params.toString()}`);
      const d = await res.json(); if (d.ok) setGcRows(d.data);
    } finally { setGcLoading(false); }
  }

  async function loadGunlukRapor(date: string) {
    setGrLoading(true); setGrData(null);
    try {
      const res = await fetch(`/api/reports/gunluk-rapor?date=${date}`);
      const d = await res.json();
      if (d.ok) setGrData(d.data);
    } finally { setGrLoading(false); }
  }

  async function runBulkExport() {
    if (bulkIds.length === 0) return;
    setBulkLoading(true);
    try {
      const res = await fetch("/api/reports/bulk", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_ids: bulkIds, company_ids: selCompanies, date_from: dateFrom, date_to: dateTo, format: bulkFormat }),
      });
      const d = await res.json();
      if (d.ok && d.files) {
        const mime = bulkFormat === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        for (const f of d.files) setTimeout(() => downloadBlob(f.data, f.name, mime), 200);
        setShowBulk(false);
      }
    } finally { setBulkLoading(false); }
  }

  const statusGroups = {
    open: tickets.filter((t: any) => t.status_code === "open").length,
    in_progress: tickets.filter((t: any) => t.status_code === "in_progress").length,
    waiting: tickets.filter((t: any) => t.status_code === "waiting").length,
    solved: tickets.filter((t: any) => t.status_code === "solved").length,
    closed: tickets.filter((t: any) => t.status_code === "closed").length,
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-[1400px] mx-auto px-3 sm:px-6 lg:px-8 py-6">

        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Raporlar</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{REPORT_CATALOG.length} rapor · firma bazlı · tarih aralıklı · XLSX &amp; PDF</p>
          </div>
          <button onClick={() => setShowBulk(true)} className="bg-indigo-700 hover:bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            Toplu Dışa Aktar
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard title="Onay Bekleyen" value={stats?.pending ?? "—"} accent="blue" />
          <StatCard title="Açık Sorun" value={stats?.open ?? "—"} accent="amber" />
          <StatCard title="SLA İhlali" value={stats?.sla ?? "—"} accent="red" />
          <StatCard title="Toplam Rapor" value={REPORT_CATALOG.length} accent="green" />
        </div>

        <div className="flex overflow-x-auto border-b border-zinc-800 mb-6 gap-1">
          {([
            { key: "kpi", label: "📊 KPI Paneli" },
            { key: "catalog", label: "Rapor Kataloğu" },
            { key: "gunluk-rapor", label: "📅 Günlük Giriş Raporu" },
            { key: "worklogs", label: "Günlük Onayları" },
            { key: "tickets", label: "Sorun Listesi" },
            { key: "giris-kontrol", label: "Giriş Kontrol" },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`text-sm font-medium px-4 py-2.5 border-b-2 transition-colors -mb-px whitespace-nowrap ${tab === t.key ? "border-white text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "kpi" && (
          <KpiPanel kpi={kpi} loading={kpiLoading} onRefresh={loadKpi} />
        )}

        {tab === "catalog" && (
          <div className="flex gap-5 min-h-[600px]">
            <div className="w-60 flex-shrink-0 space-y-1">
              {REPORT_CATEGORIES.map(cat => (
                <div key={cat}>
                  <button onClick={() => setActiveCategory(cat)}
                    className={`w-full text-left text-xs font-bold px-3 py-2 rounded-lg uppercase tracking-wider ${activeCategory === cat ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>
                    {cat}
                  </button>
                  {activeCategory === cat && (
                    <div className="ml-2 mt-1 space-y-0.5">
                      {REPORT_CATALOG.filter(r => r.category === cat).map(def => (
                        <button key={def.id} onClick={() => selectReport(def)}
                          className={`w-full text-left text-sm px-3 py-2 rounded-lg transition-colors ${selectedReport?.id === def.id ? "bg-white text-zinc-950 font-semibold" : "text-zinc-300 hover:bg-zinc-800"}`}>
                          <span className="text-zinc-500 mr-1 font-mono text-xs">{String(def.id).padStart(2,"0")}.</span>{def.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex-1 min-w-0">
              {!selectedReport ? (
                <div className="flex flex-col items-center justify-center h-full text-zinc-600 text-sm py-24">
                  <div className="text-4xl mb-3">📋</div>Sol panelden bir rapor seçin
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{selectedReport.category} · R{String(selectedReport.id).padStart(2,"0")}</p>
                        <h2 className="text-xl font-bold text-white">{selectedReport.name}</h2>
                        <p className="text-zinc-400 text-sm mt-1">{selectedReport.description}</p>
                        <div className="flex gap-2 mt-2 flex-wrap">
                          {selectedReport.chartTypes.map(c => <span key={c} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">{c}</span>)}
                          <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">{selectedReport.roleMin}</span>
                        </div>
                      </div>
                      {result && (
                        <div className="flex gap-2 flex-shrink-0">
                          <a href={buildExportUrl("xlsx")} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-emerald-100">↓ XLSX</a>
                          <a href={buildExportUrl("pdf")}  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-800  hover:bg-blue-700  text-blue-100">↓ PDF</a>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3 items-end">
                      {selectedReport.needsCompany && (
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1">Firma</label>
                          <select multiple value={selCompanies} onChange={e => setSelCompanies(Array.from(e.target.selectedOptions, o => o.value))}
                            className="bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-1.5 rounded-lg w-48 max-h-24 focus:outline-none">
                            {companies.map((c: any) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                          </select>
                          {selCompanies.length > 0 && <button onClick={() => setSelCompanies([])} className="block mt-1 text-xs text-zinc-500 hover:text-zinc-300">Temizle</button>}
                        </div>
                      )}
                      {selectedReport.needsVehicle && (
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1">Araç (Plaka)</label>
                          <ComboboxSearch
                            options={reportVehicles.map(v => ({ value: v.plate, label: v.plate + (v.driver_name ? ` · ${v.driver_name}` : "") }))}
                            value={selVehiclePlate}
                            onChange={setSelVehiclePlate}
                            placeholder="Plaka ara..."
                            emptyLabel="— Tüm Araçlar —"
                          />
                        </div>
                      )}
                      {selectedReport.needsDate && (
                        <>
                          <div>
                            <label className="block text-xs text-zinc-500 mb-1">Başlangıç</label>
                            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-1.5 rounded-lg focus:outline-none" />
                          </div>
                          <div>
                            <label className="block text-xs text-zinc-500 mb-1">Bitiş</label>
                            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-1.5 rounded-lg focus:outline-none" />
                          </div>
                        </>
                      )}
                      <button onClick={() => fetchReport(selectedReport)} disabled={loading}
                        className="bg-white hover:bg-zinc-100 text-zinc-950 text-sm font-semibold px-5 py-1.5 rounded-lg disabled:opacity-50">
                        {loading ? "Getiriliyor…" : "Filtrele"}
                      </button>
                    </div>
                  </div>

                  {error && <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-4 py-3 rounded-lg">{error}</div>}

                  {loading && (
                    <div className="space-y-3 animate-pulse">
                      <div className="h-40 bg-zinc-900 rounded-xl" />
                      <div className="h-64 bg-zinc-900 rounded-xl" />
                    </div>
                  )}

                  {result && !loading && (
                    <>
                      {result.totals && Object.keys(result.totals).length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {Object.entries(result.totals).map(([k, v]) => (
                            <div key={k} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                              <p className="text-xs text-zinc-500 truncate">{k}</p>
                              <p className="text-xl font-bold text-white mt-0.5">{String(v)}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {result.charts.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {result.charts.map((chart, i) => (
                            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                              <AutoChart chart={chart} width={380} height={180} />
                            </div>
                          ))}
                        </div>
                      )}
                      {result.sections && result.sections.length > 0 ? (
                        result.sections.map((sec, si) => (
                          <div key={si} className="space-y-3">
                            <h3 className="text-sm font-semibold text-zinc-400 mt-2">{sec.title}</h3>
                            {sec.charts.length > 0 && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {sec.charts.map((c, ci) => <div key={ci} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"><AutoChart chart={c} width={380} height={160} /></div>)}
                              </div>
                            )}
                            <ReportTable rows={sec.rows} />
                          </div>
                        ))
                      ) : <ReportTable rows={result.rows} />}
                    </>
                  )}

                  {!result && !loading && !error && (
                    <div className="flex flex-col items-center justify-center py-20 text-zinc-600 text-sm">
                      <div className="text-3xl mb-3">🔍</div>
                      Filtreleri ayarlayıp <strong className="text-zinc-400 mx-1">Filtrele</strong> butonuna basın
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "worklogs" && (
          <div>
            <div className="flex gap-1 mb-5">
              {[{v:"submitted",l:"Bekleyenler"},{v:"approved",l:"Onaylananlar"},{v:"returned",l:"İade Edilenler"}].map(o => (
                <button key={o.v} onClick={async () => { setWlFilter(o.v); setWorklogs([]); await loadWorklogs(o.v); }}
                  className={`text-xs font-medium px-3 py-2 rounded-lg ${wlFilter === o.v ? "bg-white text-zinc-950" : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"}`}>{o.l}</button>
              ))}
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              {legacyLoading ? <div className="py-16 text-center text-zinc-600 text-sm">Yükleniyor...</div>
              : worklogs.length === 0 ? <div className="py-16 text-center text-zinc-600 text-sm">Kayıt bulunamadı</div>
              : worklogs.map((w: any, i: number) => (
                <div key={w.id} className={`flex items-center gap-4 px-4 py-4 ${i < worklogs.length - 1 ? "border-b border-zinc-800/50" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white text-sm font-medium">{w.user_name}</span>
                      <span className="text-zinc-600 text-xs">{new Date(w.work_date + "T00:00:00").toLocaleDateString("tr-TR")}</span>
                    </div>
                    <p className="text-zinc-400 text-xs truncate">{w.summary}</p>
                  </div>
                  <Badge status={w.status_code} showLabel />
                  {wlFilter === "submitted" && (
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => approveWorklog(w.work_date, w.user_id)} disabled={updating === w.work_date}
                        className="text-xs font-semibold px-3 py-1.5 bg-emerald-900 hover:bg-emerald-800 text-emerald-300 rounded-lg disabled:opacity-50">Onayla</button>
                      <button onClick={() => setReturnTarget(w.work_date)} disabled={updating === w.work_date}
                        className="text-xs font-semibold px-3 py-1.5 bg-orange-950 hover:bg-orange-900 text-orange-300 rounded-lg disabled:opacity-50">İade</button>
                    </div>
                  )}
                  <Link href={`/gunluk/${w.work_date}`} className="text-zinc-600 hover:text-white text-xs flex-shrink-0">Görüntüle →</Link>
                </div>
              ))}
            </div>
            {returnTarget && (
              <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm">
                  <h3 className="text-lg font-bold text-white mb-3">İade Notu</h3>
                  <textarea value={returnNote} onChange={e => setReturnNote(e.target.value)} rows={3} placeholder="İade gerekçesi..."
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none mb-4 resize-none" />
                  <div className="flex gap-3">
                    <button onClick={() => { setReturnTarget(null); setReturnNote(""); }} className="flex-1 py-2 text-sm text-zinc-400 border border-zinc-700 rounded-lg hover:text-white">İptal</button>
                    <button onClick={() => returnWorklog(returnTarget)} disabled={!returnNote.trim() || !!updating}
                      className="flex-1 py-2 text-sm font-semibold bg-orange-700 hover:bg-orange-600 text-white rounded-lg disabled:opacity-50">İade Et</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "tickets" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {Object.entries(statusGroups).map(([k, v]) => (
                <div key={k} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-white">{v}</p><Badge status={k} showLabel />
                </div>
              ))}
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead><tr className="border-b border-zinc-800">
                  {["No","Başlık","Öncelik","Durum","Atanan","SLA","Oluşturulma"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {tickets.map((t: any, i: number) => (
                    <tr key={t.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${i === tickets.length-1 ? "border-b-0":""}`}>
                      <td className="px-4 py-3 text-zinc-400 font-mono text-xs">{t.ticket_no}</td>
                      <td className="px-4 py-3 text-white font-medium max-w-[200px] truncate">{t.title}</td>
                      <td className="px-4 py-3"><Badge status={t.priority_code} showLabel /></td>
                      <td className="px-4 py-3"><Badge status={t.status_code} showLabel /></td>
                      <td className="px-4 py-3 text-zinc-400 text-xs">{t.assigned_name ?? "—"}</td>
                      <td className="px-4 py-3 text-zinc-400 text-xs">{t.sla_due_at ? new Date(t.sla_due_at).toLocaleDateString("tr-TR") : "—"}</td>
                      <td className="px-4 py-3 text-zinc-400 text-xs">{t.created_at ? new Date(t.created_at).toLocaleDateString("tr-TR") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "gunluk-rapor" && (
          <GunlukRaporPanel
            date={grDate} setDate={setGrDate}
            data={grData} loading={grLoading}
            onLoad={loadGunlukRapor}
          />
        )}

        {tab === "giris-kontrol" && (
          <div className="space-y-5">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Filtreler</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Firma {gcCompanies.length > 0 && <span className="text-emerald-400">({gcCompanies.length})</span>}</label>
                  <div className="bg-zinc-800 border border-zinc-700 rounded-lg overflow-y-auto max-h-36">
                    {companies.map((c: any) => {
                      const id = String(c.id); const checked = gcCompanies.includes(id);
                      return (
                        <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-700 cursor-pointer">
                          <input type="checkbox" checked={checked} onChange={e => setGcCompanies(prev => e.target.checked ? [...prev, id] : prev.filter(x => x !== id))} className="accent-emerald-500 w-3.5 h-3.5" />
                          <span className="text-sm text-white truncate">{c.name}</span>
                        </label>
                      );
                    })}
                  </div>
                  {gcCompanies.length > 0 && <button onClick={() => setGcCompanies([])} className="mt-1 text-xs text-zinc-500 hover:text-zinc-300 underline">Temizle</button>}
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Başlangıç</label>
                  <input type="date" value={gcDateFrom} onChange={e => setGcDateFrom(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Bitiş</label>
                  <input type="date" value={gcDateTo} onChange={e => setGcDateTo(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none" />
                </div>
              </div>
              <div className="flex gap-3 mt-4 flex-wrap">
                <button onClick={loadGirisKontrol} disabled={gcLoading} className="bg-white hover:bg-zinc-100 text-zinc-950 text-sm font-semibold px-5 py-2 rounded-lg disabled:opacity-50">{gcLoading ? "Getiriliyor..." : "Listele"}</button>
                {gcSearched && gcRows.length > 0 && (
                  <>
                    <a href={buildGcExportUrl("xlsx")} className="flex items-center gap-1.5 bg-emerald-800 hover:bg-emerald-700 text-emerald-100 text-sm font-semibold px-5 py-2 rounded-lg">↓ XLSX ({gcRows.length})</a>
                    <a href={buildGcExportUrl("pdf")}  className="flex items-center gap-1.5 bg-blue-800  hover:bg-blue-700  text-blue-100  text-sm font-semibold px-5 py-2 rounded-lg">↓ PDF</a>
                  </>
                )}
              </div>
            </div>
            {gcSearched && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
                {gcLoading ? <div className="py-16 text-center text-zinc-600 text-sm">Yükleniyor...</div>
                : gcRows.length === 0 ? <div className="py-16 text-center text-zinc-600 text-sm">Kayıt bulunamadı</div>
                : (
                  <table className="w-full text-sm min-w-[640px]">
                    <thead><tr className="border-b border-zinc-800">
                      {["Firma","Plaka","Güzergah","Tarih","Giriş Saati","Kaydeden","Not"].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {gcRows.map((row: any, i: number) => (
                        <tr key={i} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${i===gcRows.length-1?"border-b-0":""}`}>
                          <td className="px-4 py-3 text-white font-medium whitespace-nowrap">{row["Firma"]}</td>
                          <td className="px-4 py-3 text-zinc-300 font-mono">{row["Plaka"]}</td>
                          <td className="px-4 py-3 text-zinc-400 text-xs max-w-[120px] truncate">{row["Güzergah"] || "—"}</td>
                          <td className="px-4 py-3 text-zinc-400 text-xs whitespace-nowrap">{row["Tarih"]}</td>
                          <td className="px-4 py-3 text-zinc-300 text-xs font-mono">{row["Giriş Saati"]}</td>
                          <td className="px-4 py-3 text-zinc-400 text-xs">{row["Kaydeden"] || "—"}</td>
                          <td className="px-4 py-3 text-zinc-500 text-xs max-w-[120px] truncate">{row["Not"] || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )}

        {showBulk && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-white">Toplu Dışa Aktar</h3>
                <button onClick={() => setShowBulk(false)} className="text-zinc-500 hover:text-white text-xl">✕</button>
              </div>
              <div className="flex gap-2 mb-4">
                {(["xlsx","pdf"] as const).map(f => (
                  <button key={f} onClick={() => setBulkFormat(f)}
                    className={`px-4 py-1.5 text-sm font-semibold rounded-lg ${bulkFormat===f ? "bg-white text-zinc-950" : "bg-zinc-800 text-zinc-400 hover:text-white"}`}>{f.toUpperCase()}</button>
                ))}
              </div>
              <div className="mb-4">
                <label className="block text-xs text-zinc-500 mb-1">Firma (boş = tümü)</label>
                <div className="bg-zinc-800 border border-zinc-700 rounded-lg overflow-y-auto max-h-28">
                  {companies.map((c: any) => {
                    const id = String(c.id); const checked = selCompanies.includes(id);
                    return (
                      <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-700 cursor-pointer">
                        <input type="checkbox" checked={checked} onChange={e => setSelCompanies(prev => e.target.checked ? [...prev,id] : prev.filter(x=>x!==id))} className="accent-emerald-500 w-3.5 h-3.5" />
                        <span className="text-sm text-white truncate">{c.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Raporlar ({bulkIds.length} seçili)</p>
              <div className="space-y-0.5 mb-3 max-h-52 overflow-y-auto">
                {REPORT_CATALOG.map(def => (
                  <label key={def.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800 rounded-lg cursor-pointer">
                    <input type="checkbox" checked={bulkIds.includes(def.id)} onChange={e => setBulkIds(prev => e.target.checked ? [...prev,def.id] : prev.filter(x=>x!==def.id))} className="accent-indigo-500 w-3.5 h-3.5" />
                    <span className="text-zinc-400 font-mono text-xs mr-1">{String(def.id).padStart(2,"0")}.</span>
                    <span className="text-sm text-white">{def.name}</span>
                    <span className="ml-auto text-xs text-zinc-600 hidden sm:inline">{def.category}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-4 mb-4">
                <button onClick={() => setBulkIds(REPORT_CATALOG.map(r=>r.id))} className="text-xs text-zinc-500 hover:text-zinc-300 underline">Tümünü seç</button>
                <button onClick={() => setBulkIds([])} className="text-xs text-zinc-500 hover:text-zinc-300 underline">Temizle</button>
              </div>
              <button onClick={runBulkExport} disabled={bulkIds.length===0||bulkLoading}
                className="w-full py-2.5 text-sm font-semibold bg-indigo-700 hover:bg-indigo-600 text-white rounded-xl disabled:opacity-50 transition-colors">
                {bulkLoading ? "Hazırlanıyor…" : `${bulkIds.length} raporu ${bulkFormat.toUpperCase()} olarak indir`}
              </button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

// ─── Günlük Giriş Kontrol Raporu ─────────────────────────────────────────────

function BarChart({ data, maxVal, color = "#60a5fa" }: {
  data: { label: string; value: number }[];
  maxVal: number;
  color?: string;
}) {
  const W = 32; const GAP = 8; const H = 120;
  const total = data.length;
  const svgW = total * (W + GAP) - GAP;
  return (
    <svg width={svgW} height={H + 32} className="overflow-visible">
      {data.map((d, i) => {
        const barH = maxVal > 0 ? Math.round((d.value / maxVal) * H) : 0;
        const x = i * (W + GAP);
        return (
          <g key={i}>
            <rect x={x} y={H - barH} width={W} height={barH} rx={3} fill={color} />
            {d.value > 0 && (
              <text x={x + W / 2} y={H - barH - 4} textAnchor="middle" fill="white" fontSize="10">{d.value}</text>
            )}
            <text x={x + W / 2} y={H + 16} textAnchor="middle" fill="#71717a" fontSize="9">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function GunlukRaporPanel({
  date, setDate, data, loading, onLoad,
}: {
  date: string; setDate: (d: string) => void;
  data: any; loading: boolean; onLoad: (d: string) => void;
}) {
  const todayVal = new Date().toISOString().split("T")[0];

  function handleDateChange(d: string) { setDate(d); }
  function handleLoad() { onLoad(date); }
  function handlePdf() { window.open(`/api/reports/gunluk-rapor?date=${date}&format=pdf`, "_blank"); }

  /* By-company bar chart */
  const companyBars = (data?.by_company ?? []).slice(0, 12).map((c: any) => ({
    label: c.firma.length > 10 ? c.firma.slice(0, 9) + "…" : c.firma,
    value: Number(c.toplam_giris),
  }));
  const maxCompany = Math.max(...companyBars.map((b: any) => b.value), 1);

  /* By-hour bar chart */
  const hourBars = (data?.by_hour ?? []).map((h: any) => ({
    label: `${String(h.saat).padStart(2, "0")}`,
    value: Number(h.adet),
  }));
  const maxHour = Math.max(...hourBars.map((b: any) => b.value), 1);

  const s = data?.summary;
  const trend = s && s.prev_total > 0
    ? Math.round(((s.total_arrivals - s.prev_total) / s.prev_total) * 100)
    : null;

  return (
    <div className="space-y-6">
      {/* Filtre */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Günlük Giriş Kontrol Raporu — Yönetici Özeti</p>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Tarih</label>
            <input type="date" value={date} max={todayVal}
              onChange={e => handleDateChange(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none [color-scheme:dark]" />
          </div>
          <button onClick={handleLoad} disabled={loading}
            className="bg-white hover:bg-zinc-100 text-zinc-950 text-sm font-semibold px-6 py-2 rounded-lg disabled:opacity-50 transition-colors">
            {loading ? "Getiriliyor…" : "Raporu Getir"}
          </button>
          {data && (
            <button onClick={handlePdf}
              className="flex items-center gap-2 bg-red-700 hover:bg-red-600 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors">
              ⬇ PDF İndir
            </button>
          )}
          {data && (
            <span className="text-xs text-zinc-500">{new Date(data.date + "T00:00:00").toLocaleDateString("tr-TR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</span>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-24 text-zinc-500 gap-2 text-sm">
          <span className="animate-spin">⟳</span> Rapor hazırlanıyor…
        </div>
      )}

      {!loading && !data && (
        <div className="flex flex-col items-center justify-center py-24 text-zinc-600 text-sm gap-3">
          <span className="text-4xl">📋</span>
          <span>Tarih seçip <strong className="text-zinc-400">Raporu Getir</strong> butonuna basın</span>
        </div>
      )}

      {data && !loading && (
        <>
          {/* ── Özet Kartlar ──────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1">
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Toplam Giriş</p>
              <p className="text-3xl font-bold text-white">{s?.total_arrivals ?? 0}</p>
              {trend !== null && (
                <p className={`text-xs font-semibold ${trend >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}% dün ({s.prev_total})'e göre
                </p>
              )}
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1">
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Firma Sayısı</p>
              <p className="text-3xl font-bold text-blue-400">{s?.company_count ?? 0}</p>
              <p className="text-xs text-zinc-500">giriş yapan</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1">
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Araç Sayısı</p>
              <p className="text-3xl font-bold text-amber-400">{s?.vehicle_count ?? 0}</p>
              <p className="text-xs text-zinc-500">farklı araç</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1">
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Yoğun Saat</p>
              <p className="text-3xl font-bold text-purple-400">
                {s?.peak_hour != null ? `${String(s.peak_hour).padStart(2, "0")}:00` : "—"}
              </p>
              <p className="text-xs text-zinc-500">en çok giriş</p>
            </div>
          </div>

          {/* ── Grafikler ─────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Firma bazlı bar chart */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">Firma Bazlı Giriş Dağılımı</p>
              {companyBars.length > 0 ? (
                <div className="overflow-x-auto">
                  <BarChart data={companyBars} maxVal={maxCompany} color="#60a5fa" />
                </div>
              ) : (
                <p className="text-zinc-600 text-sm py-8 text-center">Veri yok</p>
              )}
            </div>

            {/* Saatlik bar chart */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">Saatlik Giriş Dağılımı (06:00–20:00)</p>
              {hourBars.some((b: any) => b.value > 0) ? (
                <div className="overflow-x-auto">
                  <BarChart data={hourBars} maxVal={maxHour} color="#a78bfa" />
                </div>
              ) : (
                <p className="text-zinc-600 text-sm py-8 text-center">Veri yok</p>
              )}
            </div>
          </div>

          {/* ── Firma Bazlı Tablo ─────────────────────────────────── */}
          {data.by_company.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-zinc-800">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Firma Bazlı Detay</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      {["Firma", "Toplam Giriş", "Farklı Araç", "İlk Giriş", "Son Giriş", "Güzergahlar"].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_company.map((row: any, i: number) => (
                      <tr key={i} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${i === data.by_company.length - 1 ? "border-b-0" : ""}`}>
                        <td className="px-4 py-3 text-white font-semibold">{row.firma}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-900 text-blue-200 text-sm font-bold">{row.toplam_giris}</span>
                        </td>
                        <td className="px-4 py-3 text-zinc-300 text-center">{row.farkli_arac}</td>
                        <td className="px-4 py-3 text-emerald-400 font-mono text-xs">{row.ilk_giris ?? "—"}</td>
                        <td className="px-4 py-3 text-zinc-400 font-mono text-xs">{row.son_giris ?? "—"}</td>
                        <td className="px-4 py-3 text-zinc-500 text-xs max-w-[200px] truncate">{row.guzergahlar || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Tüm Giriş Kayıtları ──────────────────────────────── */}
          {data.detail.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Tüm Giriş Kayıtları</p>
                <span className="text-xs text-zinc-600">{data.detail.length} kayıt</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      {["Saat", "Firma", "Plaka", "Güzergah", "Not"].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.detail.map((row: any, i: number) => (
                      <tr key={i} className={`border-b border-zinc-800/40 hover:bg-zinc-800/30 ${i === data.detail.length - 1 ? "border-b-0" : ""}`}>
                        <td className="px-4 py-2.5 text-purple-300 font-mono font-semibold text-xs">{row.giris_saati}</td>
                        <td className="px-4 py-2.5 text-white text-xs">{row.firma}</td>
                        <td className="px-4 py-2.5 text-zinc-300 font-mono text-xs">{row.plaka}</td>
                        <td className="px-4 py-2.5 text-zinc-500 text-xs">{row.guzergah || "—"}</td>
                        <td className="px-4 py-2.5 text-zinc-500 text-xs max-w-[160px] truncate">{row.not_ || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data.summary.total_arrivals === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-600 text-sm gap-2">
              <span className="text-3xl">🔍</span>
              <span>Bu tarihte giriş kaydı bulunamadı</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ReportTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows || rows.length === 0)
    return <div className="py-12 text-center text-zinc-600 text-sm bg-zinc-900 border border-zinc-800 rounded-xl">Veri bulunamadı</div>;
  const columns = Object.keys(rows[0]);
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
      <div className="text-xs text-zinc-500 px-4 py-2 border-b border-zinc-800">{rows.length} kayıt</div>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-zinc-800">
          {columns.map(col => <th key={col} className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">{col}</th>)}
        </tr></thead>
        <tbody>
          {rows.slice(0, 200).map((row, i) => (
            <tr key={i} className={`border-b border-zinc-800/40 hover:bg-zinc-800/30 ${i===Math.min(rows.length,200)-1?"border-b-0":""}`}>
              {columns.map(col => {
                const v = row[col]; const text = v == null || v === "" ? "—" : String(v);
                return <td key={col} className="px-4 py-2.5 text-zinc-300 text-xs whitespace-nowrap max-w-[180px] truncate">{text}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 200 && <div className="text-xs text-zinc-600 px-4 py-2 border-t border-zinc-800">İlk 200 satır gösteriliyor. Tüm veri için dışa aktarın.</div>}
    </div>
  );
}
