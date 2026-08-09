"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { hasPermission } from "@/lib/permissions";
import { todayIstanbul } from "@/lib/time";

type Kalem = { aciklama: string; miktar: string; birim_fiyat: string };

const EMPTY_FORM = {
  tip: "fis" as "fis" | "fatura",
  tarih: todayIstanbul(),
  kategori_id: "",
  cari_id: "",
  belge_no: "",
  tutar: "",
  kdv_tutar: "",
  aciklama: "",
  department_id: "",
  proje_id: "",
  masraf_merkezi_id: "",
  vehicle_id: "",
  company_id: "",
};

const EMPTY_KALEM: Kalem = { aciklama: "", miktar: "1", birim_fiyat: "" };

export default function GiderPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [kategoriler, setKategoriler] = useState<any[]>([]);
  const [cariler, setCariler] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterKategori, setFilterKategori] = useState("");
  const [filterTip, setFilterTip] = useState("");
  const [filterDurum, setFilterDurum] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, any>>({});

  const [showForm, setShowForm] = useState(false);
  const [useKalemler, setUseKalemler] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [kalemler, setKalemler] = useState<Kalem[]>([{ ...EMPTY_KALEM }]);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [showHizli, setShowHizli] = useState(false);
  const [hizliForm, setHizliForm] = useState({ tarih: todayIstanbul(), tutar: "", aciklama: "" });
  const [hizliFile, setHizliFile] = useState<File | null>(null);
  const [hizliSaving, setHizliSaving] = useState(false);

  const canWrite = hasPermission(user, "finans_gider:create");

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => { if (d.ok) setUser(d.data); else router.replace("/login"); }).catch(() => router.replace("/login"));
    fetch("/api/finans/kategori?tip=gider").then(r => r.json()).then(d => { if (d.ok) setKategoriler(d.data); }).catch(() => {});
    fetch("/api/cari-tedarikci?limit=500").then(r => r.json()).then(d => { if (d.ok) setCariler(d.data); }).catch(() => {});
    fetch("/api/vehicles?limit=500").then(r => r.json()).then(d => { if (d.ok) setVehicles(d.data); }).catch(() => {});
    fetch("/api/companies?limit=500").then(r => r.json()).then(d => { if (d.ok) setCompanies(d.data); }).catch(() => {});
    // Dashboard'daki kategori kartından gelen ?kategori_id= ile ön-filtre
    const kid = new URLSearchParams(window.location.search).get("kategori_id");
    if (kid) setFilterKategori(kid);
  }, []);

  useEffect(() => { load(); }, [filterKategori, filterTip, filterDurum]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterKategori) params.set("kategori_id", filterKategori);
      if (filterTip) params.set("tip", filterTip);
      if (filterDurum) params.set("durum", filterDurum);
      const r = await fetch(`/api/finans/gider?${params.toString()}`);
      const d = await r.json();
      if (d.ok) setRows(d.data);
    } finally { setLoading(false); }
  }

  async function toggleExpand(id: string) {
    const next = expanded === id ? null : id;
    setExpanded(next);
    if (next && !detail[next]) {
      const r = await fetch(`/api/finans/gider/${next}`);
      const d = await r.json();
      if (d.ok) setDetail(prev => ({ ...prev, [next]: d.data }));
    }
  }

  // Kategori bazlı toplam (drill-down kartları)
  const kategoriToplamlar = useMemo(() => {
    const map = new Map<string, { ad: string; toplam: number; adet: number }>();
    for (const r of rows) {
      const key = r.kategori_id || "__yok__";
      const cur = map.get(key) || { ad: r.kategori_ad || "Kategorisiz", toplam: 0, adet: 0 };
      cur.toplam += Number(r.tutar) || 0;
      cur.adet += 1;
      map.set(key, cur);
    }
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.toplam - a.toplam);
  }, [rows]);

  async function quickAddKategori() {
    const ad = window.prompt("Yeni kategori adı:");
    if (!ad?.trim()) return;
    const res = await fetch("/api/finans/kategori", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ad: ad.trim(), tip: "gider" }),
    });
    const d = await res.json();
    if (d.ok) {
      const kr = await fetch("/api/finans/kategori?tip=gider").then(r => r.json());
      if (kr.ok) setKategoriler(kr.data);
      setForm(f => ({ ...f, kategori_id: d.data.id }));
    } else {
      alert(d.error || "Kategori eklenemedi");
    }
  }

  function openForm() {
    setForm({ ...EMPTY_FORM });
    setKalemler([{ ...EMPTY_KALEM }]);
    setUseKalemler(false);
    setFiles([]);
    setSaveError(null);
    setShowForm(true);
  }

  const kalemToplam = kalemler.reduce((s, k) => s + (Number(k.miktar) || 0) * (Number(k.birim_fiyat) || 0), 0);

  async function save() {
    setSaveError(null);
    if (!form.kategori_id) { setSaveError("Kategori zorunlu"); return; }
    if (!useKalemler && !form.tutar) { setSaveError("Tutar zorunlu"); return; }
    setSaving(true);
    try {
      const payload: any = {
        tip: form.tip, tarih: form.tarih, kategori_id: form.kategori_id,
        cari_id: form.cari_id || null, belge_no: form.belge_no || null,
        tutar: useKalemler ? kalemToplam : Number(form.tutar),
        kdv_tutar: form.kdv_tutar ? Number(form.kdv_tutar) : null,
        aciklama: form.aciklama || null,
        department_id: form.department_id || null,
        proje_id: form.proje_id || null,
        masraf_merkezi_id: form.masraf_merkezi_id || null,
        vehicle_id: form.vehicle_id || null,
        company_id: form.company_id || null,
      };
      if (useKalemler) {
        payload.kalemler = kalemler
          .filter(k => k.aciklama.trim())
          .map(k => ({ aciklama: k.aciklama.trim(), miktar: Number(k.miktar) || 0, birim_fiyat: Number(k.birim_fiyat) || 0 }));
      }
      const res = await fetch("/api/finans/gider", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!d.ok) { setSaveError(typeof d.error === "string" ? d.error : "Kaydetme başarısız"); return; }
      for (const f of files) {
        const fd = new FormData();
        fd.append("dosya", f);
        fd.append("iliskili_tip", "gider");
        fd.append("iliskili_id", d.data.id);
        await fetch("/api/finans/belge", { method: "POST", body: fd }).catch(() => {});
      }
      setShowForm(false);
      load();
    } finally { setSaving(false); }
  }

  function openHizli() {
    setHizliForm({ tarih: todayIstanbul(), tutar: "", aciklama: "" });
    setHizliFile(null);
    setShowHizli(true);
  }

  async function saveHizli() {
    if (!hizliForm.tutar) return;
    setHizliSaving(true);
    try {
      const res = await fetch("/api/finans/gider", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tip: "fis", tarih: hizliForm.tarih, tutar: Number(hizliForm.tutar),
          aciklama: hizliForm.aciklama || null,
          kategori_id: kategoriler[0]?.id, // geçici — kategori sonra tamamlanır
          durum: "taslak",
        }),
      });
      const d = await res.json();
      if (d.ok && hizliFile) {
        const fd = new FormData();
        fd.append("dosya", hizliFile);
        fd.append("iliskili_tip", "gider");
        fd.append("iliskili_id", d.data.id);
        await fetch("/api/finans/belge", { method: "POST", body: fd }).catch(() => {});
      }
      if (d.ok) { setShowHizli(false); load(); }
    } finally { setHizliSaving(false); }
  }

  async function completeTaslak(id: string, kategoriId: string) {
    const res = await fetch(`/api/finans/gider/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kategori_id: kategoriId, durum: "tamamlandi" }),
    });
    const d = await res.json();
    if (d.ok) { setDetail(prev => { const n = { ...prev }; delete n[id]; return n; }); load(); }
  }

  function exportUrl() {
    const params = new URLSearchParams();
    if (filterKategori) params.set("kategori_id", filterKategori);
    return `/api/finans/gider/export?${params.toString()}`;
  }

  const taslakCount = rows.filter(r => r.durum === "taslak").length;

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Gider</h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              {rows.length} kayıt
              {taslakCount > 0 && <span className="text-amber-400"> · {taslakCount} taslak (kategori bekliyor)</span>}
            </p>
          </div>
          <div className="flex gap-2">
            <a href={exportUrl()} className="bg-zinc-800 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-700 transition-colors border border-zinc-700">
              Excel'e Aktar
            </a>
            {canWrite && (
              <>
                <button onClick={openHizli}
                  className="bg-amber-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-amber-500 transition-colors">
                  + Anlık Giriş
                </button>
                <button onClick={openForm}
                  className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors">
                  + Gider Ekle
                </button>
              </>
            )}
          </div>
        </div>

        {/* Kategori drill-down kartları */}
        {kategoriToplamlar.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {kategoriToplamlar.slice(0, 12).map(k => (
              <button key={k.id} onClick={() => setFilterKategori(filterKategori === k.id ? "" : (k.id === "__yok__" ? "" : k.id))}
                className={`text-left px-3 py-2 rounded-lg border transition-colors ${
                  filterKategori === k.id ? "bg-white text-zinc-950 border-white" : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-600"
                }`}>
                <p className="text-xs font-semibold">{k.ad}</p>
                <p className="text-[11px] opacity-70">{k.toplam.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL · {k.adet} kayıt</p>
              </button>
            ))}
          </div>
        )}

        {/* Filtreler */}
        <div className="flex flex-wrap gap-3 mb-5">
          <select value={filterTip} onChange={e => setFilterTip(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 text-white text-sm px-3 py-2 rounded-lg focus:outline-none">
            <option value="">Tüm Türler</option>
            <option value="fis">Fiş</option>
            <option value="fatura">Fatura</option>
          </select>
          <select value={filterDurum} onChange={e => setFilterDurum(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 text-white text-sm px-3 py-2 rounded-lg focus:outline-none">
            <option value="">Tüm Durumlar</option>
            <option value="taslak">Taslak</option>
            <option value="tamamlandi">Tamamlandı</option>
          </select>
          {(filterKategori || filterTip || filterDurum) && (
            <button onClick={() => { setFilterKategori(""); setFilterTip(""); setFilterDurum(""); }}
              className="text-xs text-zinc-500 underline hover:text-white">Filtreyi temizle</button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-zinc-600 text-sm">Yükleniyor...</div>
        ) : rows.length === 0 ? (
          <div className="py-24 text-center text-zinc-600 text-sm">Kayıt bulunamadı</div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            {rows.map((row, i) => {
              const isExpanded = expanded === row.id;
              const d = detail[row.id];
              return (
                <div key={row.id} className={i < rows.length - 1 ? "border-b border-zinc-800/50" : ""}>
                  <div className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-zinc-800/30" onClick={() => toggleExpand(row.id)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-white font-semibold text-sm">{row.aciklama || row.belge_no || (row.tip === "fis" ? "Fiş" : "Fatura")}</span>
                        <span className="text-zinc-500 text-xs bg-zinc-800 px-1.5 py-0.5 rounded">{row.tip === "fis" ? "Fiş" : "Fatura"}</span>
                        {row.durum === "taslak" && <span className="text-amber-400 text-xs bg-amber-950 border border-amber-800 px-1.5 py-0.5 rounded">Taslak</span>}
                        {row.belge_sayisi > 0 && <span className="text-zinc-500 text-xs">{row.belge_sayisi} ek</span>}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-zinc-500">
                        <span>{new Date(row.tarih + "T00:00:00").toLocaleDateString("tr-TR")}</span>
                        {row.kategori_ad && <span>{row.kategori_ad}</span>}
                        {row.cari_ad && <span>{row.cari_ad}</span>}
                      </div>
                    </div>
                    <span className="text-white font-semibold text-sm tabular-nums">
                      {Number(row.tutar).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} {row.para_birimi_kod}
                    </span>
                    <span className="text-zinc-600 text-xs">{isExpanded ? "▲" : "▼"}</span>
                  </div>
                  {isExpanded && (
                    <div className="px-5 pb-4 border-t border-zinc-800/40 pt-3" onClick={e => e.stopPropagation()}>
                      {!d ? (
                        <p className="text-zinc-600 text-xs">Yükleniyor...</p>
                      ) : (
                        <>
                          {row.durum === "taslak" && (
                            <div className="bg-amber-950/40 border border-amber-800 rounded-lg p-3 mb-3">
                              <p className="text-amber-300 text-xs font-semibold mb-2">Bu kayıt anlık girişten geldi, kategori seçilip tamamlanmalı</p>
                              <select id={`kat-${row.id}`} defaultValue={row.kategori_id || ""} className="bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg mr-2">
                                {kategoriler.map((k: any) => <option key={k.id} value={k.id}>{k.parent_id ? "   " + k.ad : k.ad}</option>)}
                              </select>
                              <button onClick={() => completeTaslak(row.id, (document.getElementById(`kat-${row.id}`) as HTMLSelectElement).value)}
                                className="bg-amber-600 text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-amber-500">
                                Tamamla
                              </button>
                            </div>
                          )}
                          {d.kalemler?.length > 0 && (
                            <div className="mb-3">
                              <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Kalemler</p>
                              <div className="space-y-1">
                                {d.kalemler.map((k: any) => (
                                  <div key={k.id} className="flex items-center justify-between text-sm bg-zinc-800/50 rounded-lg px-3 py-2">
                                    <span className="text-zinc-300">{k.aciklama} <span className="text-zinc-600">× {k.miktar}</span></span>
                                    <span className="text-white tabular-nums">{Number(k.tutar).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {d.belgeler?.length > 0 && (
                            <div>
                              <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Belgeler</p>
                              <div className="flex flex-wrap gap-2">
                                {d.belgeler.map((b: any) => (
                                  <a key={b.id} href={`/api/uploads/finans-belge/${b.dosya_yolu?.split("/").pop() || b.id}`} target="_blank" rel="noopener noreferrer"
                                    className="text-xs bg-zinc-800 text-zinc-300 px-2.5 py-1.5 rounded-lg hover:text-white">
                                    {b.dosya_adi}
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ─── Gider Ekle Modal ─── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-start justify-center z-50 px-4 overflow-y-auto py-8">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-lg my-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Gider Ekle</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-600 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="space-y-4">
              <div className="flex gap-2">
                {(["fis", "fatura"] as const).map(t => (
                  <button key={t} onClick={() => setForm(f => ({ ...f, tip: t }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      form.tip === t ? "bg-white text-zinc-950 border-white" : "bg-zinc-800 text-zinc-400 border-zinc-700"
                    }`}>
                    {t === "fis" ? "Fiş" : "Fatura"}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Tarih *</label>
                  <input type="date" value={form.tarih} onChange={e => setForm(f => ({ ...f, tarih: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Belge No</label>
                  <input value={form.belge_no} onChange={e => setForm(f => ({ ...f, belge_no: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Kategori *</label>
                <div className="flex gap-2">
                  <select value={form.kategori_id} onChange={e => setForm(f => ({ ...f, kategori_id: e.target.value }))}
                    className="flex-1 bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                    <option value="">— Kategori seçin —</option>
                    {kategoriler.map((k: any) => <option key={k.id} value={k.id}>{k.parent_id ? "   " + k.ad : k.ad}</option>)}
                  </select>
                  <button onClick={quickAddKategori} className="bg-zinc-800 text-zinc-300 text-xs font-semibold px-3 rounded-lg hover:bg-zinc-700 border border-zinc-700 shrink-0">
                    + Yeni
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Cari (opsiyonel)</label>
                <select value={form.cari_id} onChange={e => setForm(f => ({ ...f, cari_id: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                  <option value="">— Cari seçin —</option>
                  {cariler.map((c: any) => <option key={c.id} value={c.id}>{c.unvan}</option>)}
                </select>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={useKalemler} onChange={e => setUseKalemler(e.target.checked)} className="w-4 h-4 rounded" />
                <span className="text-sm text-zinc-300">Kalem kalem gir</span>
              </label>

              {useKalemler ? (
                <div className="space-y-2">
                  {kalemler.map((k, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input placeholder="Açıklama" value={k.aciklama}
                        onChange={e => setKalemler(kl => kl.map((it, i) => i === idx ? { ...it, aciklama: e.target.value } : it))}
                        className="flex-1 bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none" />
                      <input placeholder="Miktar" type="number" value={k.miktar}
                        onChange={e => setKalemler(kl => kl.map((it, i) => i === idx ? { ...it, miktar: e.target.value } : it))}
                        className="w-20 bg-zinc-800 border border-zinc-700 text-white text-sm px-2 py-2 rounded-lg focus:outline-none" />
                      <input placeholder="Br. Fiyat" type="number" value={k.birim_fiyat}
                        onChange={e => setKalemler(kl => kl.map((it, i) => i === idx ? { ...it, birim_fiyat: e.target.value } : it))}
                        className="w-24 bg-zinc-800 border border-zinc-700 text-white text-sm px-2 py-2 rounded-lg focus:outline-none" />
                      {kalemler.length > 1 && (
                        <button onClick={() => setKalemler(kl => kl.filter((_, i) => i !== idx))} className="text-zinc-600 hover:text-red-400 px-1">×</button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => setKalemler(kl => [...kl, { ...EMPTY_KALEM }])} className="text-xs text-zinc-400 hover:text-white">+ Kalem ekle</button>
                  <p className="text-right text-white text-sm font-semibold">Toplam: {kalemToplam.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Tutar *</label>
                    <input type="number" value={form.tutar} onChange={e => setForm(f => ({ ...f, tutar: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">KDV (opsiyonel)</label>
                    <input type="number" value={form.kdv_tutar} onChange={e => setForm(f => ({ ...f, kdv_tutar: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Açıklama</label>
                <textarea value={form.aciklama} onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))} rows={2}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </div>

              <div>
                <label className="flex items-center justify-center gap-2 bg-zinc-800 border border-dashed border-zinc-700 rounded-lg px-3 py-2.5 text-zinc-500 text-xs cursor-pointer hover:border-zinc-500 hover:text-zinc-300 transition-colors">
                  {files.length > 0 ? `${files.length} dosya seçildi` : "Fiş/Fatura Görseli veya PDF Ekle"}
                  <input type="file" multiple accept="image/*,.pdf" className="hidden"
                    onChange={e => setFiles(Array.from(e.target.files || []))} />
                </label>
              </div>
            </div>

            {saveError && <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-3 py-2 mt-3">{saveError}</p>}
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving} className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors">
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Anlık Giriş Modal ─── */}
      {showHizli && (
        <div className="fixed inset-0 bg-black/80 flex items-start justify-center z-50 px-4 overflow-y-auto py-8">
          <div className="bg-zinc-900 border border-amber-800 rounded-2xl p-6 w-full max-w-sm my-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Anlık Giriş</h2>
              <button onClick={() => setShowHizli(false)} className="text-zinc-600 hover:text-white text-xl leading-none">×</button>
            </div>
            <p className="text-zinc-500 text-xs mb-4">Fişi kaybetmeden hızlıca ekle — kategori sonra tamamlanır.</p>
            <div className="space-y-3">
              <label className="flex items-center justify-center gap-2 bg-zinc-800 border-2 border-dashed border-amber-700 rounded-lg px-3 py-6 text-amber-400 text-sm font-semibold cursor-pointer hover:border-amber-500 transition-colors">
                {hizliFile ? hizliFile.name : "Fotoğraf Çek / Seç"}
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => setHizliFile(e.target.files?.[0] || null)} />
              </label>
              <input type="number" placeholder="Tutar *" value={hizliForm.tutar}
                onChange={e => setHizliForm(f => ({ ...f, tutar: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-lg px-3 py-3 rounded-lg focus:outline-none focus:border-amber-600 text-center font-semibold" />
              <input type="date" value={hizliForm.tarih} onChange={e => setHizliForm(f => ({ ...f, tarih: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none" />
              <input placeholder="Not (opsiyonel)" value={hizliForm.aciklama}
                onChange={e => setHizliForm(f => ({ ...f, aciklama: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none" />
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowHizli(false)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={saveHizli} disabled={hizliSaving || !hizliForm.tutar}
                className="flex-1 bg-amber-600 text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-amber-500 disabled:opacity-50 transition-colors">
                {hizliSaving ? "Kaydediliyor..." : "Hemen Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
