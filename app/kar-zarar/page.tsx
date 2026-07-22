"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";

function formatCurrency(v: number | string | null | undefined) {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(n);
}

function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const MUTABAKAT_LABELS: Record<string, { label: string; cls: string }> = {
  bekliyor: { label: "Mutabakat bekliyor", cls: "text-amber-400" },
  onaylandi: { label: "Mutabakat onaylı", cls: "text-emerald-400" },
  itiraz: { label: "Mutabakat itirazlı", cls: "text-red-400" },
};

export default function KarZararPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [donem, setDonem] = useState(currentMonthStr());
  const [rows, setRows] = useState<any[]>([]);
  const [toplam, setToplam] = useState({ gelir: 0, gider: 0, kar: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data);
      else router.replace("/login");
    });
  }, []);

  useEffect(() => { load(); }, [donem]);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/kar-zarar?donem=${donem}`);
      const d = await r.json();
      if (d.ok) { setRows(d.data); setToplam(d.toplam); }
    } finally { setLoading(false); }
  }

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-4xl mx-auto px-4 py-6">

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Kâr-Zarar Raporu</h1>
              <p className="text-zinc-500 text-sm mt-0.5">Firma bazında gelir/gider özeti</p>
            </div>
            <input type="month" value={donem.slice(0, 7)} onChange={e => setDonem(`${e.target.value}-01`)}
              className="bg-zinc-900 border border-zinc-800 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-zinc-600 [color-scheme:dark]" />
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
              <p className="text-zinc-500 text-xs mb-1">Toplam Gelir</p>
              <p className="text-emerald-400 font-semibold text-lg">{formatCurrency(toplam.gelir)}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
              <p className="text-zinc-500 text-xs mb-1">Toplam Gider</p>
              <p className="text-red-400 font-semibold text-lg">{formatCurrency(toplam.gider)}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
              <p className="text-zinc-500 text-xs mb-1">Kâr / Zarar</p>
              <p className={`font-semibold text-lg ${toplam.kar >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {formatCurrency(toplam.kar)}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-16 animate-pulse" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-zinc-600">Bu dönem için veri yok</div>
          ) : (
            <div className="space-y-2">
              {rows.map((row: any) => {
                const kar = Number(row.gelir) - Number(row.gider);
                const mutabakatInfo = row.mutabakat_durum ? MUTABAKAT_LABELS[row.mutabakat_durum] : null;
                return (
                  <div key={row.company_id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-white font-medium text-sm">{row.company_name}</span>
                      {mutabakatInfo ? (
                        <span className={`text-xs ${mutabakatInfo.cls}`}>{mutabakatInfo.label}</span>
                      ) : (
                        <span className="text-zinc-600 text-xs">Mutabakat yok</span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-zinc-500">Gelir: <span className="text-emerald-400 font-medium">{formatCurrency(row.gelir)}</span></span>
                      <span className="text-zinc-500">Gider: <span className="text-red-400 font-medium">{formatCurrency(row.gider)}</span></span>
                      <span className={`ml-auto font-semibold ${kar >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {formatCurrency(kar)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
