"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import PortalShell from "./_components/PortalShell";

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
        </div>
      )}
    </PortalShell>
  );
}
