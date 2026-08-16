"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Nav from "@/components/Nav";
import Badge from "@/components/Badge";
import { isAtLeastLevel } from "@/lib/permissions";
import { todayIstanbul } from "@/lib/time";

const STATUS_OPTIONS = [
  { value: "", label: "Tümü" },
  { value: "draft", label: "Taslak" },
  { value: "submitted", label: "Onay Bekliyor" },
  { value: "returned", label: "İade" },
  { value: "approved", label: "Onaylandı" },
];

const DAYS_TR = ["Paz", "Pzt", "Sal", "Çrş", "Per", "Cum", "Cmt"];
const MONTHS_TR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

function todayStr() { return todayIstanbul(); }
function nDaysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}
function getMonday(dateStr?: string) {
  const d = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}
function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + "T00:00:00"); d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}
function formatDate(s: string) {
  const d = new Date(s + "T00:00:00");
  return `${DAYS_TR[d.getDay()]} ${d.getDate()} ${MONTHS_TR[d.getMonth()]}`;
}
function isLate(w: any) {
  return w.submitted_at && new Date(w.submitted_at).getHours() >= 22;
}

function buildEvaluation(data: any) {
  const { totalUsers, submitted, approved, returned, notStarted, issueCount, lateCount } = data;
  const sentTotal = submitted + approved + returned;
  const parts: string[] = [];
  if (notStarted > 0)  parts.push(`${notStarted} kişi henüz göndermedi`);
  if (returned > 0)    parts.push(`${returned} günlük iade edildi`);
  if (issueCount > 0)  parts.push(`${issueCount} sorun bildirimi var`);
  if (lateCount > 0)   parts.push(`${lateCount} geç gönderim`);
  if (parts.length === 0) {
    if (totalUsers === 0) return "Bugün kayıt yok.";
    return `Bugün ${sentTotal}/${totalUsers} günlük sorunsuz tamamlandı — genel durum iyi.`;
  }
  return `Bugün ${sentTotal}/${totalUsers} günlük gönderildi; ${parts.join(", ")}.`;
}

