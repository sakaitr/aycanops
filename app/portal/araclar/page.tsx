"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PortalShell from "../_components/PortalShell";

function expiryColor(dateStr: string | null) {
  if (!dateStr) return "text-[var(--t-text-500)]";
  const diff = (new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return "text-red-400";
  if (diff < 30) return "text-amber-400";
  if (diff < 90) return "text-yellow-400";
  return "text-green-400";
}

function fmtExpiry(dateStr: string | null) {
  if (!dateStr) return "–";
  return new Date(dateStr).toLocaleDateString("tr-TR");
}

function fmtDate(dateStr: string | null) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("tr-TR");
}

export default function PortalAraclarPage() {
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/portal/araclar")
      .then(r => r.json())
      .then(d => {
        if (!d.ok && d.error === "Yetkisiz") { router.replace("/portal/giris"); return; }
        if (d.ok) setData(d.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  const filtered = data.filter(v =>
    !search ||
    v.plate?.toLowerCase().includes(search.toLowerCase()) ||
    v.driver_name?.toLowerCase().includes(search.toLowerCase()) ||
    v.route_name?.toLowerCase().includes(search.toLowerCase()) ||
    v.brand?.toLowerCase().includes(search.toLowerCase())
  );

  const expiringSoon = data.filter(v => {
    const fields = [v.driver_license_expiry, v.driver_src_expiry, v.driver_psiko_expiry, v.driver_health_expiry];
    return fields.some(f => {
      if (!f) return false;
      const diff = (new Date(f).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff < 30;
    });
  }).length;

  return (
    <PortalShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-[var(--foreground)]">Araçlar & Sürücüler</h1>
            <p className="text-xs text-[var(--t-text-500)] mt-0.5">
              Giriş kontrolünde kayıtlı {data.length} araç
              {expiringSoon > 0 && (
                <span className="ml-2 text-amber-400">· {expiringSoon} belgesi yakında dolacak</span>
              )}
            </p>
          </div>
          <input
            type="text"
            placeholder="Plaka / sürücü / güzergah ara..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--t-text-600)] focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)] w-52"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-[var(--t-accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-[var(--t-text-500)] text-sm bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl">
            Araç bulunamadı
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((v, i) => (
              <div key={v.id || i} className="bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl p-4">
                {/* Plaka + güzergah */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[var(--foreground)] tracking-wide">{v.plate}</span>
                      {v.status_code === 'active' && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md font-medium bg-green-400/10 text-green-400">
                          Aktif
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--t-text-400)] mt-0.5">
                      {[v.brand, v.model, v.year].filter(Boolean).join(" ")}
                      {v.capacity && <span className="ml-1 text-[var(--t-text-600)]">· {v.capacity} kişilik</span>}
                    </p>
                  </div>
                  {v.entry_count > 0 && (
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-[var(--t-text-500)]">Son giriş</p>
                      <p className="text-[11px] font-medium text-[var(--t-text-300)]">{fmtDate(v.last_seen)}</p>
                    </div>
                  )}
                </div>

                {/* Güzergah */}
                {v.route_name && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-[var(--t-text-400)]">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                    <span className="truncate">{v.route_name}</span>
                    {v.entry_count > 0 && <span className="ml-auto shrink-0 text-[var(--t-text-600)]">{v.entry_count} kayıt</span>}
                  </div>
                )}

                {/* Sürücü */}
                {v.driver_name && (
                  <div className="mt-3 bg-[var(--t-900)] rounded-lg p-3">
                    <p className="text-[10px] text-[var(--t-text-500)] mb-1">Sürücü</p>
                    <p className="text-sm font-medium text-[var(--foreground)]">{v.driver_name}</p>
                    {v.driver_phone && <p className="text-[11px] text-[var(--t-text-400)]">{v.driver_phone}</p>}
                    {v.driver_license_class && (
                      <p className="text-[10px] text-[var(--t-text-500)] mt-1">Ehliyet: {v.driver_license_class}</p>
                    )}
                  </div>
                )}

                {/* Sürücü belge tarihleri */}
                {(v.driver_license_expiry || v.driver_src_expiry || v.driver_psiko_expiry || v.driver_health_expiry) && (
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {[
                      { label: "Ehliyet", val: v.driver_license_expiry },
                      { label: "SRC", val: v.driver_src_expiry },
                      { label: "Psiko", val: v.driver_psiko_expiry },
                      { label: "Sağlık", val: v.driver_health_expiry },
                    ].filter(f => f.val).map(f => (
                      <div key={f.label} className="bg-[var(--t-900)] rounded-md px-2 py-1.5">
                        <p className="text-[10px] text-[var(--t-text-500)]">{f.label}</p>
                        <p className={`text-[11px] font-medium ${expiryColor(f.val)}`}>{fmtExpiry(f.val)}</p>
                      </div>
                    ))}
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
