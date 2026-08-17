"use client";

import { Fragment, useEffect, useState } from "react";
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
  if (!dateStr) return "–";
  return new Date(dateStr).toLocaleDateString("tr-TR");
}

export default function PortalAraclarPage() {
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

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

  function toggleExpand(id: string) {
    setExpanded(cur => (cur === id ? null : id));
  }

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
          <div className="bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[800px]">
                <thead>
                  <tr className="border-b border-[var(--t-border-800)]">
                    <th className="text-left px-3 py-3 font-medium text-[var(--t-text-500)] sticky left-0 bg-[var(--t-800)] z-10">Plaka</th>
                    <th className="text-left px-3 py-3 font-medium text-[var(--t-text-500)]">Araç</th>
                    <th className="text-left px-3 py-3 font-medium text-[var(--t-text-500)]">Sürücü</th>
                    <th className="text-left px-3 py-3 font-medium text-[var(--t-text-500)]">Güzergah</th>
                    <th className="text-left px-3 py-3 font-medium text-[var(--t-text-500)]">Son Giriş</th>
                    <th className="text-left px-3 py-3 font-medium text-[var(--t-text-500)]">Durum</th>
                    <th className="px-3 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((v, i) => {
                    const id = v.id || String(i);
                    const isOpen = expanded === id;
                    const hasDetail = v.capacity || v.year || v.driver_phone || v.driver_license_class ||
                      v.driver_license_expiry || v.driver_src_expiry || v.driver_psiko_expiry || v.driver_health_expiry;
                    return (
                      <Fragment key={id}>
                        <tr
                          onClick={() => hasDetail && toggleExpand(id)}
                          className={`border-b border-[var(--t-border-800)] ${i === filtered.length - 1 && !isOpen ? "border-0" : ""} ${hasDetail ? "cursor-pointer hover:bg-[var(--t-900)]" : ""} transition-colors`}
                        >
                          <td className="px-3 py-2.5 sticky left-0 bg-[var(--t-800)] z-10">
                            <span className="font-bold text-[var(--foreground)] tracking-wide">{v.plate}</span>
                          </td>
                          <td className="px-3 py-2.5 text-[var(--t-text-400)]">
                            {[v.brand, v.model].filter(Boolean).join(" ") || "–"}
                          </td>
                          <td className="px-3 py-2.5 text-[var(--t-text-300)]">{v.driver_name || "–"}</td>
                          <td className="px-3 py-2.5 text-[var(--t-text-400)]">{v.route_name || "–"}</td>
                          <td className="px-3 py-2.5 text-[var(--t-text-400)]">
                            {v.entry_count > 0 ? fmtDate(v.last_seen) : "–"}
                          </td>
                          <td className="px-3 py-2.5">
                            {v.status_code === "active" ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-md font-medium bg-green-400/10 text-green-400">Aktif</span>
                            ) : (
                              <span className="text-[10px] text-[var(--t-text-600)]">–</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {hasDetail && (
                              <span className={`inline-block text-[var(--t-text-500)] transition-transform ${isOpen ? "rotate-180" : ""}`}>▾</span>
                            )}
                          </td>
                        </tr>
                        {isOpen && hasDetail && (
                          <tr className={`border-b border-[var(--t-border-800)] ${i === filtered.length - 1 ? "border-0" : ""}`}>
                            <td colSpan={7} className="px-3 py-3 bg-[var(--t-900)]">
                              <div className="flex flex-wrap gap-4">
                                {(v.capacity || v.year) && (
                                  <div className="text-[11px] text-[var(--t-text-400)]">
                                    {v.year && <span>{v.year}</span>}
                                    {v.capacity && <span>{v.year ? " · " : ""}{v.capacity} kişilik</span>}
                                  </div>
                                )}
                                {v.driver_phone && (
                                  <div className="text-[11px] text-[var(--t-text-400)]">Tel: {v.driver_phone}</div>
                                )}
                                {v.driver_license_class && (
                                  <div className="text-[11px] text-[var(--t-text-400)]">Ehliyet Sınıfı: {v.driver_license_class}</div>
                                )}
                                {v.entry_count > 0 && (
                                  <div className="text-[11px] text-[var(--t-text-400)]">{v.entry_count} giriş kaydı</div>
                                )}
                              </div>
                              {(v.driver_license_expiry || v.driver_src_expiry || v.driver_psiko_expiry || v.driver_health_expiry) && (
                                <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-1.5 max-w-md">
                                  {[
                                    { label: "Ehliyet", val: v.driver_license_expiry },
                                    { label: "SRC", val: v.driver_src_expiry },
                                    { label: "Psiko", val: v.driver_psiko_expiry },
                                    { label: "Sağlık", val: v.driver_health_expiry },
                                  ].filter(f => f.val).map(f => (
                                    <div key={f.label} className="bg-[var(--t-800)] rounded-md px-2 py-1.5">
                                      <p className="text-[10px] text-[var(--t-text-500)]">{f.label}</p>
                                      <p className={`text-[11px] font-medium ${expiryColor(f.val)}`}>{fmtExpiry(f.val)}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </PortalShell>
  );
}
