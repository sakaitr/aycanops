"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { SkeletonTable } from "@/components/Skeleton";

const DOC_TYPE_LABELS: Record<string, string> = {
  muayene: "Araç Muayene",
  sigorta: "Sigorta",
  ruhsat: "Ruhsat",
  bakim: "Bakım",
  ehliyet: "Ehliyet",
  src: "SRC Belgesi",
  psikoteknik: "Psikoteknik",
  saglik: "Sağlık Raporu",
  fotograf: "Fotoğraf",
};

function daysLabel(d: number) {
  if (d < 0) return `${Math.abs(d)} gün geçti`;
  if (d === 0) return "Bugün bitiyor";
  return `${d} gün kaldı`;
}

function daysColor(d: number) {
  if (d < 0) return "text-red-400 bg-red-500/10 border-red-500/30";
  if (d <= 7) return "text-orange-400 bg-orange-500/10 border-orange-500/30";
  if (d <= 30) return "text-amber-400 bg-amber-500/10 border-amber-500/30";
  return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
}

function formatDate(d: string | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("tr-TR"); } catch { return d; }
}

type Doc = {
  id: number;
  vehicle_id: string;
  doc_type: string;
  doc_label: string | null;
  expiry_date: string;
  notes: string | null;
  plate: string;
  brand: string | null;
  model: string | null;
  company_name: string | null;
  days_remaining: number;
};

export default function BelgelerPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ full_name: string; role: string } | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [stats, setStats] = useState({ expired: 0, urgent: 0, warning: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(60);
  const [filterType, setFilterType] = useState("");
  const [filterQuery, setFilterQuery] = useState("");

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data);
      else router.replace("/login");
    }).catch(() => router.replace("/login"));
  }, [router]);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ days: String(days) });
    if (filterType) params.set("type", filterType);
    fetch(`/api/belgeler?${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) { setDocs(d.data); setStats(d.stats); }
      })
      .finally(() => setLoading(false));
  }, [days, filterType]);

  useEffect(() => { if (user) load(); }, [user, load]);

  const filtered = docs.filter(d =>
    !filterQuery || d.plate.toLowerCase().includes(filterQuery.toLowerCase()) ||
    (d.company_name || "").toLowerCase().includes(filterQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Nav user={user} />
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-white">Belge & Sertifika Takibi</h1>
            <p className="text-sm text-zinc-500 mt-0.5">Araç belgelerinin geçerlilik süresi takibi</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <select
              value={days}
              onChange={e => setDays(Number(e.target.value))}
              className="bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500"
            >
              <option value={7}>7 gün</option>
              <option value={30}>30 gün</option>
              <option value={60}>60 gün</option>
              <option value={90}>90 gün</option>
            </select>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500"
            >
              <option value="">— Tüm belge türleri —</option>
              {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Süresi Geçmiş", value: stats.expired, color: "text-red-400", bg: "bg-red-500/10 border-red-500/30" },
            { label: "Kritik (≤ 7 gün)", value: stats.urgent, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30" },
            { label: "Uyarı (≤ 30 gün)", value: stats.warning, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/30" },
            { label: `Toplam (${days} gün)`, value: stats.total, color: "text-zinc-300", bg: "bg-zinc-800/60 border-zinc-700/40" },
          ].map(s => (
            <div key={s.label} className={`rounded-xl border p-4 ${s.bg}`}>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-zinc-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filter */}
        <input
          type="text"
          value={filterQuery}
          onChange={e => setFilterQuery(e.target.value)}
          placeholder="Plaka veya firma ara..."
          className="w-full sm:w-72 bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 placeholder-zinc-600"
        />

        {/* Table */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-3">Plaka</th>
                <th className="text-left px-4 py-3">Firma</th>
                <th className="text-left px-4 py-3">Belge Türü</th>
                <th className="text-left px-4 py-3">Son Tarih</th>
                <th className="text-left px-4 py-3">Durum</th>
                <th className="text-left px-4 py-3">Not</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonTable rows={8} cols={6} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-zinc-600">
                    {stats.total === 0 ? `${days} gün içinde süresi dolacak belge yok 🎉` : "Filtrele sonucu bulunamadı"}
                  </td>
                </tr>
              ) : (
                filtered.map(doc => (
                  <tr key={doc.id} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono font-semibold text-white">{doc.plate}</span>
                      {(doc.brand || doc.model) && (
                        <p className="text-xs text-zinc-500">{[doc.brand, doc.model].filter(Boolean).join(" ")}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-300 text-xs">{doc.company_name || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full">
                        {DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}
                      </span>
                      {doc.doc_label && <p className="text-xs text-zinc-600 mt-0.5">{doc.doc_label}</p>}
                    </td>
                    <td className="px-4 py-3 text-zinc-300 text-xs whitespace-nowrap">{formatDate(doc.expiry_date)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${daysColor(doc.days_remaining)}`}>
                        {daysLabel(doc.days_remaining)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs max-w-[180px] truncate">{doc.notes || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
