"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PortalShell from "../_components/PortalShell";

const STATUS_LABELS: Record<string, string> = { active: "Aktif", inactive: "Pasif", suspended: "Askıya Alınmış" };
const TYPE_LABELS: Record<string, string> = { passenger: "Yolcu", staff: "Personel", customer: "Müşteri" };
const TYPE_COLORS: Record<string, string> = {
  passenger: "bg-blue-400/10 text-blue-400",
  staff: "bg-purple-400/10 text-purple-400",
  customer: "bg-green-400/10 text-green-400",
};
const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-400/10 text-green-400",
  inactive: "bg-zinc-400/10 text-zinc-400",
  suspended: "bg-red-400/10 text-red-400",
};

export default function PortalPersonellerPage() {
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const PER_PAGE = 20;

  useEffect(() => {
    fetch("/api/portal/personeller")
      .then(r => r.json())
      .then(d => {
        if (!d.ok && d.error === "Yetkisiz") { router.replace("/portal/giris"); return; }
        if (d.ok) setData(d.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  const filtered = data.filter(p => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (typeFilter !== "all" && p.type !== typeFilter) return false;
    if (search && !p.full_name?.toLowerCase().includes(search.toLowerCase()) && !p.phone?.includes(search)) return false;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const counts = data.reduce<Record<string, number>>((acc, p) => {
    acc[p.type] = (acc[p.type] || 0) + 1;
    return acc;
  }, {});

  return (
    <PortalShell>
      <div className="space-y-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-[var(--foreground)]">Personeller</h1>
            <p className="text-xs text-[var(--t-text-500)] mt-0.5">
              {data.length} kayıt
              {Object.entries(counts).map(([type, count]) => (
                <span key={type} className="ml-2">· {count} {TYPE_LABELS[type] || type}</span>
              ))}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="İsim / telefon ara..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--t-text-600)] focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)] w-52"
          />
          <div className="flex gap-1">
            {[["all", "Tümü"], ["active", "Aktif"], ["inactive", "Pasif"]].map(([val, label]) => (
              <button
                key={val}
                onClick={() => { setStatusFilter(val); setPage(1); }}
                className={`px-3 py-2 text-xs rounded-xl border transition-colors ${statusFilter === val ? "bg-[var(--t-accent)] text-white border-[var(--t-accent)]" : "border-[var(--t-border-800)] text-[var(--t-text-400)]"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {[["all", "Tüm Tipler"], ["passenger", "Yolcu"], ["staff", "Personel"], ["customer", "Müşteri"]].map(([val, label]) => (
              <button
                key={val}
                onClick={() => { setTypeFilter(val); setPage(1); }}
                className={`px-3 py-2 text-xs rounded-xl border transition-colors ${typeFilter === val ? "bg-[var(--t-accent)] text-white border-[var(--t-accent)]" : "border-[var(--t-border-800)] text-[var(--t-text-400)]"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-[var(--t-accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-[var(--t-text-500)] text-sm bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl">
            Kayıt bulunamadı
          </div>
        ) : (
          <>
            <div className="bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--t-border-900)] text-[var(--t-text-500)] text-xs uppercase tracking-wide">
                    <th className="px-4 py-3 text-left font-medium">Ad Soyad</th>
                    <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Telefon</th>
                    <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Güzergah</th>
                    <th className="px-4 py-3 text-left font-medium">Tip</th>
                    <th className="px-4 py-3 text-left font-medium">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((p, i) => (
                    <tr
                      key={p.id}
                      className={`border-b border-[var(--t-border-900)] last:border-0 ${i % 2 === 0 ? "" : "bg-[var(--t-900)]/30"}`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-[var(--foreground)]">{p.full_name}</p>
                        {p.notes && <p className="text-[10px] text-[var(--t-text-600)] truncate max-w-[160px]">{p.notes}</p>}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-[var(--t-text-400)] text-xs">
                        {p.phone || "–"}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-[var(--t-text-400)] text-xs">
                        {p.route_name ? (
                          <span>{p.route_name}</span>
                        ) : p.pickup_address ? (
                          <span className="truncate block max-w-[140px]">{p.pickup_address}</span>
                        ) : "–"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${TYPE_COLORS[p.type] || "bg-zinc-400/10 text-zinc-400"}`}>
                          {TYPE_LABELS[p.type] || p.type || "–"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${STATUS_COLORS[p.status] || "bg-zinc-400/10 text-zinc-400"}`}>
                          {STATUS_LABELS[p.status] || p.status || "–"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between text-xs text-[var(--t-text-400)]">
                <span>{filtered.length} kayıt · Sayfa {page}/{totalPages}</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 rounded-lg border border-[var(--t-border-800)] disabled:opacity-40"
                  >
                    ← Önceki
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 rounded-lg border border-[var(--t-border-800)] disabled:opacity-40"
                  >
                    Sonraki →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PortalShell>
  );
}
