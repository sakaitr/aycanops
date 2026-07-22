"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import PortalShell from "./_components/PortalShell";
import Link from "next/link";

function StatCard({ label, value, sub, accent }: { label: string; value: number | string; sub?: string; accent?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl p-4 border ${accent ? "bg-[var(--t-accent)]/10 border-[var(--t-accent)]/30" : "bg-[var(--t-800)] border-[var(--t-border-800)]"}`}
    >
      <p className="text-[11px] text-[var(--t-text-500)] uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent ? "text-[var(--t-accent)]" : "text-[var(--foreground)]"}`}>{value}</p>
      {sub && <p className="text-xs text-[var(--t-text-600)] mt-0.5">{sub}</p>}
    </motion.div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  planned: "Planlandı",
  active: "Aktif",
  completed: "Tamamlandı",
  cancelled: "İptal",
  delayed: "Gecikmeli",
};
const STATUS_COLOR: Record<string, string> = {
  planned: "text-blue-400 bg-blue-400/10",
  active: "text-green-400 bg-green-400/10",
  completed: "text-zinc-400 bg-zinc-400/10",
  cancelled: "text-red-400 bg-red-400/10",
  delayed: "text-amber-400 bg-amber-400/10",
};

export default function PortalDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portal/dashboard")
      .then(r => r.json())
      .then(d => {
        if (d.ok) setData(d.data);
        else if (d.error === "Yetkisiz") router.replace("/portal/giris");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  const now = new Date();
  const monthName = now.toLocaleDateString("tr-TR", { month: "long", year: "numeric" });

  return (
    <PortalShell>
      {loading || !data ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-6 h-6 border-2 border-[var(--t-accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Başlık */}
          <div>
            <h1 className="text-xl font-bold text-[var(--foreground)]">
              Hoş geldiniz, {data.user.company_name}
            </h1>
            <p className="text-sm text-[var(--t-text-500)] mt-0.5">{monthName} özeti</p>
          </div>

          {/* İstatistikler */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label="Araç" value={data.stats.vehicles} sub="Aktif araç" />
            <StatCard label="Güzergah" value={data.stats.routes} sub="Tanımlı hat" />
            <StatCard
              label="Sefer"
              value={data.stats.trips_this_month}
              sub={`${data.stats.trips_completed} tamamlandı`}
            />
            {data.stats.trips_delayed > 0 && (
              <StatCard
                label="Gecikme"
                value={data.stats.trips_delayed}
                sub="Bu ay"
                accent
              />
            )}
            <StatCard
              label="Destek"
              value={data.stats.open_tickets}
              sub="Açık talep"
              accent={data.stats.open_tickets > 0}
            />
            {data.stats.trips_this_month > 0 && (
              <StatCard
                label="Dakiklik"
                value={`%${Math.round(((data.stats.trips_this_month - data.stats.trips_delayed) / data.stats.trips_this_month) * 100)}`}
                sub="Bu ay"
              />
            )}
          </div>

          {/* Bugünkü servis durumu */}
          <div className={`rounded-2xl border p-4 ${data.today_service?.status === "attention" ? "border-amber-400/30 bg-amber-400/10" : "border-green-400/20 bg-green-400/10"}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] text-[var(--t-text-500)] uppercase tracking-wide">Bugünkü servis durumu</p>
                <h2 className="mt-1 text-lg font-semibold text-[var(--foreground)]">
                  {data.today_service?.status === "attention" ? "Dikkat gereken kayıt var" : "Operasyon normal görünüyor"}
                </h2>
                <p className="mt-1 text-xs text-[var(--t-text-500)]">{data.today_service?.date}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-xl bg-[var(--t-900)]/70 px-3 py-2 text-center">
                  <p className="text-lg font-bold text-[var(--foreground)]">{data.today_service?.planned_trips ?? 0}</p>
                  <p className="text-[10px] text-[var(--t-text-500)]">Planlı sefer</p>
                </div>
                <div className="rounded-xl bg-[var(--t-900)]/70 px-3 py-2 text-center">
                  <p className="text-lg font-bold text-green-400">{data.today_service?.arrived_vehicles ?? 0}</p>
                  <p className="text-[10px] text-[var(--t-text-500)]">Gelen araç</p>
                </div>
                <div className="rounded-xl bg-[var(--t-900)]/70 px-3 py-2 text-center">
                  <p className="text-lg font-bold text-amber-400">{data.today_service?.missing_vehicles ?? 0}</p>
                  <p className="text-[10px] text-[var(--t-text-500)]">Beklenen</p>
                </div>
                <div className="rounded-xl bg-[var(--t-900)]/70 px-3 py-2 text-center">
                  <p className="text-lg font-bold text-red-400">{data.today_service?.delayed_trips ?? 0}</p>
                  <p className="text-[10px] text-[var(--t-text-500)]">Gecikme</p>
                </div>
              </div>
            </div>
          </div>

          {/* Son Seferler */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[var(--foreground)]">Son Seferler</h2>
              <Link href="/portal/seferler" className="text-xs text-[var(--t-accent)] hover:underline">
                Tümü →
              </Link>
            </div>

            {data.recent_trips.length === 0 ? (
              <div className="text-center py-8 text-[var(--t-text-500)] text-sm bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl">
                Henüz sefer kaydı yok
              </div>
            ) : (
              <div className="bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--t-border-800)]">
                        <th className="text-left px-4 py-3 text-xs font-medium text-[var(--t-text-500)]">Tarih</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-[var(--t-text-500)]">Güzergah</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-[var(--t-text-500)]">Yön</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-[var(--t-text-500)]">Durum</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-[var(--t-text-500)]">Kalkış</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent_trips.map((t: any, i: number) => (
                        <tr
                          key={t.id}
                          className={`border-b border-[var(--t-border-800)] ${i === data.recent_trips.length - 1 ? "border-0" : ""}`}
                        >
                          <td className="px-4 py-3 text-[var(--t-text-400)] whitespace-nowrap text-xs">
                            {new Date(t.trip_date).toLocaleDateString("tr-TR")}
                          </td>
                          <td className="px-4 py-3 text-[var(--foreground)] font-medium whitespace-nowrap">
                            {t.route_name}
                            {t.route_code && <span className="ml-1 text-xs text-[var(--t-text-600)]">({t.route_code})</span>}
                          </td>
                          <td className="px-4 py-3 text-[var(--t-text-400)] text-xs">
                            {t.direction === "morning" ? "Sabah" : t.direction === "evening" ? "Akşam" : t.direction}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${STATUS_COLOR[t.status_code] ?? "text-zinc-400 bg-zinc-400/10"}`}>
                              {STATUS_LABEL[t.status_code] ?? t.status_code}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-[var(--t-text-400)]">
                            {t.actual_departure || t.planned_departure || "--"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </PortalShell>
  );
}
