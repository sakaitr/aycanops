"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import PortalShell from "../_components/PortalShell";

const DAYS_TR = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

function getMondayOf(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d;
}

function fmtDate(iso: string) {
  const [y, m, dd] = iso.split("-");
  return `${dd}.${m}.${y}`;
}

export default function PortalGirisKontrolPage() {
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(() =>
    getMondayOf(new Date()).toISOString().slice(0, 10)
  );
  const [days, setDays] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (week: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/giris-kontrol?week=${week}`);
      const d = await res.json();
      if (!d.ok && d.error === "Yetkisiz") { router.replace("/portal/giris"); return; }
      if (d.ok) { setDays(d.data.days); setRows(d.data.rows); setVehicles(d.data.vehicles); }
    } catch {} finally { setLoading(false); }
  }, [router]);

  useEffect(() => { load(weekStart); }, [weekStart, load]);

  function shiftWeek(dir: number) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + dir * 7);
    setWeekStart(d.toISOString().slice(0, 10));
  }

  function arrivalsForVehicleDay(vehicleId: string, day: string) {
    return rows.filter(r => r.vehicle_id === vehicleId && r.arrival_date === day);
  }

  const isThisWeek = weekStart === getMondayOf(new Date()).toISOString().slice(0, 10);

  // Haftalık özet hesapla
  const totalOnTime = rows.filter(r => r.arrived_at).length;
  const totalLate   = rows.filter(r => r.delayed).length;
  const pct = rows.length > 0 ? Math.round((totalOnTime / rows.length) * 100) : 0;

  return (
    <PortalShell>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-[var(--foreground)]">Giriş Kontrolleri</h1>
            <p className="text-xs text-[var(--t-text-500)] mt-0.5">Haftalık personel giriş takibi</p>
          </div>
          {rows.length > 0 && (
            <div className="flex gap-3">
              <div className="bg-green-400/10 border border-green-400/20 rounded-xl px-4 py-2 text-center">
                <div className="text-lg font-bold text-green-400">{pct}%</div>
                <div className="text-[10px] text-[var(--t-text-500)]">Dakiklik</div>
              </div>
              <div className="bg-amber-400/10 border border-amber-400/20 rounded-xl px-4 py-2 text-center">
                <div className="text-lg font-bold text-amber-400">{totalLate}</div>
                <div className="text-[10px] text-[var(--t-text-500)]">Gecikme</div>
              </div>
            </div>
          )}
        </div>

        {/* Hafta seçici */}
        <div className="flex items-center gap-3">
          <button onClick={() => shiftWeek(-1)} className="p-2 rounded-lg border border-[var(--t-border-800)] text-[var(--t-text-400)] hover:text-[var(--foreground)] transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div className="text-sm font-medium text-[var(--foreground)]">
            {days[0] ? fmtDate(days[0]) : ""} – {days[6] ? fmtDate(days[6]) : ""}
            {isThisWeek && <span className="ml-2 text-[11px] text-[var(--t-accent)] font-medium">Bu hafta</span>}
          </div>
          <button onClick={() => shiftWeek(1)} className="p-2 rounded-lg border border-[var(--t-border-800)] text-[var(--t-text-400)] hover:text-[var(--foreground)] transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>
          {!isThisWeek && (
            <button onClick={() => setWeekStart(getMondayOf(new Date()).toISOString().slice(0, 10))} className="text-xs text-[var(--t-accent)] hover:underline">
              Bugüne dön
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-[var(--t-accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[700px]">
                <thead>
                  <tr className="border-b border-[var(--t-border-800)]">
                    <th className="text-left px-3 py-3 font-medium text-[var(--t-text-500)] w-36 sticky left-0 bg-[var(--t-800)] z-10">
                      Araç
                    </th>
                    {days.map((day, i) => {
                      const today = new Date().toISOString().slice(0, 10);
                      const isToday = day === today;
                      return (
                        <th key={day} className={`text-center px-3 py-3 font-medium min-w-[80px] ${isToday ? "text-[var(--t-accent)]" : "text-[var(--t-text-500)]"}`}>
                          <div>{DAYS_TR[i]}</div>
                          <div className={`text-[10px] font-normal ${isToday ? "text-[var(--t-accent)]" : "text-[var(--t-text-600)]"}`}>
                            {day.slice(8)}.{day.slice(5, 7)}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {vehicles.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-10 text-[var(--t-text-500)]">
                        Bu firmaya ait aktif araç bulunamadı
                      </td>
                    </tr>
                  ) : vehicles.map((vehicle, vi) => (
                    <tr key={vehicle.id} className={`border-b border-[var(--t-border-800)] ${vi === vehicles.length - 1 ? "border-0" : ""}`}>
                      <td className="px-3 py-2 sticky left-0 bg-[var(--t-800)] z-10">
                        <p className="font-medium text-[var(--foreground)] text-[11px] leading-tight">{vehicle.plate}</p>
                        {vehicle.driver_name && <p className="text-[10px] text-[var(--t-text-600)]">{vehicle.driver_name}</p>}
                        {vehicle.route_name && <p className="text-[10px] text-[var(--t-text-600)]">{vehicle.route_name}</p>}
                      </td>
                      {days.map(day => {
                        const arrivals = arrivalsForVehicleDay(vehicle.id, day);
                        return (
                          <td key={day} className="px-1.5 py-2 text-center align-top">
                            {arrivals.length === 0 ? (
                              <span className="text-[var(--t-text-700)] text-[10px]">–</span>
                            ) : (
                              <div className="space-y-1">
                                {arrivals.map(a => (
                                  <div
                                    key={a.id}
                                    className={`px-1.5 py-1 rounded-md border text-[10px] leading-tight ${
                                      a.delayed
                                        ? "bg-amber-400/15 text-amber-400 border-amber-400/30"
                                        : "bg-green-400/15 text-green-400 border-green-400/30"
                                    }`}
                                  >
                                    <div className="flex items-center gap-1 justify-center">
                                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${a.delayed ? "bg-amber-400" : "bg-green-400"}`} />
                                      <span>{a.delayed ? "Gecikmeli" : "Geldi"}</span>
                                    </div>
                                    {a.arrived_at && (
                                      <div className="text-[9px] opacity-75 mt-0.5">
                                        {a.arrived_at.length > 10 ? a.arrived_at.slice(11, 16) : a.arrived_at.slice(0, 5)}
                                      </div>
                                    )}
                                    {a.shift && a.shift !== "sabah" && (
                                      <div className="text-[9px] opacity-60">{a.shift}</div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="px-4 py-3 border-t border-[var(--t-border-800)] flex flex-wrap gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-[11px] text-[var(--t-text-500)]">Geldi</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-[11px] text-[var(--t-text-500)]">Gecikmeli</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-zinc-600" />
                <span className="text-[11px] text-[var(--t-text-500)]">Bekleniyor / Yok</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </PortalShell>
  );
}
