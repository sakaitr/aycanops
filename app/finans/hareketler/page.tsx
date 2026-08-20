"use client";
import { Fragment, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { hasPermission } from "@/lib/permissions";
import { todayIstanbul } from "@/lib/time";

const KAYNAK_LABELS: Record<string, string> = {
  fatura: "Fatura", masraf: "Masraf", kasa: "Kasa/Elden", hakedis: "Hakediş", manuel: "Manuel", gider: "Gider",
};
// Kaynağı silmek için çağrılacak API + gereken izin — kasa/hakedis/manuel'in
// henüz kendi silme uçları yok (bkz. lib/finans-hareket.ts, sadece
// gider/fatura/masraf şu an gerçekten kullanılıyor).
const DELETE_CONFIG: Record<string, { url: (id: string) => string; perm: string }> = {
  gider: { url: id => `/api/finans/gider/${id}`, perm: "finans_gider:delete" },
  fatura: { url: id => `/api/finans/fatura/${id}`, perm: "finans_fatura:delete" },
  masraf: { url: id => `/api/finans/masraf-talebi/${id}`, perm: "finans_masraf_talebi:delete" },
};
const DURUM_LABELS: Record<string, string> = {
  taslak: "Taslak", onay_bekliyor: "Onay Bekliyor", onaylandi: "Onaylandı",
  reddedildi: "Reddedildi", iptal: "İptal",
};
const ODEME_LABELS: Record<string, string> = {
  odenmedi: "Ödenmedi", kismen_odendi: "Kısmen", odendi: "Ödendi",
};
// Detay çekmek için kaynağa göre tekil kayıt uç noktası — kasa/hakedis/manuel
// şu an gerçekten kullanılmıyor (bkz. DELETE_CONFIG'teki not), detay yok.
const DETAIL_CONFIG: Record<string, (id: string) => string> = {
  gider: id => `/api/finans/gider/${id}`,
  fatura: id => `/api/finans/fatura/${id}`,
  masraf: id => `/api/finans/masraf-talebi/${id}`,
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, any>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data); else router.replace("/login");
    });
    fetch("/api/finans/kategori?is_active=1&scope=me").then(r => r.json()).then(d => { if (d.ok) setKategoriler(d.data); });
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

  async function toggleExpand(row: any) {
    const key = row.id;
    if (expanded === key) { setExpanded(null); return; }
    setExpanded(key);
    if (!DETAIL_CONFIG[row.kaynak_tip] || detail[key]) return;
    setDetailLoading(key);
    try {
      const r = await fetch(DETAIL_CONFIG[row.kaynak_tip](row.kaynak_id));
      const d = await r.json();
      if (d.ok) setDetail(prev => ({ ...prev, [key]: d.data }));
    } finally { setDetailLoading(null); }
  }

  async function handleDelete(row: any) {
    const config = DELETE_CONFIG[row.kaynak_tip];
    if (!config) return;
    if (!confirm(`Bu ${KAYNAK_LABELS[row.kaynak_tip] || row.kaynak_tip} kaydını kalıcı olarak silmek istediğinize emin misiniz?\n${row.aciklama || row.cari_unvan || ""}`)) return;
    setDeletingId(row.id);
    try {
      const r = await fetch(config.url(row.kaynak_id), { method: "DELETE" });
      const d = await r.json();
      if (d.ok) load();
      else alert(d.error || "Silinemedi");
    } catch {
      alert("Bağlantı hatası");
    } finally {
      setDeletingId(null);
    }
  }

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
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-10 animate-pulse" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-zinc-600">Bu filtrelerde hareket yok</div>
          ) : (
            <>
              <p className="text-xs text-zinc-600 mb-2">{rows.length} hareket</p>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 text-left">
                      <th className="px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">Tarih</th>
                      <th className="px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">Tür</th>
                      <th className="px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">Kaynak</th>
                      <th className="px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Kategori</th>
                      <th className="px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Cari / Açıklama</th>
                      <th className="px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">Detay</th>
                      <th className="px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">Ödeme</th>
                      <th className="px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">Durum</th>
                      <th className="px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider text-right whitespace-nowrap">Tutar</th>
                      <th className="px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((h, i) => {
                    const isExpanded = expanded === h.id;
                    const hasDetail = !!DETAIL_CONFIG[h.kaynak_tip];
                    return (
                    <Fragment key={h.id}>
                      <tr
                        onClick={() => hasDetail && toggleExpand(h)}
                        className={`transition-colors ${hasDetail ? "cursor-pointer hover:bg-zinc-800/30" : ""} ${i < rows.length - 1 && !isExpanded ? "border-b border-zinc-800/50" : ""}`}>
                        <td className="px-3 py-2.5 text-zinc-400 text-xs whitespace-nowrap">{fmtDate(h.tarih)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            h.tur === "gelir" ? "bg-emerald-950 text-emerald-400" : "bg-red-950 text-red-400"
                          }`}>
                            {h.tur === "gelir" ? "GELİR" : "GİDER"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-zinc-400 text-xs whitespace-nowrap">{KAYNAK_LABELS[h.kaynak_tip] || h.kaynak_tip}</td>
                        <td className="px-3 py-2.5 text-zinc-400 text-xs">
                          {h.kategori_ad ? (h.kategori_ust_ad ? `${h.kategori_ust_ad} › ${h.kategori_ad}` : h.kategori_ad) : "—"}
                        </td>
                        <td className="px-3 py-2.5 min-w-[160px]">
                          <p className="text-white text-sm">{h.cari_unvan || "—"}</p>
                          {h.aciklama && <p className="text-zinc-600 text-xs truncate max-w-[240px]">{h.aciklama}</p>}
                        </td>
                        <td className="px-3 py-2.5 text-zinc-500 text-xs whitespace-nowrap">
                          {[h.arac_plaka, h.firma_ad, h.departman_ad, h.personel_ad].filter(Boolean).join(" · ") || "—"}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            h.odeme_durumu === "odendi" ? "bg-emerald-950/60 text-emerald-500"
                              : h.odeme_durumu === "kismen_odendi" ? "bg-amber-950/60 text-amber-500"
                              : "bg-zinc-800 text-zinc-500"
                          }`}>
                            {ODEME_LABELS[h.odeme_durumu] || h.odeme_durumu}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {h.durum !== "onaylandi" ? (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-500">
                              {DURUM_LABELS[h.durum] || h.durum}
                            </span>
                          ) : <span className="text-zinc-700 text-xs">—</span>}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-bold tabular-nums whitespace-nowrap ${
                          h.tur === "gelir" ? "text-emerald-400" : "text-red-400"
                        }`}>
                          {fmt(h.tutar_try)} ₺
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            {hasDetail && (
                              <span className={`text-[10px] transition-transform text-zinc-600 ${isExpanded ? "rotate-180" : ""}`}>▾</span>
                            )}
                            {DELETE_CONFIG[h.kaynak_tip] && hasPermission(user, DELETE_CONFIG[h.kaynak_tip].perm) && (
                              <button
                                onClick={e => { e.stopPropagation(); handleDelete(h); }}
                                disabled={deletingId === h.id}
                                className="text-xs text-zinc-600 hover:text-red-400 border border-zinc-800 hover:border-red-900 px-2 py-1 rounded-lg transition-colors disabled:opacity-40"
                              >
                                {deletingId === h.id ? "..." : "Sil"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && hasDetail && (
                        <tr className={i < rows.length - 1 ? "border-b border-zinc-800/50" : ""}>
                          <td colSpan={10} className="px-4 py-3 bg-zinc-950/50">
                            {detailLoading === h.id ? (
                              <p className="text-zinc-600 text-xs">Yükleniyor...</p>
                            ) : !detail[h.id] ? (
                              <p className="text-zinc-600 text-xs">Detay yüklenemedi</p>
                            ) : (
                              <div className="grid sm:grid-cols-2 gap-4">
                                <div className="space-y-1 text-xs">
                                  {detail[h.id].belge_no && <p><span className="text-zinc-500">Belge No:</span> <span className="text-zinc-300">{detail[h.id].belge_no}</span></p>}
                                  {detail[h.id].fatura_no && <p><span className="text-zinc-500">Fatura No:</span> <span className="text-zinc-300">{detail[h.id].fatura_no}</span></p>}
                                  {detail[h.id].baslik && <p><span className="text-zinc-500">Başlık:</span> <span className="text-zinc-300">{detail[h.id].baslik}</span></p>}
                                  {(detail[h.id].aciklama) && <p><span className="text-zinc-500">Açıklama:</span> <span className="text-zinc-300">{detail[h.id].aciklama}</span></p>}
                                  {detail[h.id].cari_ad && <p><span className="text-zinc-500">Cari:</span> <span className="text-zinc-300">{detail[h.id].cari_ad}</span></p>}
                                  {detail[h.id].talep_eden_ad && <p><span className="text-zinc-500">Talep Eden:</span> <span className="text-zinc-300">{detail[h.id].talep_eden_ad}</span></p>}
                                  {detail[h.id].vade_tarihi && <p><span className="text-zinc-500">Vade:</span> <span className="text-zinc-300">{fmtDate(detail[h.id].vade_tarihi)}</span></p>}
                                </div>
                                {(detail[h.id].kalemler?.length > 0) && (
                                  <div className="space-y-1">
                                    <p className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wider mb-1">Kalemler</p>
                                    {detail[h.id].kalemler.map((k: any) => (
                                      <div key={k.id} className="flex items-center justify-between text-xs bg-zinc-900 rounded-lg px-2.5 py-1.5">
                                        <span className="text-zinc-300">{k.aciklama || k.urun_hizmet_adi}</span>
                                        <span className="text-white tabular-nums">{fmt(k.tutar)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {(detail[h.id].belgeler?.length > 0) && (
                                  <div className="space-y-1">
                                    <p className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wider mb-1">Belgeler</p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {detail[h.id].belgeler.map((b: any) => (
                                        <a key={b.id} href={`/api/uploads/finans-belge/${b.dosya_yolu?.split("/").pop() || b.id}`} target="_blank" rel="noopener noreferrer"
                                          className="text-[11px] bg-zinc-900 text-zinc-300 px-2 py-1 rounded-lg hover:text-white">
                                          {b.dosya_adi}
                                        </a>
                                      ))}
                                    </div>
                                  </div>
                                )}
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
            </>
          )}
        </div>
      </div>
    </>
  );
}
