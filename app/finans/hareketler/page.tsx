"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { hasPermission } from "@/lib/permissions";
import { todayIstanbul } from "@/lib/time";

const KAYNAK_LABELS: Record<string, string> = {
  fatura: "Fatura", masraf: "Masraf", kasa: "Kasa/Elden", hakedis: "Hakediş", manuel: "Manuel",
};
const DURUM_LABELS: Record<string, string> = {
  taslak: "Taslak", onay_bekliyor: "Onay Bekliyor", onaylandi: "Onaylandı",
  reddedildi: "Reddedildi", iptal: "İptal",
};
const ODEME_LABELS: Record<string, string> = {
  odenmedi: "Ödenmedi", kismen_odendi: "Kısmen", odendi: "Ödendi",
};

function fmt(v: unknown): string {
  return Number(v || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(v: unknown): string {
  if (!v) return "—";
  const d = v instanceof Date ? v : new Date(v as string);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
  return d.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });
}
/** Ay başı — varsayılan filtre aralığı. */
function ayBasi(): string {
  return todayIstanbul().slice(0, 8) + "01";
}

export default function HareketlerPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [kategoriler, setKategoriler] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [dateFrom, setDateFrom] = useState(ayBasi());
  const [dateTo, setDateTo] = useState(todayIstanbul());
  const [tur, setTur] = useState("");
  const [kaynakTip, setKaynakTip] = useState("");
  const [kategoriId, setKategoriId] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data); else router.replace("/login");
    });
    fetch("/api/finans/kategori?is_active=1").then(r => r.json()).then(d => { if (d.ok) setKategoriler(d.data); });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (dateFrom) p.set("date_from", dateFrom);
      if (dateTo) p.set("date_to", dateTo);
      if (tur) p.set("tur", tur);
      if (kaynakTip) p.set("kaynak_tip", kaynakTip);
      if (kategoriId) p.set("kategori_agac_id", kategoriId);
      if (q.trim()) p.set("q", q.trim());
      const r = await fetch(`/api/finans/hareket?${p}`);
      const d = await r.json();
      if (d.ok) setRows(d.data);
    } finally { setLoading(false); }
  }, [dateFrom, dateTo, tur, kaynakTip, kategoriId, q]);

  useEffect(() => {
    if (!user) return;
    const t = setTimeout(load, q ? 350 : 0); // arama yazarken debounce
    return () => clearTimeout(t);
  }, [user, load, q]);

  const gelir = rows.filter(r => r.tur === "gelir").reduce((a, r) => a + Number(r.tutar_try || 0), 0);
  const gider = rows.filter(r => r.tur === "gider").reduce((a, r) => a + Number(r.tutar_try || 0), 0);
  const net = gelir - gider;

  if (user && !hasPermission(user, "finans_hareket:read")) {
    return (
      <>
        <Nav user={user} />
        <div className="min-h-screen bg-zinc-950 pt-16 flex items-center justify-center">
          <p className="text-zinc-500">Bu sayfayı görme yetkiniz yok.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white">Hareketler</h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              Tüm finansal hareketler tek defterde — fatura, masraf, elden ödeme, hakediş
            </p>
          </div>

          {/* Özet şerit */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
              <p className="text-xs text-zinc-500 mb-1">Gelir</p>
              <p className="text-lg font-bold text-emerald-400 tabular-nums">{fmt(gelir)} ₺</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
              <p className="text-xs text-zinc-500 mb-1">Gider</p>
              <p className="text-lg font-bold text-red-400 tabular-nums">{fmt(gider)} ₺</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
              <p className="text-xs text-zinc-500 mb-1">Net</p>
              <p className={`text-lg font-bold tabular-nums ${net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {net >= 0 ? "+" : "−"}{fmt(Math.abs(net))} ₺
              </p>
            </div>
          </div>

          {/* Filtreler */}
          <div className="flex flex-wrap gap-2 mb-4">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs px-2.5 py-2 rounded-lg focus:outline-none [color-scheme:dark]" />
            <span className="text-zinc-600 text-xs self-center">—</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs px-2.5 py-2 rounded-lg focus:outline-none [color-scheme:dark]" />

            <select value={tur} onChange={e => setTur(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs px-2.5 py-2 rounded-lg focus:outline-none">
              <option value="">Gelir + Gider</option>
              <option value="gelir">Sadece Gelir</option>
              <option value="gider">Sadece Gider</option>
            </select>

            <select value={kategoriId} onChange={e => setKategoriId(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs px-2.5 py-2 rounded-lg focus:outline-none max-w-[200px]">
              <option value="">Tüm Kategoriler</option>
              {kategoriler.map(k => (
                <option key={k.id} value={k.id}>{k.parent_id ? `   ${k.ad}` : k.ad}</option>
              ))}
            </select>

            <select value={kaynakTip} onChange={e => setKaynakTip(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs px-2.5 py-2 rounded-lg focus:outline-none">
              <option value="">Tüm Kaynaklar</option>
              {Object.entries(KAYNAK_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>

            <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Açıklama / cari ara..."
              className="flex-1 min-w-[160px] bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs px-2.5 py-2 rounded-lg focus:outline-none focus:border-zinc-600" />
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-16 animate-pulse" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-zinc-600">Bu filtrelerde hareket yok</div>
          ) : (
            <>
              <p className="text-xs text-zinc-600 mb-2">{rows.length} hareket</p>
              <div className="space-y-2">
                {rows.map(h => (
                  <div key={h.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                    <div className="flex items-start gap-2 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                        h.tur === "gelir" ? "bg-emerald-950 text-emerald-400" : "bg-red-950 text-red-400"
                      }`}>
                        {h.tur === "gelir" ? "GELİR" : "GİDER"}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 shrink-0">
                        {KAYNAK_LABELS[h.kaynak_tip] || h.kaynak_tip}
                      </span>
                      <span className="text-sm text-white font-medium">{h.cari_unvan || "—"}</span>
                      <span className="text-xs text-zinc-500">{fmtDate(h.tarih)}</span>
                      <span className={`text-sm font-bold tabular-nums ml-auto ${
                        h.tur === "gelir" ? "text-emerald-400" : "text-red-400"
                      }`}>
                        {fmt(h.tutar_try)} ₺
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-1.5 flex-wrap text-xs">
                      {h.kategori_ad && (
                        <span className="text-zinc-400">
                          {h.kategori_ust_ad ? `${h.kategori_ust_ad} › ` : ""}{h.kategori_ad}
                        </span>
                      )}
                      {h.arac_plaka && <span className="text-zinc-500 font-mono">{h.arac_plaka}</span>}
                      {h.firma_ad && <span className="text-zinc-500">{h.firma_ad}</span>}
                      {h.departman_ad && <span className="text-zinc-600">{h.departman_ad}</span>}
                      {h.personel_ad && <span className="text-zinc-600">{h.personel_ad}</span>}
                      <span className={`px-1.5 py-0.5 rounded ${
                        h.odeme_durumu === "odendi" ? "bg-emerald-950/60 text-emerald-500"
                          : h.odeme_durumu === "kismen_odendi" ? "bg-amber-950/60 text-amber-500"
                          : "bg-zinc-800 text-zinc-500"
                      }`}>
                        {ODEME_LABELS[h.odeme_durumu] || h.odeme_durumu}
                      </span>
                      {h.durum !== "onaylandi" && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-500">
                          {DURUM_LABELS[h.durum] || h.durum}
                        </span>
                      )}
                    </div>

                    {h.aciklama && <p className="text-xs text-zinc-600 mt-1 truncate">{h.aciklama}</p>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
