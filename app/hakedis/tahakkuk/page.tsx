"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import ComboboxSearch from "@/components/ComboboxSearch";
import { toast } from "@/lib/toast";
import { hasPermission } from "@/lib/permissions";

function formatCurrency(v: number | string | null | undefined) {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(n);
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("tr-TR").format(new Date(d));
}

export default function HakedisTahakkukPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isletenler, setIsletenler] = useState<any[]>([]);
  const [isletenFilter, setIsletenFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showSummary, setShowSummary] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data);
      else router.replace("/login");
    });
    fetch("/api/isletenler?limit=500").then(r => r.json()).then(d => { if (d.ok) setIsletenler(d.data); });
  }, []);

  useEffect(() => { load(); }, [isletenFilter]);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("durum", "taslak");
      if (isletenFilter) params.set("isleten_id", isletenFilter);
      params.set("limit", "500");
      const r = await fetch(`/api/hakedis?${params}`);
      const d = await r.json();
      if (d.ok) setRows(d.data);
    } finally { setLoading(false); }
  }

  function toggle(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(rows.map(r => r.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function submitBulk() {
    setBulkSaving(true);
    try {
      const res = await fetch("/api/hakedis/tahakkuk-toplu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const d = await res.json();
      if (!d.ok) { toast.error(d.error || "Toplu tahakkuk başarısız"); return; }
      const skippedCount = d.data.skipped?.length || 0;
      toast.success(`${d.data.updated} hakediş tahakkuk ettirildi${skippedCount ? `, ${skippedCount} atlandı` : ""}`);
      setShowSummary(false);
      setSelectedIds(new Set());
      load();
    } finally { setBulkSaving(false); }
  }

  const canUpdate = hasPermission(user, "hakedis:update");
  const selectedRows = rows.filter(r => selectedIds.has(r.id));
  const toplamNet = selectedRows.reduce((sum, r) => sum + Number(r.net_tutar || 0), 0);

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-4xl mx-auto px-4 py-6">

          {/* Header */}
          <button onClick={() => router.push("/hakedis")}
            className="text-zinc-500 hover:text-white text-sm mb-4 flex items-center gap-1 transition-colors">
            ← Hakediş
          </button>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Toplu Tahakkuk</h1>
              <p className="text-zinc-500 text-sm mt-0.5">{rows.length} taslak hakediş</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <ComboboxSearch
              options={isletenler.map((i: any) => ({ value: i.id, label: i.unvan }))}
              value={isletenFilter}
              onChange={setIsletenFilter}
              placeholder="İşletene göre filtrele..."
              emptyLabel="— Tüm İşletenler —"
            />
          </div>

          {/* Select all / clear */}
          {rows.length > 0 && (
            <div className="flex items-center gap-3 mb-4 text-sm">
              <button onClick={selectAll} className="text-zinc-400 hover:text-white transition-colors">Tümünü Seç</button>
              <span className="text-zinc-700">·</span>
              <button onClick={clearSelection} className="text-zinc-400 hover:text-white transition-colors">Seçimi Temizle</button>
              <span className="text-zinc-600 ml-auto">{selectedIds.size} seçili</span>
            </div>
          )}

          {/* List */}
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-16 animate-pulse" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-zinc-600">Tahakkuk bekleyen taslak hakediş yok</div>
          ) : (
            <div className="space-y-2 mb-24">
              {rows.map(row => {
                const selected = selectedIds.has(row.id);
                return (
                  <div key={row.id} onClick={() => toggle(row.id)}
                    className={`rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer transition-colors border ${
                      selected ? "bg-indigo-950/50 border-indigo-700" : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${
                      selected ? "bg-indigo-500 border-indigo-500" : "border-zinc-700"
                    }`}>
                      {selected && <span className="text-white text-[10px] leading-none">✓</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-medium text-sm">{row.isleten_unvan}</span>
                        <span className="text-zinc-600 font-mono text-xs">{row.cari_kod}</span>
                        <span className="text-zinc-600 text-xs">{formatDate(row.donem_baslangic)} — {formatDate(row.donem_bitis)}</span>
                      </div>
                      {row.cetele_sayisi > 0 && <p className="text-zinc-600 text-xs mt-0.5">{row.cetele_sayisi} çetele bağlı</p>}
                    </div>
                    <p className="text-white font-semibold text-sm shrink-0">{formatCurrency(row.net_tutar)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Sabit alt bar */}
      {canUpdate && selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 px-4 py-3 z-40">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <div>
              <p className="text-zinc-400 text-sm">{selectedIds.size} hakediş seçili</p>
              <p className="text-white font-semibold">{formatCurrency(toplamNet)}</p>
            </div>
            <button onClick={() => setShowSummary(true)}
              className="bg-white text-zinc-950 font-semibold text-sm px-5 py-2.5 rounded-xl hover:bg-zinc-200 transition-colors">
              Tahakkuk Ettir
            </button>
          </div>
        </div>
      )}

      {/* Özet modalı */}
      {showSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => !bulkSaving && setShowSummary(false)} />
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md mx-4 space-y-4">
            <h3 className="text-white font-semibold">Toplu Tahakkuk Özeti</h3>
            <p className="text-zinc-500 text-sm">{selectedRows.length} hakediş · Toplam {formatCurrency(toplamNet)}</p>
            <div className="max-h-64 overflow-y-auto space-y-1.5 border border-zinc-800 rounded-xl p-2">
              {selectedRows.map(r => (
                <div key={r.id} className="flex items-center justify-between text-sm px-2 py-1.5 rounded-lg bg-zinc-800/50">
                  <span className="text-zinc-200 truncate">{r.isleten_unvan}</span>
                  <span className="text-white font-medium text-xs shrink-0 ml-2">{formatCurrency(r.net_tutar)}</span>
                </div>
              ))}
            </div>
            <p className="text-zinc-600 text-xs">Tahakkuk ettirilen hakedişler onay bekleyen durumuna geçer. Bu adım geri alınamaz (sadece iptal edilebilir).</p>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowSummary(false)} disabled={bulkSaving}
                className="flex-1 bg-zinc-800 text-zinc-300 text-sm py-2.5 rounded-xl disabled:opacity-50">
                Vazgeç
              </button>
              <button onClick={submitBulk} disabled={bulkSaving}
                className="flex-1 bg-amber-600 text-white font-semibold text-sm py-2.5 rounded-xl hover:bg-amber-500 disabled:opacity-50 transition-colors">
                {bulkSaving ? "İşleniyor..." : "Tahakkuk Ettir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
