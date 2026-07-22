"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import PortalShell from "../_components/PortalShell";

const DAYS_TR = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const DAYS_FULL = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

const SHIFT_LABEL: Record<string, string> = { sabah: "Sabah", aksam: "Akşam", oglen: "Öğlen" };

const STATUS_COLOR: Record<string, string> = {
  planned:   "bg-blue-400/15 text-blue-400 border-blue-400/30",
  active:    "bg-green-400/15 text-green-400 border-green-400/30",
  completed: "bg-zinc-400/15 text-zinc-400 border-zinc-400/30",
  cancelled: "bg-red-400/15 text-red-400 border-red-400/30",
  delayed:   "bg-amber-400/15 text-amber-400 border-amber-400/30",
};
const STATUS_DOT: Record<string, string> = {
  planned:   "bg-blue-400",
  active:    "bg-green-400",
  completed: "bg-zinc-400",
  cancelled: "bg-red-400",
  delayed:   "bg-amber-400",
};
const STATUS_LABEL: Record<string, string> = {
  planned:   "Planlandı",
  active:    "Aktif",
  completed: "Tamamlandı",
  cancelled: "İptal",
  delayed:   "Gecikmeli",
};

function getMondayOf(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function fmtShort(iso: string) {
  const [, m, dd] = iso.split("-");
  return `${dd}.${m}`;
}

function fmtTime(isoStr: string | null) {
  if (!isoStr) return "–";
  try {
    return new Date(isoStr).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
  } catch {
    return isoStr.slice(11, 16) || "–";
  }
}

export default function PortalSeferlerPage() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<"weekly" | "list" | "arrivals">("weekly");

  // Weekly view state
  const [weekStart, setWeekStart] = useState(() => getMondayOf(new Date()).toISOString().slice(0, 10));
  const [days, setDays] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [wLoading, setWLoading] = useState(true);

  // List view state
  const [trips, setTrips] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [lLoading, setLLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [tarih, setTarih] = useState("");
  const [durum, setDurum] = useState("");

  // Arrivals view state
  const [arrDate, setArrDate] = useState(new Date().toISOString().slice(0, 10));
  const [arrShift, setArrShift] = useState("");
  const [arrData, setArrData] = useState<{ arrived: any[]; pending: any[] } | null>(null);
  const [arrLoading, setArrLoading] = useState(false);

  const today = getMondayOf(new Date()).toISOString().slice(0, 10);
  const todayDate = new Date().toISOString().slice(0, 10);

  // Load weekly data
  const loadWeekly = useCallback((week: string) => {
    setWLoading(true);
    fetch(`/api/portal/seferler?week=${week}`)
      .then(r => r.json())
      .then(d => {
        if (!d.ok && d.error === "Yetkisiz") { router.replace("/portal/giris"); return; }
        if (d.ok && d.data) {
          setDays(d.data.days ?? []);
          setRows(d.data.rows ?? []);
        }
      })
      .catch(() => {})
      .finally(() => setWLoading(false));
  }, [router]);

  // Load list data
  const loadList = useCallback((p: number, t: string, s: string) => {
    setLLoading(true);
    const params = new URLSearchParams({ page: String(p), limit: "20" });
    if (t) params.set("tarih", t);
    if (s) params.set("durum", s);
    fetch(`/api/portal/seferler?${params}`)
      .then(r => r.json())
      .then(d => {
        if (!d.ok && d.error === "Yetkisiz") { router.replace("/portal/giris"); return; }
        if (d.ok) { setTrips(d.data ?? []); setMeta(d.meta); }
      })
      .catch(() => {})
      .finally(() => setLLoading(false));
  }, [router]);

  useEffect(() => {
    if (viewMode === "weekly") loadWeekly(weekStart);
  }, [viewMode, weekStart, loadWeekly]);

  useEffect(() => {
    if (viewMode === "list") loadList(page, tarih, durum);
  }, [viewMode, page, tarih, durum, loadList]);

  const loadArrivals = useCallback((date: string) => {
    setArrLoading(true);
    fetch(`/api/portal/seferler?arrivals=1&date=${date}`)
      .then(r => r.json())
      .then(d => {
        if (!d.ok && d.error === "Yetkisiz") { router.replace("/portal/giris"); return; }
        if (d.ok && d.data) setArrData({ arrived: d.data.arrived ?? [], pending: d.data.pending ?? [] });
      })
      .catch(() => {})
      .finally(() => setArrLoading(false));
  }, [router]);

  useEffect(() => {
    if (viewMode === "arrivals") loadArrivals(arrDate);
  }, [viewMode, arrDate, loadArrivals]);

  const prevWeek = () => setWeekStart(w => addDays(w, -7));
  const nextWeek = () => setWeekStart(w => addDays(w, 7));

  return (
    <PortalShell>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-xl font-bold text-[var(--foreground)]">Seferler</h1>
          <div className="flex items-center gap-1 bg-[var(--t-900)] rounded-xl p-1">
            <button
              onClick={() => setViewMode("weekly")}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${viewMode === "weekly" ? "bg-[var(--t-accent)] text-white" : "text-[var(--t-text-400)]"}`}
            >
              Haftalık
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${viewMode === "list" ? "bg-[var(--t-accent)] text-white" : "text-[var(--t-text-400)]"}`}
            >
              Liste
            </button>
            <button
              onClick={() => setViewMode("arrivals")}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${viewMode === "arrivals" ? "bg-[var(--t-accent)] text-white" : "text-[var(--t-text-400)]"}`}
            >
              Giriş Saatleri
            </button>
          </div>
        </div>

        {/* ── WEEKLY VIEW ── */}
        {viewMode === "weekly" && (
          <>
            {/* Week navigator */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={prevWeek}
                className="flex items-center gap-1 px-3 py-2 text-xs bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-lg text-[var(--t-text-400)] hover:text-[var(--foreground)] transition-colors"
              >
                ← Önceki
              </button>
              <span className="text-sm font-medium text-[var(--foreground)]">
                {days.length > 0 ? `${fmtShort(days[0])} – ${fmtShort(days[6])}` : ""}
              </span>
              <button
                onClick={nextWeek}
                className="flex items-center gap-1 px-3 py-2 text-xs bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-lg text-[var(--t-text-400)] hover:text-[var(--foreground)] transition-colors"
              >
                Sonraki →
              </button>
              {weekStart !== today && (
                <button
                  onClick={() => setWeekStart(today)}
                  className="px-3 py-2 text-xs text-[var(--t-accent)] border border-[var(--t-accent)]/40 rounded-lg hover:bg-[var(--t-accent)]/10 transition-colors"
                >
                  Bugüne dön
                </button>
              )}
            </div>

            {/* Weekly grid */}
            {wLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-[var(--t-accent)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse min-w-[560px]">
                  <thead>
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-medium text-[var(--t-text-500)] bg-[var(--t-800)] border border-[var(--t-border-900)] w-32 min-w-[100px]">
                        Güzergah
                      </th>
                      {days.map((day, i) => {
                        const isToday = day === todayDate;
                        return (
                          <th
                            key={day}
                            className={`px-2 py-2 text-center text-xs font-medium border border-[var(--t-border-900)] min-w-[80px] ${isToday ? "bg-[var(--t-accent)]/15 text-[var(--t-accent)]" : "bg-[var(--t-800)] text-[var(--t-text-400)]"}`}
                          >
                            <div>{DAYS_TR[i]}</div>
                            <div className={`text-[11px] font-normal ${isToday ? "text-[var(--t-accent)]" : "text-[var(--t-text-600)]"}`}>
                              {fmtShort(day)}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-10 text-[var(--t-text-500)] text-sm bg-[var(--t-900)] border border-[var(--t-border-900)]">
                          Bu haftaya ait sefer bulunamadı
                        </td>
                      </tr>
                    ) : rows.map((row: any, ri: number) => (
                      <tr key={ri} className={ri % 2 === 0 ? "bg-[var(--t-900)]" : "bg-[var(--t-800)]"}>
                        <td className="px-3 py-2 border border-[var(--t-border-900)]">
                          <p className="text-xs font-medium text-[var(--foreground)] truncate max-w-[120px]">{row.route_name}</p>
                          {row.route_code && <p className="text-[10px] text-[var(--t-text-600)]">{row.route_code}</p>}
                        </td>
                        {days.map((day) => {
                          const cell: any[] = row.trips?.[day] ?? [];
                          if (cell.length === 0) {
                            return (
                              <td key={day} className="border border-[var(--t-border-900)] px-1 py-1 text-center">
                                <span className="text-[var(--t-text-700)] text-[10px]">–</span>
                              </td>
                            );
                          }
                          return (
                            <td key={day} className="border border-[var(--t-border-900)] px-1 py-1 align-top">
                              <div className="space-y-1">
                                {cell.map((trip: any, ti: number) => (
                                  <div
                                    key={ti}
                                    className={`rounded px-1.5 py-1 border text-[10px] ${STATUS_COLOR[trip.status_code] ?? "bg-zinc-400/10 text-zinc-400 border-zinc-400/20"}`}
                                  >
                                    <div className="flex items-center gap-1">
                                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[trip.status_code] ?? "bg-zinc-400"}`} />
                                      <span className="truncate">{trip.direction === "morning" ? "Sabah" : "Akşam"}</span>
                                    </div>
                                    {trip.planned_departure && (
                                      <div className="text-[9px] opacity-70 mt-0.5">{trip.planned_departure}</div>
                                    )}
                                    {trip.vehicle_plate && (
                                      <div className="text-[9px] font-mono opacity-80 mt-0.5">{trip.vehicle_plate}</div>
                                    )}
                                    {trip.delay_minutes > 0 && (
                                      <div className="text-[9px] text-amber-400">+{trip.delay_minutes}dk</div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap gap-3 pt-1">
              {Object.entries(STATUS_LABEL).map(([key, label]) => (
                <div key={key} className="flex items-center gap-1.5 text-[11px] text-[var(--t-text-400)]">
                  <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[key]}`} />
                  {label}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── LIST VIEW ── */}
        {viewMode === "list" && (
          <>
            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              <input
                type="date"
                value={tarih}
                onChange={e => { setTarih(e.target.value); setPage(1); }}
                className="bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]"
                style={{ colorScheme: "dark" }}
              />
              <select
                value={durum}
                onChange={e => { setDurum(e.target.value); setPage(1); }}
                className="bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]"
              >
                <option value="">Tüm Durumlar</option>
                <option value="planned">Planlandı</option>
                <option value="active">Aktif</option>
                <option value="completed">Tamamlandı</option>
                <option value="cancelled">İptal</option>
                <option value="delayed">Gecikmeli</option>
              </select>
              {(tarih || durum) && (
                <button
                  onClick={() => { setTarih(""); setDurum(""); setPage(1); }}
                  className="text-xs text-[var(--t-text-400)] hover:text-[var(--foreground)] border border-[var(--t-border-800)] rounded-xl px-3 py-2"
                >
                  Temizle
                </button>
              )}
              {meta && <span className="ml-auto self-center text-xs text-[var(--t-text-500)]">Toplam {meta.total} sefer</span>}
            </div>

            {lLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-[var(--t-accent)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : trips.length === 0 ? (
              <div className="text-center py-12 text-[var(--t-text-500)] text-sm bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl">
                Sefer bulunamadı
              </div>
            ) : (
              <div className="bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="border-b border-[var(--t-border-900)]">
                        <th className="text-left px-4 py-3 text-xs font-medium text-[var(--t-text-500)]">Tarih</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-[var(--t-text-500)]">Güzergah</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-[var(--t-text-500)]">Yön</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-[var(--t-text-500)]">Durum</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-[var(--t-text-500)]">Plan / Gerçek</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-[var(--t-text-500)]">Yolcu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trips.map((t: any, i: number) => (
                        <tr key={t.id} className={`border-b border-[var(--t-border-900)] last:border-0 ${i % 2 !== 0 ? "bg-[var(--t-900)]/40" : ""}`}>
                          <td className="px-4 py-3 text-xs text-[var(--t-text-400)] whitespace-nowrap">
                            {new Date(t.trip_date).toLocaleDateString("tr-TR")}
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-xs font-medium text-[var(--foreground)]">{t.route_name}</p>
                            {t.route_code && <p className="text-[10px] text-[var(--t-text-600)]">{t.route_code}</p>}
                          </td>
                          <td className="px-4 py-3 text-xs text-[var(--t-text-400)]">
                            {t.direction === "morning" ? "Sabah" : t.direction === "evening" ? "Akşam" : t.direction}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${STATUS_COLOR[t.status_code] ?? "bg-zinc-400/10 text-zinc-400 border border-zinc-400/20"}`}>
                              {STATUS_LABEL[t.status_code] ?? t.status_code}
                            </span>
                            {t.delay_minutes > 0 && (
                              <span className="ml-1 text-[11px] text-amber-400">+{t.delay_minutes}dk</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-[var(--t-text-400)] whitespace-nowrap">
                            {t.planned_departure ?? "–"}
                            {t.actual_departure && t.actual_departure !== t.planned_departure && (
                              <span className="text-[var(--t-text-600)]"> / {t.actual_departure}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-[var(--t-text-400)]">
                            {t.passenger_count ?? "–"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {meta && meta.pages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-2 text-xs border border-[var(--t-border-800)] rounded-lg disabled:opacity-40 text-[var(--t-text-400)] hover:text-[var(--foreground)]"
                >
                  ← Önceki
                </button>
                <span className="text-xs text-[var(--t-text-500)]">{page} / {meta.pages}</span>
                <button
                  onClick={() => setPage(p => Math.min(meta.pages, p + 1))}
                  disabled={page === meta.pages}
                  className="px-3 py-2 text-xs border border-[var(--t-border-800)] rounded-lg disabled:opacity-40 text-[var(--t-text-400)] hover:text-[var(--foreground)]"
                >
                  Sonraki →
                </button>
              </div>
            )}
          </>
        )}
        {/* ── ARRIVALS VIEW ── */}
        {viewMode === "arrivals" && (
          <>
            {/* Date + shift picker */}
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="date"
                value={arrDate}
                onChange={e => setArrDate(e.target.value)}
                className="bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]"
                style={{ colorScheme: "dark" }}
              />
              <select
                value={arrShift}
                onChange={e => setArrShift(e.target.value)}
                className="bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]"
              >
                <option value="">Tüm Vardiyalar</option>
                <option value="sabah">Sabah</option>
                <option value="aksam">Akşam</option>
                <option value="oglen">Öğlen</option>
              </select>
              {arrDate !== new Date().toISOString().slice(0, 10) && (
                <button
                  onClick={() => setArrDate(new Date().toISOString().slice(0, 10))}
                  className="px-3 py-2 text-xs text-[var(--t-accent)] border border-[var(--t-accent)]/40 rounded-lg hover:bg-[var(--t-accent)]/10 transition-colors"
                >
                  Bugün
                </button>
              )}
              {arrData && (() => {
                const filteredArr = arrShift ? arrData.arrived.filter((a: any) => a.shift === arrShift) : arrData.arrived;
                return (
                  <span className="ml-auto text-xs text-[var(--t-text-500)]">
                    <span className="text-green-400 font-medium">{filteredArr.length} geldi</span>
                    {!arrShift && arrData.pending.length > 0 && (
                      <span className="text-amber-400 font-medium ml-2">{arrData.pending.length} bekleniyor</span>
                    )}
                  </span>
                );
              })()}
            </div>

            {arrLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-[var(--t-accent)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : !arrData ? null : (() => {
              const filteredArrived = arrShift ? arrData.arrived.filter((a: any) => a.shift === arrShift) : arrData.arrived;
              return (
              <div className="space-y-4">
                {/* Arrived vehicles */}
                {filteredArrived.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-green-400 mb-2 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
                      Geldi ({filteredArrived.length})
                    </h3>
                    <div className="bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[var(--t-border-900)]">
                            <th className="text-left px-4 py-2.5 text-xs font-medium text-[var(--t-text-500)]">Araç / Sürücü</th>
                            <th className="text-left px-4 py-2.5 text-xs font-medium text-[var(--t-text-500)]">Güzergah</th>
                            <th className="text-left px-4 py-2.5 text-xs font-medium text-[var(--t-text-500)]">Vardiya</th>
                            <th className="text-right px-4 py-2.5 text-xs font-medium text-[var(--t-text-500)]">Giriş Saati</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredArrived.map((a: any, i: number) => (
                            <tr key={a.id} className={`border-b border-[var(--t-border-900)] last:border-0 ${i % 2 !== 0 ? "bg-[var(--t-900)]/40" : ""}`}>
                              <td className="px-4 py-3">
                                <p className="text-xs font-bold text-[var(--foreground)] tracking-wide">{a.plate}</p>
                                {a.driver_name && <p className="text-[11px] text-[var(--t-text-400)]">{a.driver_name}</p>}
                                {(a.brand || a.model) && <p className="text-[10px] text-[var(--t-text-600)]">{[a.brand, a.model].filter(Boolean).join(" ")}</p>}
                              </td>
                              <td className="px-4 py-3">
                                <p className="text-xs text-[var(--foreground)]">{a.route_name ?? "–"}</p>
                                {a.route_code && <p className="text-[10px] text-[var(--t-text-600)]">{a.route_code}</p>}
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-[11px] px-2 py-0.5 rounded-md bg-[var(--t-900)] text-[var(--t-text-400)]">
                                  {SHIFT_LABEL[a.shift] ?? a.shift ?? "–"}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className="text-sm font-semibold text-green-400">{fmtTime(a.arrived_at)}</span>
                                {a.note && <p className="text-[10px] text-[var(--t-text-500)] mt-0.5">{a.note}</p>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Pending vehicles — only shown when no specific shift filter active */}
                {!arrShift && arrData.pending.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-amber-400 mb-2 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                      Bekleniyor ({arrData.pending.length})
                    </h3>
                    <div className="bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[var(--t-border-900)]">
                            <th className="text-left px-4 py-2.5 text-xs font-medium text-[var(--t-text-500)]">Araç / Sürücü</th>
                            <th className="text-left px-4 py-2.5 text-xs font-medium text-[var(--t-text-500)]">Güzergah</th>
                            <th className="text-right px-4 py-2.5 text-xs font-medium text-[var(--t-text-500)]">Plan. Kalkış</th>
                          </tr>
                        </thead>
                        <tbody>
                          {arrData.pending.map((p: any, i: number) => (
                            <tr key={p.route_id} className={`border-b border-[var(--t-border-900)] last:border-0 ${i % 2 !== 0 ? "bg-[var(--t-900)]/40" : ""}`}>
                              <td className="px-4 py-3">
                                <p className="text-xs font-bold text-[var(--foreground)] tracking-wide">{p.plate}</p>
                                {p.driver_name && <p className="text-[11px] text-[var(--t-text-400)]">{p.driver_name}</p>}
                              </td>
                              <td className="px-4 py-3">
                                <p className="text-xs text-[var(--foreground)]">{p.route_name}</p>
                                {p.route_code && <p className="text-[10px] text-[var(--t-text-600)]">{p.route_code}</p>}
                              </td>
                              <td className="px-4 py-3 text-right text-xs text-[var(--t-text-400)]">
                                {p.morning_departure ?? "–"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {filteredArrived.length === 0 && (arrShift || arrData.pending.length === 0) && (
                  <div className="text-center py-12 text-[var(--t-text-500)] text-sm bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl">
                    {arrShift ? `${SHIFT_LABEL[arrShift] ?? arrShift} vardiyasında kayıt bulunamadı` : "Bu tarih için kayıt bulunamadı"}
                  </div>
                )}
              </div>
              );
            })()}
          </>
        )}
      </div>
    </PortalShell>
  );
}
