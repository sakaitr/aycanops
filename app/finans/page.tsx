"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { hasPermission } from "@/lib/permissions";
import { todayIstanbul } from "@/lib/time";

function firstOfMonth() {
  const [y, m] = todayIstanbul().split("-");
  return `${y}-${m}-01`;
}

export default function FinansDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [ozet, setOzet] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => { if (d.ok) setUser(d.data); else router.replace("/login"); }).catch(() => router.replace("/login"));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ date_from: firstOfMonth(), date_to: todayIstanbul() });
    Promise.all([
      fetch(`/api/finans/hareket/ozet?${params.toString()}`).then(r => r.json()),
      fetch("/api/finans/gider").then(r => r.json()),
    ]).then(([ozetRes, giderRes]) => {
      if (ozetRes.ok) setOzet(ozetRes.data);
      if (giderRes.ok) setRecent(giderRes.data.slice(0, 6));
    }).finally(() => setLoading(false));
  }, []);

  const giderToplam = ozet?.toplam?.find((t: any) => t.tur === "gider");
  const taslakBekleyen = ozet?.bekleyen?.find((t: any) => t.tur === "gider");
  // /api/finans/hareket/ozet her satırda alt_id döndürür (top-level
  // kategorilerde bile kendi id'sini taşır) — bu yüzden üst kategori
  // toplamını görmek için alt kategorileri ust_id'ye göre gruplamak gerekir.
  const kategoriGiderMap = new Map<string, { ust_id: string; ust_ad: string; toplam: number; adet: number }>();
  for (const k of (ozet?.kategori || [])) {
    if (k.tur !== "gider") continue;
    const key = k.ust_id || "yok";
    const existing = kategoriGiderMap.get(key);
    if (existing) { existing.toplam += Number(k.toplam); existing.adet += Number(k.adet); }
    else kategoriGiderMap.set(key, { ust_id: k.ust_id, ust_ad: k.ust_ad, toplam: Number(k.toplam), adet: Number(k.adet) });
  }
  const kategoriGider = Array.from(kategoriGiderMap.values())
    .sort((a, b) => b.toplam - a.toplam)
    .slice(0, 8);

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Finans Özeti</h1>
            <p className="text-zinc-500 text-sm mt-0.5">Bu ay · {new Date().toLocaleDateString("tr-TR", { month: "long", year: "numeric" })}</p>
          </div>
          {hasPermission(user, "finans_gider:create") && (
            <button onClick={() => router.push("/finans/gider")}
              className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors">
              + Gider Ekle
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-zinc-600 text-sm">Yükleniyor...</div>
        ) : (
          <>
            {/* Stat kartları */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Bu Ay Gider</p>
                <p className="text-white text-2xl font-bold tabular-nums">
                  {(Number(giderToplam?.toplam) || 0).toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
                <p className="text-zinc-600 text-xs mt-0.5">TL</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Kayıt Sayısı</p>
                <p className="text-white text-2xl font-bold tabular-nums">{giderToplam?.adet || 0}</p>
                <p className="text-zinc-600 text-xs mt-0.5">bu ay</p>
              </div>
              <div className={`rounded-xl p-4 border ${taslakBekleyen?.adet > 0 ? "bg-amber-950/40 border-amber-800" : "bg-zinc-900 border-zinc-800"}`}>
                <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Taslak / Bekleyen</p>
                <p className={`text-2xl font-bold tabular-nums ${taslakBekleyen?.adet > 0 ? "text-amber-400" : "text-white"}`}>{taslakBekleyen?.adet || 0}</p>
                {taslakBekleyen?.adet > 0 && (
                  <button onClick={() => router.push("/finans/gider")} className="text-amber-400 text-xs mt-0.5 hover:underline">
                    onay bekliyor →
                  </button>
                )}
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Kategori</p>
                <p className="text-white text-2xl font-bold tabular-nums">{kategoriGider.length}</p>
                <p className="text-zinc-600 text-xs mt-0.5">aktif kullanımda</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Kategori dağılımı */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <h2 className="text-sm font-bold text-white mb-4">Kategori Dağılımı</h2>
                {kategoriGider.length === 0 ? (
                  <p className="text-zinc-600 text-sm py-4 text-center">Bu ay kayıt yok</p>
                ) : (
                  <>
                  <KategoriPastaGrafik data={kategoriGider} />
                  <div className="space-y-2.5">
                    {kategoriGider.map((k: any) => {
                      const maxToplam = Number(kategoriGider[0]?.toplam) || 1;
                      const pct = Math.max(4, (Number(k.toplam) / maxToplam) * 100);
                      return (
                        <button key={k.ust_id || "yok"} onClick={() => router.push(`/finans/gider?kategori_id=${k.ust_id || ""}`)}
                          className="w-full text-left group">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-zinc-300 group-hover:text-white transition-colors">{k.ust_ad}</span>
                            <span className="text-zinc-500 tabular-nums">{Number(k.toplam).toLocaleString("tr-TR", { maximumFractionDigits: 0 })} TL · {k.adet}</span>
                          </div>
                          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div className="h-full bg-zinc-500 group-hover:bg-white transition-colors rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  </>
                )}
              </div>

              {/* Son giderler */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold text-white">Son Giderler</h2>
                  <button onClick={() => router.push("/finans/gider")} className="text-xs text-zinc-500 hover:text-white">Tümü →</button>
                </div>
                {recent.length === 0 ? (
                  <p className="text-zinc-600 text-sm py-4 text-center">Henüz kayıt yok</p>
                ) : (
                  <div className="space-y-2">
                    {recent.map((r: any) => (
                      <div key={r.id} className="flex items-center justify-between text-sm py-1.5 border-b border-zinc-800/50 last:border-0">
                        <div className="min-w-0">
                          <p className="text-zinc-300 truncate">{r.aciklama || r.belge_no || (r.tip === "fis" ? "Fiş" : "Fatura")}</p>
                          <p className="text-zinc-600 text-xs">{r.kategori_ad || "Kategorisiz"} · {new Date(r.tarih + "T00:00:00").toLocaleDateString("tr-TR")}</p>
                        </div>
                        <span className="text-white font-medium tabular-nums shrink-0 ml-2">{Number(r.tutar).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Hızlı erişim */}
            <div className="grid grid-cols-3 gap-3 mt-5">
              <button onClick={() => router.push("/finans/hareketler")}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-left hover:border-zinc-600 transition-colors">
                <p className="text-white text-sm font-semibold">Hareketler</p>
                <p className="text-zinc-500 text-xs mt-0.5">Tüm defter kayıtları</p>
              </button>
              <button onClick={() => router.push("/finans/gider")}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-left hover:border-zinc-600 transition-colors">
                <p className="text-white text-sm font-semibold">Gider</p>
                <p className="text-zinc-500 text-xs mt-0.5">Fiş/fatura girişi</p>
              </button>
              <button onClick={() => router.push("/finans/masraf-talebi")}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-left hover:border-zinc-600 transition-colors">
                <p className="text-white text-sm font-semibold">Masraf Talebi</p>
                <p className="text-zinc-500 text-xs mt-0.5">Onay bekleyen talepler</p>
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

const PASTA_RENKLER = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7", "#ec4899", "#84cc16"];

// El yapımı SVG donut/pasta grafik — projede hiçbir grafik kütüphanesi
// kullanılmıyor, mevcut dashboard'un konvansiyonuyla tutarlı (bkz. patron
// mail'i, İSTENİLEN TALEPLER — "pasta dilimleri olsun").
function KategoriPastaGrafik({ data }: { data: any[] }) {
  const total = data.reduce((s, k) => s + Number(k.toplam), 0);
  if (total <= 0) return null;
  const R = 60, CX = 80, CY = 80, C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="flex items-center gap-5 mb-5">
      <svg width={160} height={160} viewBox="0 0 160 160" className="shrink-0">
        {data.map((k, i) => {
          const frac = Number(k.toplam) / total;
          const dash = frac * C;
          const el = (
            <circle key={k.ust_id || i} r={R} cx={CX} cy={CY} fill="transparent"
              stroke={PASTA_RENKLER[i % PASTA_RENKLER.length]} strokeWidth={24}
              strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-offset}
              transform={`rotate(-90 ${CX} ${CY})`} />
          );
          offset += dash;
          return el;
        })}
      </svg>
      <div className="space-y-1.5 min-w-0">
        {data.slice(0, 8).map((k, i) => (
          <div key={k.ust_id || i} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PASTA_RENKLER[i % PASTA_RENKLER.length] }} />
            <span className="text-zinc-400 truncate">{k.ust_ad}</span>
            <span className="text-zinc-600 shrink-0 ml-auto">%{Math.round((Number(k.toplam) / total) * 100)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
