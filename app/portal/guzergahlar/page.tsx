"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PortalShell from "../_components/PortalShell";
import RouteMap from "@/components/RouteMap";

const DIR_LABEL: Record<string, string> = {
  both:    "Her İki Yön",
  morning: "Sabah",
  evening: "Akşam",
};

function parseStops(value: string | null | undefined) {
  if (!value) return [];
  try { return JSON.parse(value); } catch { return []; }
}

export default function PortalGuzergahlarPage() {
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/portal/guzergahlar")
      .then(r => r.json())
      .then(d => {
        if (!d.ok && d.error === "Yetkisiz") { router.replace("/portal/giris"); return; }
        if (d.ok) setData(d.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  const filtered = search
    ? data.filter(r =>
        r.name?.toLowerCase().includes(search.toLowerCase()) ||
        r.code?.toLowerCase().includes(search.toLowerCase()) ||
        r.vehicle_plate?.toLowerCase().includes(search.toLowerCase())
      )
    : data;

  return (
    <PortalShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-[var(--foreground)]">Güzergahlar</h1>
            <p className="text-xs text-[var(--t-text-500)] mt-0.5">{data.length} hat tanımlandı</p>
          </div>
          <input
            type="text"
            placeholder="Güzergah ara..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--t-text-600)] focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)] w-48"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-[var(--t-accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-[var(--t-text-500)] text-sm bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl">
            Güzergah bulunamadı
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map(route => (
              <div key={route.id} className="bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-[var(--foreground)] text-sm">{route.name}</h3>
                      {route.code && (
                        <span className="text-[10px] bg-[var(--t-900)] border border-[var(--t-border-700)] text-[var(--t-text-400)] px-2 py-0.5 rounded-md">
                          {route.code}
                        </span>
                      )}
                      <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${route.is_active ? "bg-green-400/10 text-green-400" : "bg-zinc-400/10 text-zinc-400"}`}>
                        {route.is_active ? "Aktif" : "Pasif"}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--t-text-500)] mt-1">{DIR_LABEL[route.direction] ?? route.direction}</p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {route.morning_departure && (
                    <div className="bg-[var(--t-900)] rounded-lg p-2">
                      <p className="text-[10px] text-[var(--t-text-500)]">Sabah Kalkış</p>
                      <p className="text-sm font-medium text-[var(--foreground)]">{route.morning_departure}</p>
                      {route.morning_arrival && <p className="text-[10px] text-[var(--t-text-400)]">↓ {route.morning_arrival}</p>}
                    </div>
                  )}
                  {route.evening_departure && (
                    <div className="bg-[var(--t-900)] rounded-lg p-2">
                      <p className="text-[10px] text-[var(--t-text-500)]">Akşam Kalkış</p>
                      <p className="text-sm font-medium text-[var(--foreground)]">{route.evening_departure}</p>
                      {route.evening_arrival && <p className="text-[10px] text-[var(--t-text-400)]">↓ {route.evening_arrival}</p>}
                    </div>
                  )}
                  {(route.vehicle_plate || route.v_driver_name) && (
                    <div className="bg-[var(--t-900)] rounded-lg p-2 col-span-2">
                      <p className="text-[10px] text-[var(--t-text-500)]">Araç / Sürücü</p>
                      {route.vehicle_plate && <p className="text-sm font-medium text-[var(--foreground)]">{route.vehicle_plate}</p>}
                      {(route.v_driver_name || route.driver_name) && (
                        <p className="text-[10px] text-[var(--t-text-400)]">{route.v_driver_name || route.driver_name}</p>
                      )}
                    </div>
                  )}
                </div>

                {parseStops(route.stops_json).length >= 2 && (
                  <div className="mt-4 overflow-hidden rounded-xl border border-[var(--t-border-800)]">
                    <RouteMap stops={parseStops(route.stops_json)} routeName={route.name} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
