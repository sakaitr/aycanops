"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import StatCard from "@/components/StatCard";
import Badge from "@/components/Badge";

export default function RaporlarPage() {
  const [user, setUser] = useState<any>(null);
  useEffect(() => { fetch("/api/auth/me").then(r => r.json()).then(d => { if (d.ok) setUser(d.data); }).catch(() => {}); }, []);
  const [stats, setStats] = useState<any>(null);
  const [worklogs, setWorklogs] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "worklogs" | "tickets" | "giris-kontrol">("overview");
  const [wlFilter, setWlFilter] = useState("submitted");
  const [updating, setUpdating] = useState<string | null>(null);
  const [returnNote, setReturnNote] = useState("");
  const [returnTarget, setReturnTarget] = useState<string | null>(null);

  // Giriş Kontrol Raporu state
  const [companies, setCompanies] = useState<any[]>([]);
  const [gcCompanies, setGcCompanies] = useState<string[]>([]);
  const [gcDateFrom, setGcDateFrom] = useState(() => new Date().toISOString().split("T")[0]);
  const [gcDateTo, setGcDateTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [gcRows, setGcRows] = useState<any[]>([]);
  const [gcLoading, setGcLoading] = useState(false);
  const [gcSearched, setGcSearched] = useState(false);

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    fetch("/api/companies").then(r => r.json()).then(d => { if (d.ok) setCompanies(d.data); }).catch(() => {});
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [wlRes, tcRes] = await Promise.all([
        fetch("/api/worklogs?status=submitted"),
        fetch("/api/tickets"),
      ]);
      const wld = await wlRes.json();
      const tcd = await tcRes.json();
      if (wld.ok) setWorklogs(wld.data);
      if (tcd.ok) setTickets(tcd.data);

      // Compute stats
      const open = tcd.data?.filter((t: any) => !["solved", "closed"].includes(t.status_code)).length || 0;
      const sla = tcd.data?.filter((t: any) => t.sla_due_at && new Date(t.sla_due_at) < new Date() && !["solved", "closed"].includes(t.status_code)).length || 0;
      const pending = wld.data?.length || 0;
      setStats({ open, sla, pending });
    } finally {
      setLoading(false);
    }
  }

  async function loadWorklogs(status: string) {
    try {
      const res = await fetch(`/api/worklogs?status=${status}`);
      const d = await res.json();
      if (d.ok) setWorklogs(d.data);
    } catch {}
  }

  async function loadGirisKontrol() {
    setGcLoading(true);
    setGcSearched(true);
    try {
      const params = new URLSearchParams();
      gcCompanies.forEach(id => params.append("company_id", id));
      if (gcDateFrom) params.set("date_from", gcDateFrom);
      if (gcDateTo)   params.set("date_to",   gcDateTo);
      const res = await fetch(`/api/reports/giris-kontrol?${params.toString()}`);
      const d = await res.json();
      if (d.ok) setGcRows(d.data);
    } catch {} finally {
      setGcLoading(false);
    }
  }

  function buildExportUrl() {
    const params = new URLSearchParams({ type: "giris-kontrol" });
    gcCompanies.forEach(id => params.append("company_id", id));
    if (gcDateFrom) params.set("date_from", gcDateFrom);
    if (gcDateTo)   params.set("date_to",   gcDateTo);
    return `/api/reports/export?${params.toString()}`;
  }

  async function approveWorklog(date: string, userId: string) {
    setUpdating(date);
    try {
      await fetch(`/api/worklogs/${date}?userId=${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status_code: "approved" }),
      });
      await loadWorklogs(wlFilter);
    } finally {
      setUpdating(null);
    }
  }

  async function returnWorklog(date: string) {
    if (!returnNote.trim()) return;
    setUpdating(date);
    try {
      await fetch(`/api/worklogs/${date}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status_code: "returned", manager_note: returnNote }),
      });
      setReturnTarget(null);
      setReturnNote("");
      await loadWorklogs(wlFilter);
    } finally {
      setUpdating(null);
    }
  }

  const statusGroups = {
    open: tickets.filter(t => t.status_code === "open").length,
    in_progress: tickets.filter(t => t.status_code === "in_progress").length,
    waiting: tickets.filter(t => t.status_code === "waiting").length,
    solved: tickets.filter(t => t.status_code === "solved").length,
    closed: tickets.filter(t => t.status_code === "closed").length,
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Raporlar</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Sistem genelinde istatistikler ve onay bekleyen kayıtlar</p>
        </div>

        {/* Top Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <StatCard title="Onay Bekleyen Günlük" value={stats?.pending ?? "—"} accent="blue" />
          <StatCard title="Açık Sorunlar" value={stats?.open ?? "—"} accent="amber" />
          <StatCard title="SLA İhlali" value={stats?.sla ?? "—"} subtitle="Süre aşımı" accent="red" />
        </div>

        {/* Tab nav */}
        <div className="flex border-b border-zinc-800 mb-6 gap-1">
          {([
            { key: "overview",       label: "Genel Bakış" },
            { key: "worklogs",       label: "Günlük Onayları" },
            { key: "tickets",        label: "Sorun Listesi" },
            { key: "giris-kontrol",  label: "Giriş Kontrol" },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`text-sm font-medium px-4 py-2.5 border-b-2 transition-colors -mb-px ${
                tab === t.key
                  ? "border-white text-white"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-zinc-600 text-sm">Yükleniyor...</div>
        ) : tab === "overview" ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Ticket by status */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Sorun Durumu Dağılımı</p>
              <div className="space-y-3">
                {Object.entries(statusGroups).map(([status, count]) => {
                  const total = tickets.length || 1;
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div key={status}>
                      <div className="flex items-center justify-between mb-1">
                        <Badge status={status} showLabel />
                        <span className="text-zinc-400 text-sm font-medium">{count}</span>
                      </div>
                      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-zinc-400 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Export links */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Veri Dışa Aktarma</p>
              <div className="space-y-2">
                {[
                  { href: "/api/reports/export?type=ticket", label: "Sorun Raporu", desc: "Tüm sorunları CSV olarak indir" },
                  { href: "/api/reports/export?type=worklog", label: "Günlük Raporu", desc: "Tüm iş günlüklerini CSV olarak indir" },
                  { href: "/api/reports/export?type=todo", label: "Görev Raporu", desc: "Tüm görevleri CSV olarak indir" },
                ].map(item => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="flex items-center justify-between px-4 py-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors group"
                  >
                    <div>
                      <p className="text-white text-sm font-medium group-hover:text-white">{item.label}</p>
                      <p className="text-zinc-500 text-xs mt-0.5">{item.desc}</p>
                    </div>
                    <span className="text-zinc-500 group-hover:text-white text-sm">↓</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        ) : tab === "worklogs" ? (
          <div>
            <div className="flex gap-1 mb-5">
              {[
                { value: "submitted", label: "Bekleyenler" },
                { value: "approved", label: "Onaylananlar" },
                { value: "returned", label: "İade Edilenler" },
              ].map(o => (
                <button
                  key={o.value}
                  onClick={async () => { setWlFilter(o.value); setWorklogs([]); await loadWorklogs(o.value); }}
                  className={`text-xs font-medium px-3 py-2 rounded-lg transition-colors ${
                    wlFilter === o.value ? "bg-white text-zinc-950" : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              {worklogs.length === 0 ? (
                <div className="py-16 text-center text-zinc-600 text-sm">Kayıt bulunamadı</div>
              ) : worklogs.map((w, i) => (
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
                      <button
                        onClick={() => approveWorklog(w.work_date, w.user_id)}
                        disabled={updating === w.work_date}
                        className="text-xs font-semibold px-3 py-1.5 bg-emerald-900 hover:bg-emerald-800 text-emerald-300 rounded-lg transition-colors disabled:opacity-50"
                      >
                        Onayla
                      </button>
                      <button
                        onClick={() => setReturnTarget(w.work_date)}
                        disabled={updating === w.work_date}
                        className="text-xs font-semibold px-3 py-1.5 bg-orange-950 hover:bg-orange-900 text-orange-300 rounded-lg transition-colors disabled:opacity-50"
                      >
                        İade
                      </button>
                    </div>
                  )}
                  <Link href={`/gunluk/${w.work_date}`} className="text-zinc-600 hover:text-white text-xs transition-colors flex-shrink-0">
                    Görüntüle →
                  </Link>
                </div>
              ))}
            </div>
          </div>
        ) : tab === "giris-kontrol" ? (
          <div className="space-y-6">
            {/* Filters */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Filtreler</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">
                    Firma {gcCompanies.length > 0 && <span className="text-emerald-500">({gcCompanies.length} seçili)</span>}
                  </label>
                  <div className="bg-zinc-800 border border-zinc-700 rounded-lg overflow-y-auto max-h-36">
                    {companies.map((c: any) => {
                      const id = String(c.id);
                      const checked = gcCompanies.includes(id);
                      return (
                        <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={e => setGcCompanies(prev => e.target.checked ? [...prev, id] : prev.filter(x => x !== id))}
                            className="accent-emerald-500 w-3.5 h-3.5 flex-shrink-0"
                          />
                          <span className="text-sm text-white truncate">{c.name}</span>
                        </label>
                      );
                    })}
                  </div>
                  {gcCompanies.length > 0 && (
                    <button onClick={() => setGcCompanies([])} className="mt-1 text-xs text-zinc-500 hover:text-zinc-300 underline">
                      Seçimi temizle
                    </button>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Başlangıç Tarihi</label>
                  <input
                    type="date"
                    value={gcDateFrom}
                    onChange={e => setGcDateFrom(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Bitiş Tarihi</label>
                  <input
                    type="date"
                    value={gcDateTo}
                    onChange={e => setGcDateTo(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={loadGirisKontrol}
                  disabled={gcLoading}
                  className="bg-white hover:bg-zinc-100 text-zinc-950 text-sm font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-50"
                >
                  {gcLoading ? "Getiriliyor..." : "Listele"}
                </button>
                {gcSearched && gcRows.length > 0 && (
                  <a
                    href={buildExportUrl()}
                    className="flex items-center gap-2 bg-emerald-800 hover:bg-emerald-700 text-emerald-100 text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
                  >
                    <span>↓</span> XLSX İndir ({gcRows.length} kayıt)
                  </a>
                )}
              </div>
            </div>

            {/* Preview Table */}
            {gcSearched && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
                {gcLoading ? (
                  <div className="py-16 text-center text-zinc-600 text-sm">Yükleniyor...</div>
                ) : gcRows.length === 0 ? (
                  <div className="py-16 text-center text-zinc-600 text-sm">Seçilen kriterlere uygun kayıt bulunamadı</div>
                ) : (
                  <table className="w-full text-sm min-w-[700px]">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        {["Firma", "Plaka", "Güzergah", "Tarih", "Giriş Saati", "Kaydeden", "Notlar"].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {gcRows.map((row: any, i: number) => (
                        <tr key={i} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors ${i === gcRows.length - 1 ? "border-b-0" : ""}`}>
                          <td className="px-4 py-3 text-white font-medium whitespace-nowrap">{row.firma}</td>
                          <td className="px-4 py-3 font-mono text-zinc-200 whitespace-nowrap">{row.plaka}</td>
                          <td className="px-4 py-3 text-emerald-400 text-xs whitespace-nowrap">{row.guzergah || "—"}</td>
                          <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">{row.tarih}</td>
                          <td className="px-4 py-3 text-zinc-300 whitespace-nowrap">{row.giris_saati}</td>
                          <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">{row.kaydeden || "—"}</td>
                          <td className="px-4 py-3 text-zinc-600 text-xs">{row.notlar || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Tickets tab */
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            {tickets.length === 0 ? (
              <div className="py-16 text-center text-zinc-600 text-sm">Kayıt bulunamadı</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-800">
                    {["No", "Başlık", "Öncelik", "Durum", "Atanan", "SLA"].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider first:hidden md:table-cell">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket, i) => (
                    <tr key={ticket.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors ${i === tickets.length - 1 ? "border-b-0" : ""}`}>
                      <td className="px-4 py-3"><span className="text-zinc-500 text-xs font-mono">{ticket.ticket_no}</span></td>
                      <td className="px-4 py-3">
                        <Link href={`/sorunlar/${ticket.ticket_no}`} className="text-white text-sm hover:text-zinc-300 transition-colors">{ticket.title}</Link>
                      </td>
                      <td className="px-4 py-3">{ticket.priority_code && <Badge status={ticket.priority_code} showLabel />}</td>
                      <td className="px-4 py-3"><Badge status={ticket.status_code} showLabel /></td>
                      <td className="px-4 py-3"><span className="text-zinc-400 text-xs">{ticket.assigned_name || "—"}</span></td>
                      <td className="px-4 py-3">
                        {ticket.sla_due_at ? (
                          <span className={`text-xs ${new Date(ticket.sla_due_at) < new Date() && !["solved","closed"].includes(ticket.status_code) ? "text-red-400" : "text-zinc-500"}`}>
                            {new Date(ticket.sla_due_at).toLocaleDateString("tr-TR")}
                          </span>
                        ) : <span className="text-zinc-700 text-xs">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </main>

      {/* Return Modal */}
      {returnTarget && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">İade Et</h2>
              <button onClick={() => { setReturnTarget(null); setReturnNote(""); }} className="text-zinc-600 hover:text-white text-xl leading-none">×</button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">İade Notu *</label>
              <textarea
                value={returnNote}
                onChange={e => setReturnNote(e.target.value)}
                rows={3}
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 resize-none"
                placeholder="Açıklama..."
              />
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setReturnTarget(null); setReturnNote(""); }} className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
              <button
                onClick={() => returnWorklog(returnTarget)}
                disabled={!returnNote.trim()}
                className="flex-1 bg-orange-800 hover:bg-orange-700 text-white text-sm font-semibold py-2.5 rounded-lg disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors"
              >
                İade Et
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