export default function GunlukListPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [worklogs, setWorklogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(nDaysAgo(1));
  const [dateTo, setDateTo] = useState(todayStr());
  const [statusFilter, setStatusFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [showNotSubmitted, setShowNotSubmitted] = useState(false);
  const [tab, setTab] = useState<"liste" | "takvim" | "rapor">("liste");
  const [calWeek, setCalWeek] = useState(getMonday());
  const [rapor, setRapor] = useState<any>(null);
  const [raporLoading, setRaporLoading] = useState(false);

  const today = todayStr();
  const isManager = !!user && isAtLeastLevel(user.hierarchyLevel ?? -1, "yonetici");
  const isAtLeastYetkili = !!user && isAtLeastLevel(user.hierarchyLevel ?? -1, "yetkili");

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => { if (d.ok) setUser(d.data); else router.replace("/login"); }).catch(() => { router.replace("/login"); });
  }, []);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (statusFilter) p.set("status", statusFilter);
      if (dateFrom)     p.set("startDate", dateFrom);
      if (dateTo)       p.set("endDate", dateTo);
      if (userFilter)   p.set("userId", userFilter);
      const res = await fetch(`/api/worklogs?${p}`);
      const d = await res.json();
      if (d.ok) setWorklogs(d.data);
    } finally { setLoading(false); }
  }, [user, dateFrom, dateTo, statusFilter, userFilter]);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await fetch("/api/worklogs/today-summary");
      const d = await res.json();
      if (d.ok) setSummary(d.data);
    } finally { setSummaryLoading(false); }
  }, []);

  const loadRapor = useCallback(async () => {
    setRaporLoading(true);
    try {
      const p = new URLSearchParams();
      if (dateFrom) p.set("date_from", dateFrom);
      if (dateTo) p.set("date_to", dateTo);
      const res = await fetch(`/api/reports/gunluk-sorular?${p}`);
      const d = await res.json();
      if (d.ok) setRapor(d.data);
    } finally { setRaporLoading(false); }
  }, [dateFrom, dateTo]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (isManager) loadSummary(); }, [isManager, loadSummary]);
  useEffect(() => { if (isManager && tab === "rapor") loadRapor(); }, [isManager, tab, loadRapor]);

  async function deleteWorklog(w: any) {
    if (!confirm(`${w.user_name ? `"${w.user_name}" kullanıcısının ` : ""}${formatDate(w.work_date)} günlüğü silinsin mi?`)) return;
    setDeleting(w.id);
    try {
      const qs = (isAtLeastYetkili && w.user_id !== user.id) ? `?userId=${w.user_id}` : "";
      const res = await fetch(`/api/worklogs/${w.work_date}${qs}`, { method: "DELETE" });
      const d = await res.json();
      if (d.ok) {
        setWorklogs(prev => prev.filter(x => x.id !== w.id));
        if (isManager) loadSummary();
      } else { alert(d.error || "Silme başarısız"); }
    } finally { setDeleting(null); }
  }

  async function bulkApprove() {
    const pending = worklogs.filter(w => w.status_code === "submitted");
    if (pending.length === 0) return;
    if (!confirm(`${pending.length} günlük onaylansın mı?`)) return;
    setBulkApproving(true);
    try {
      await Promise.all(pending.map(w =>
        fetch(`/api/worklogs/${w.work_date}?userId=${w.user_id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status_code: "approved" }),
        })
      ));
      await loadData();
      if (isManager) loadSummary();
    } finally { setBulkApproving(false); }
  }

  function resetFilters() {
    setDateFrom(nDaysAgo(1));
    setDateTo(todayStr());
    setStatusFilter("");
    setUserFilter("");
  }

  const todayWorklog = worklogs.find(w => w.work_date === today && w.user_id === user?.id);
  const pendingCount = worklogs.filter(w => w.status_code === "submitted").length;

  const dropdownUsers: { id: string; full_name: string }[] = summary?.allUsers
    ?? Array.from(
      new Map(worklogs.map(w => [w.user_id, { id: w.user_id, full_name: w.user_name }])).values()
    );

  const statusBadgeColor = summary
    ? (summary.notStarted === 0 && summary.returned === 0
        ? "bg-emerald-950 border-emerald-800 text-emerald-300"
        : (summary.notStarted > 2 || summary.returned > 1)
          ? "bg-red-950 border-red-800 text-red-300"
          : "bg-amber-950 border-amber-800 text-amber-300")
    : "";
  const statusBadgeLabel = summary
    ? (summary.notStarted === 0 && summary.returned === 0 ? "✓ İyi" : summary.notStarted > 2 ? "⚠ Dikkat" : "~ Normal")
    : "";

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Günlük İşler</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{worklogs.length} kayıt</p>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            {/* Tab switcher */}
            <div className="flex gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
              <button onClick={() => setTab("liste")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === "liste" ? "bg-white text-zinc-950" : "text-zinc-400 hover:text-white"}`}>
                Liste
              </button>
              {isManager && (
                <button onClick={() => { setTab("takvim"); setDateFrom(calWeek); setDateTo(addDays(calWeek, 6)); }}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === "takvim" ? "bg-white text-zinc-950" : "text-zinc-400 hover:text-white"}`}>
                  Takvim
                </button>
              )}
              {isManager && (
                <button onClick={() => setTab("rapor")}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === "rapor" ? "bg-white text-zinc-950" : "text-zinc-400 hover:text-white"}`}>
                  Rapor
                </button>
              )}
            </div>
            {isManager && pendingCount > 0 && (
              <button
                onClick={bulkApprove}
                disabled={bulkApproving}
                className="bg-emerald-900 hover:bg-emerald-800 text-emerald-200 text-sm font-semibold px-4 py-2 rounded-lg border border-emerald-800 transition-colors disabled:opacity-50"
              >
                {bulkApproving ? "Onaylanıyor..." : `Tümünü Onayla (${pendingCount})`}
              </button>
            )}
            <Link
              href={`/gunluk/${today}`}
              className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors"
            >
              {todayWorklog ? "Bugünü Düzenle" : "Bugün Oluştur"}
            </Link>
          </div>
        </div>

        {/* Today Summary — manager only */}
        {isManager && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-5">
            {summaryLoading || !summary ? (
              <div className="text-zinc-600 text-sm">Bugünün özeti yükleniyor...</div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    Bugün &mdash;{" "}
                    {new Date(summary.date + "T00:00:00").toLocaleDateString("tr-TR", {
                      weekday: "long", day: "numeric", month: "long",
                    })}
                  </p>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${statusBadgeColor}`}>
                    {statusBadgeLabel}
                  </span>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-4">
                  {[
                    { label: "Gönderilen", value: summary.submitted + summary.approved + summary.returned, suffix: `/${summary.totalUsers}`, color: "text-blue-300" },
                    { label: "Onaylanan",  value: summary.approved,    color: "text-emerald-300" },
                    { label: "Bekliyor",   value: summary.submitted,   color: "text-zinc-300" },
                    { label: "Sorun",  value: summary.issueCount, color: summary.issueCount > 0 ? "text-amber-300" : "text-zinc-600" },
                    { label: "Geç",    value: summary.lateCount,  color: summary.lateCount  > 0 ? "text-orange-300" : "text-zinc-600" },
                  ].map((s: any) => (
                    <div key={s.label} className="bg-zinc-800/60 rounded-lg px-3 py-2.5 text-center">
                      <p className={`text-xl font-bold tabular-nums ${s.color}`}>
                        {s.value}
                        {s.suffix && <span className="text-zinc-600 text-sm font-normal">{s.suffix}</span>}
                      </p>
                      <p className="text-zinc-600 text-xs mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>

                <p className="text-zinc-300 text-sm italic mb-3">
                  &ldquo;{buildEvaluation(summary)}&rdquo;
                </p>

                {summary.notSubmittedUsers?.length > 0 && (
                  <div>
                    <button
                      onClick={() => setShowNotSubmitted(v => !v)}
                      className="flex items-center gap-2 text-xs text-zinc-500 hover:text-white transition-colors"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                      {summary.notSubmittedUsers.length} kişi henüz göndermedi
                      <span className="text-zinc-700">{showNotSubmitted ? "▲" : "▼"}</span>
                    </button>
                    {showNotSubmitted && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {summary.notSubmittedUsers.map((u: any) => (
                          <span key={u.id} className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-400 px-2.5 py-1 rounded-full">
                            {u.full_name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Filters + List — only in Liste tab */}
        {tab === "liste" && (<>

        {/* Filters */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-5">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Başlangıç</label>
              <input
                type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Bitiş</label>
              <input
                type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]"
              />
            </div>
            {isAtLeastYetkili && dropdownUsers.length > 0 && (
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Kişi</label>
                <select
                  value={userFilter} onChange={e => setUserFilter(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500"
                >
                  <option value="">Tümü</option>
                  {dropdownUsers.map((u: any) => (
                    <option key={u.id} value={u.id}>{u.full_name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Durum</label>
              <div className="flex gap-1 flex-wrap">
                {STATUS_OPTIONS.map(o => (
                  <button
                    key={o.value}
                    onClick={() => setStatusFilter(o.value)}
                    className={`text-xs font-medium px-3 py-2 rounded-lg transition-colors ${
                      statusFilter === o.value
                        ? "bg-white text-zinc-950"
                        : "bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={resetFilters}
              className="text-xs text-zinc-600 hover:text-white transition-colors pb-2"
            >
              Sıfırla
            </button>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-24 text-zinc-600 text-sm">Yükleniyor...</div>
        ) : worklogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-zinc-600 text-sm mb-4">Bu aralıkta kayıt bulunamadı</p>
            <Link
              href={`/gunluk/${today}`}
              className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors"
            >
              Bugün Oluştur
            </Link>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            {worklogs.map((w, i) => {
              const canDelete = isManager || (w.user_id === user?.id && w.status_code === "draft");
              const detailHref = `/gunluk/${w.work_date}${(isAtLeastYetkili && w.user_id !== user?.id) ? `?userId=${w.user_id}` : ""}`;
              return (
                <div
                  key={w.id}
                  className={`flex items-center gap-3 px-4 py-3.5 hover:bg-zinc-800/40 transition-colors ${
                    i < worklogs.length - 1 ? "border-b border-zinc-800/50" : ""
                  }`}
                >
                  <div className="w-20 flex-shrink-0">
                    <p className={`text-sm font-semibold ${w.work_date === today ? "text-white" : "text-zinc-300"}`}>
                      {formatDate(w.work_date)}
                    </p>
                    {w.work_date === today && <p className="text-xs text-blue-400 font-medium">Bugün</p>}
                  </div>

                  {isAtLeastYetkili && (
                    <div className="w-28 flex-shrink-0 hidden sm:block">
                      <p className="text-zinc-400 text-xs truncate">{w.user_name}</p>
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    {!w.summary?.trim() && (w.status_code === "submitted" || w.status_code === "approved") ? (
                      <span className="text-emerald-400 text-xs font-medium flex items-center gap-1">✓ Sorunsuz</span>
                    ) : w.summary?.trim() ? (
                      <p className="text-zinc-300 text-sm truncate">{w.summary}</p>
                    ) : (
                      <p className="text-zinc-600 text-sm italic">Açıklama yok</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isLate(w) && (
                      <span className="hidden sm:inline text-xs font-semibold text-amber-400 bg-amber-950 border border-amber-800 px-2 py-0.5 rounded">
                        Geç
                      </span>
                    )}
                    <Badge status={w.status_code} showLabel />
                    <Link
                      href={detailHref}
                      className="text-zinc-600 hover:text-white text-sm transition-colors px-1"
                      title="Görüntüle"
                    >
                      →
                    </Link>
                    {canDelete && (
                      <button
                        onClick={() => deleteWorklog(w)}
                        disabled={deleting === w.id}
                        className="text-zinc-700 hover:text-red-400 text-sm transition-colors disabled:opacity-40 px-1"
                        title="Sil"
                      >
                        {deleting === w.id ? "···" : "✕"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </>)}

        {/* Calendar tab */}
        {tab === "takvim" && isManager && (() => {
          const weekDates = Array.from({ length: 7 }, (_, i) => addDays(calWeek, i));
          const worklogMap = new Map<string, any>();
          worklogs.forEach(w => worklogMap.set(`${w.user_id}_${w.work_date}`, w));
          const users = dropdownUsers.length > 0 ? dropdownUsers : Array.from(new Map(worklogs.map(w => [w.user_id, { id: w.user_id, full_name: w.user_name }])).values());
          const DAY_LABELS = ["Pzt", "Sal", "Çrş", "Per", "Cum", "Cmt", "Paz"];
          function cellColor(s: string | undefined) {
            if (!s) return "bg-zinc-800/40 text-zinc-700";
            if (s === "approved") return "bg-emerald-950 text-emerald-400 border border-emerald-900";
            if (s === "submitted") return "bg-blue-950 text-blue-400 border border-blue-900";
            if (s === "returned") return "bg-orange-950 text-orange-400 border border-orange-900";
            return "bg-zinc-800 text-zinc-500 border border-zinc-700";
          }
          function cellLabel(s: string | undefined) {
            if (!s) return "—";
            if (s === "approved") return "✓";
            if (s === "submitted") return "Bekl.";
            if (s === "returned") return "İade";
            return "Taslak";
          }
          return (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <button onClick={() => { const prev = addDays(calWeek, -7); setCalWeek(prev); setDateFrom(prev); setDateTo(addDays(prev, 6)); }}
                  className="text-zinc-500 hover:text-white text-lg px-2 py-1 rounded hover:bg-zinc-800 transition-colors">←</button>
                <span className="text-sm text-zinc-300 font-medium">
                  {new Date(calWeek + "T00:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "long" })}
                  {" — "}
                  {new Date(addDays(calWeek, 6) + "T00:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
                </span>
                <button onClick={() => { const next = addDays(calWeek, 7); setCalWeek(next); setDateFrom(next); setDateTo(addDays(next, 6)); }}
                  className="text-zinc-500 hover:text-white text-lg px-2 py-1 rounded hover:bg-zinc-800 transition-colors">→</button>
                <button onClick={() => { const m = getMonday(); setCalWeek(m); setDateFrom(m); setDateTo(addDays(m, 6)); }}
                  className="ml-2 text-xs text-zinc-600 hover:text-white px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-colors">
                  Bu Hafta
                </button>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
                <table className="w-full text-sm border-collapse min-w-[600px]">
                  <thead>
                    <tr>
                      <th className="text-left px-4 py-3 text-zinc-500 text-xs font-semibold uppercase tracking-wider border-b border-zinc-800 w-36">Personel</th>
                      {weekDates.map((d, i) => (
                        <th key={d} className={`px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider border-b border-zinc-800 ${d === today ? "text-blue-400" : "text-zinc-500"}`}>
                          <p>{DAY_LABELS[i]}</p>
                          <p className="font-normal normal-case mt-0.5">{new Date(d + "T00:00:00").getDate()}</p>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u: any, ri: number) => (
                      <tr key={u.id} className={ri < users.length - 1 ? "border-b border-zinc-800/50" : ""}>
                        <td className="px-4 py-3 text-zinc-300 text-xs font-medium truncate max-w-[9rem]">{u.full_name}</td>
                        {weekDates.map(d => {
                          const w = worklogMap.get(`${u.id}_${d}`);
                          const href = `/gunluk/${d}?userId=${u.id}`;
                          return (
                            <td key={d} className={`px-2 py-2 text-center ${d === today ? "bg-blue-950/10" : ""}`}>
                              {w ? (
                                <Link href={href}
                                  className={`inline-block text-xs px-2 py-1 rounded-lg font-medium transition-opacity hover:opacity-80 ${cellColor(w.status_code)}`}>
                                  {cellLabel(w.status_code)}
                                </Link>
                              ) : (
                                <span className="text-zinc-700 text-xs">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr><td colSpan={8} className="px-4 py-12 text-center text-zinc-600 text-sm">Bu haftaya ait veri yok</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {tab === "rapor" && isManager && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 items-center">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 text-white text-sm px-3 py-1.5 rounded-lg focus:outline-none focus:border-zinc-600" />
              <span className="text-zinc-600 text-sm">—</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 text-white text-sm px-3 py-1.5 rounded-lg focus:outline-none focus:border-zinc-600" />
              <button onClick={loadRapor} disabled={raporLoading}
                className="bg-zinc-800 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-zinc-700 disabled:opacity-50 transition-colors">
                {raporLoading ? "..." : "Yenile"}
              </button>
            </div>

            {raporLoading ? (
              <div className="py-16 text-center text-zinc-600 text-sm">Yükleniyor...</div>
            ) : !rapor || rapor.sorular.length === 0 ? (
              <div className="py-16 text-center text-zinc-600 text-sm">Bu aralıkta veri yok veya soru tanımlı değil</div>
            ) : (
              <div className="space-y-3">
                <p className="text-zinc-500 text-sm">{rapor.toplamGunlukSayisi} günlük kaydı bu aralıkta</p>
                {rapor.sorular.map((s: any) => (
                  <div key={s.soru_id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-white text-sm font-semibold">{s.label}</p>
                      <span className="text-xs text-zinc-500">{s.cevaplanan}/{s.toplam} cevaplandı</span>
                    </div>
                    {s.dagilim.length > 0 && (
                      <div className="space-y-1.5">
                        {s.dagilim.map((d: any) => {
                          const pct = s.cevaplanan > 0 ? Math.round((d.adet / s.cevaplanan) * 100) : 0;
                          return (
                            <div key={d.label}>
                              <div className="flex items-center justify-between text-xs mb-0.5">
                                <span className="text-zinc-400">{d.label}</span>
                                <span className="text-zinc-500 tabular-nums">{d.adet} · %{pct}</span>
                              </div>
                              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                <div className="h-full bg-zinc-500 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
