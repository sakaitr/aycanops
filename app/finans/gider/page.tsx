"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { hasPermission } from "@/lib/permissions";
import { todayIstanbul } from "@/lib/time";
import { toast } from "@/lib/toast";

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

const ODEME_LABELS: Record<string, string> = { odenmedi: "Ödenmedi", kismen_odendi: "Kısmen Ödendi", odendi: "Ödendi" };
const ODEME_COLORS: Record<string, string> = {
  odenmedi: "bg-zinc-800 text-zinc-400 border-zinc-700",
  kismen_odendi: "bg-amber-950/60 text-amber-400 border-amber-800",
  odendi: "bg-emerald-950/60 text-emerald-400 border-emerald-800",
};

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
  const [hizliForm, setHizliForm] = useState({ tarih: todayIstanbul(), tutar: "", kategoriId: "", aciklama: "" });
  const [hizliFile, setHizliFile] = useState<File | null>(null);
  const [hizliSaving, setHizliSaving] = useState(false);

  const [showBulk, setShowBulk] = useState(false);
  const [bulkParsing, setBulkParsing] = useState(false);
  const [bulkRows, setBulkRows] = useState<any[] | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ created: number; hatalar: any[] } | null>(null);

  const canWrite = hasPermission(user, "finans_gider:create");
  const canMarkOdeme = hasPermission(user, "finans_gider:odeme_isaretle");
  const canEditGider = hasPermission(user, "finans_gider:duzenle");
  const [updatingOdeme, setUpdatingOdeme] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => { if (d.ok) setUser(d.data); else router.replace("/login"); }).catch(() => router.replace("/login"));
    fetch("/api/finans/kategori?tip=gider&scope=me").then(r => r.json()).then(d => { if (d.ok) setKategoriler(d.data); }).catch(() => {});
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
      const kr = await fetch("/api/finans/kategori?tip=gider&scope=me").then(r => r.json());
      if (kr.ok) setKategoriler(kr.data);
      setForm(f => ({ ...f, kategori_id: d.data.id }));
    } else {
      alert(d.error || "Kategori eklenemedi");
    }
  }

  function openForm() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setKalemler([{ ...EMPTY_KALEM }]);
    setUseKalemler(false);
    setFiles([]);
    setSaveError(null);
    setShowForm(true);
  }

  function openEdit(row: any, d: any) {
    setEditingId(row.id);
    setForm({
      tip: row.tip,
      tarih: row.tarih,
      kategori_id: row.kategori_id || "",
      cari_id: row.cari_id || "",
      belge_no: row.belge_no || "",
      tutar: String(row.tutar ?? ""),
      kdv_tutar: row.kdv_tutar != null ? String(row.kdv_tutar) : "",
      aciklama: row.aciklama || "",
      department_id: row.department_id || "",
      proje_id: row.proje_id || "",
      masraf_merkezi_id: row.masraf_merkezi_id || "",
      vehicle_id: row.vehicle_id || "",
      company_id: row.company_id || "",
    });
    const hasKalemler = d?.kalemler?.length > 0;
    setUseKalemler(hasKalemler);
    setKalemler(hasKalemler
      ? d.kalemler.map((k: any) => ({ aciklama: k.aciklama, miktar: String(k.miktar), birim_fiyat: String(k.birim_fiyat) }))
      : [{ ...EMPTY_KALEM }]);
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
      const isEdit = !!editingId;
      const res = await fetch(isEdit ? `/api/finans/gider/${editingId}` : "/api/finans/gider", {
        method: isEdit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!d.ok) { setSaveError(typeof d.error === "string" ? d.error : "Kaydetme başarısız"); return; }
      if (d.uyari) {
        toast.warning(`Bu ay için ${d.uyari.butce.toLocaleString("tr-TR")} TL bütçeni ${(d.uyari.harcanan - d.uyari.butce).toLocaleString("tr-TR")} TL aştın.`);
      }
      if (d.belge_no_uyari) {
        toast.warning(`"${form.belge_no}" belge no'lu kayıt daha önce girilmiş (${new Date(d.belge_no_uyari.tarih + "T00:00:00").toLocaleDateString("tr-TR")}, ${Number(d.belge_no_uyari.tutar).toLocaleString("tr-TR")} TL${d.belge_no_uyari.kategori_ad ? `, ${d.belge_no_uyari.kategori_ad}` : ""}).`);
      }
      if (!isEdit) {
        for (const f of files) {
          const fd = new FormData();
          fd.append("dosya", f);
          fd.append("iliskili_tip", "gider");
          fd.append("iliskili_id", d.data.id);
          await fetch("/api/finans/belge", { method: "POST", body: fd }).catch(() => {});
        }
      }
      setShowForm(false);
      setEditingId(null);
      if (isEdit) setDetail(prev => { const n = { ...prev }; delete n[editingId!]; return n; });
      load();
    } finally { setSaving(false); }
  }

  function openHizli() {
    setHizliForm({ tarih: todayIstanbul(), tutar: "", kategoriId: "", aciklama: "" });
    setHizliFile(null);
    setShowHizli(true);
  }

  async function saveHizli() {
    if (!hizliFile && !hizliForm.tutar) return; // en az fotoğraf ya da tutar girilmeli
    setHizliSaving(true);
    try {
      const res = await fetch("/api/finans/gider", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tip: "fis", tarih: hizliForm.tarih,
          tutar: hizliForm.tutar ? Number(hizliForm.tutar) : undefined,
          aciklama: hizliForm.aciklama || null,
          kategori_id: hizliForm.kategoriId || null,
          durum: "taslak", // her zaman taslak — onay bekleyen olarak kalır
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
      if (d.ok) {
        if (d.uyari) {
          toast.warning(`Bu ay için ${d.uyari.butce.toLocaleString("tr-TR")} TL bütçeni ${(d.uyari.harcanan - d.uyari.butce).toLocaleString("tr-TR")} TL aştın.`);
        }
        setShowHizli(false); load();
      }
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

  async function updateOdeme(id: string, odeme_durumu: string) {
    setUpdatingOdeme(id);
    try {
      const res = await fetch(`/api/finans/gider/${id}/odeme`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ odeme_durumu }),
      });
      const d = await res.json();
      if (d.ok) {
        setRows(rs => rs.map(r => r.id === id ? { ...r, odeme_durumu } : r));
      } else {
        toast.error(d.error || "Güncellenemedi");
      }
    } finally { setUpdatingOdeme(null); }
  }

  function openBulk() {
    setBulkRows(null);
    setBulkResult(null);
    setShowBulk(true);
  }

  async function handleBulkFile(file: File) {
    setBulkParsing(true);
    setBulkRows(null);
    setBulkResult(null);
    try {
      const fd = new FormData();
      fd.append("dosya", file);
      const res = await fetch("/api/finans/gider/import", { method: "POST", body: fd });
      const d = await res.json();
      if (d.ok) setBulkRows(d.data.rows);
    } finally { setBulkParsing(false); }
  }

  async function handleBulkSave() {
    if (!bulkRows) return;
    const gecerli = bulkRows.filter(r => !r.hata);
    if (gecerli.length === 0) return;
    setBulkSaving(true);
    try {
      const payload = gecerli.map(r => ({
        tip: r.tip, tarih: r.tarih, kategori_id: r.kategori_id, cari_id: r.cari_id,
        belge_no: r.belge_no, tutar: r.tutar, kdv_tutar: r.kdv_tutar, aciklama: r.aciklama,
      }));
      const res = await fetch("/api/finans/gider/bulk", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (d.ok) {
        setBulkResult(d.data);
        setBulkRows(null);
        load();
      }
    } finally { setBulkSaving(false); }
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
              {taslakCount > 0 && <span className="text-amber-400"> · {taslakCount} onay bekliyor</span>}
            </p>
          </div>
          <div className="flex gap-2">
            <a href={exportUrl()} className="bg-zinc-800 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-700 transition-colors border border-zinc-700">
              Excel'e Aktar
            </a>
            {canWrite && (
              <>
                <a href="/api/finans/gider/template" className="bg-zinc-800 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-700 transition-colors border border-zinc-700">
                  Şablon İndir
                </a>
                <button onClick={openBulk}
                  className="bg-zinc-800 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-700 transition-colors border border-zinc-700">
                  Toplu Yükle
                </button>
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
                          {canEditGider && (
                            <div className="mb-3">
                              <button onClick={() => openEdit(row, d)}
                                className="text-xs text-zinc-300 hover:text-white border border-zinc-700 hover:border-zinc-500 px-3 py-1.5 rounded-lg transition-colors">
                                ✎ Düzenle
                              </button>
                            </div>
                          )}
                          {row.durum === "taslak" && (
                            <div className="bg-amber-950/40 border border-amber-800 rounded-lg p-3 mb-3">
                              {row.kategori_id ? (
                                <>
                                  <p className="text-amber-300 text-xs font-semibold mb-2">Anlık girişten geldi, onay bekliyor</p>
                                  <button onClick={() => completeTaslak(row.id, row.kategori_id)}
                                    className="bg-amber-600 text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-amber-500">
                                    Onayla
                                  </button>
                                </>
                              ) : (
                                <>
                                  <p className="text-amber-300 text-xs font-semibold mb-2">Anlık girişten geldi, kategori seçilip onaylanmalı</p>
                                  <select id={`kat-${row.id}`} defaultValue={kategoriler[0]?.id || ""} className="bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg mr-2">
                                    {kategoriler.map((k: any) => <option key={k.id} value={k.id}>{k.parent_id ? "   " + k.ad : k.ad}</option>)}
                                  </select>
                                  <button onClick={() => completeTaslak(row.id, (document.getElementById(`kat-${row.id}`) as HTMLSelectElement).value)}
                                    className="bg-amber-600 text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-amber-500">
                                    Onayla
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                          <div className="mb-3">
                            <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Ödeme Durumu</p>
                            {canMarkOdeme ? (
                              <div className="flex gap-1.5 flex-wrap">
                                {(["odenmedi", "kismen_odendi", "odendi"] as const).map(s => (
                                  <button key={s} onClick={() => updateOdeme(row.id, s)}
                                    disabled={updatingOdeme === row.id}
                                    className={`text-xs px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-40 ${
                                      (row.odeme_durumu || "odenmedi") === s ? ODEME_COLORS[s] : "bg-zinc-800/50 text-zinc-500 border-zinc-700 hover:border-zinc-500"
                                    }`}>
                                    {ODEME_LABELS[s]}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <span className={`text-xs px-2.5 py-1 rounded-lg border ${ODEME_COLORS[row.odeme_durumu || "odenmedi"]}`}>
                                {ODEME_LABELS[row.odeme_durumu || "odenmedi"]}
                              </span>
                            )}
                          </div>
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
              <h2 className="text-lg font-bold text-white">{editingId ? "Gider Düzenle" : "Gider Ekle"}</h2>
              <button onClick={() => { setShowForm(false); setEditingId(null); }} className="text-zinc-600 hover:text-white text-xl leading-none">×</button>
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

              {!editingId && (
                <div>
                  <label className="flex items-center justify-center gap-2 bg-zinc-800 border border-dashed border-zinc-700 rounded-lg px-3 py-2.5 text-zinc-500 text-xs cursor-pointer hover:border-zinc-500 hover:text-zinc-300 transition-colors">
                    {files.length > 0 ? `${files.length} dosya seçildi` : "Fiş/Fatura Görseli veya PDF Ekle"}
                    <input type="file" multiple accept="image/*,.pdf" className="hidden"
                      onChange={e => setFiles(Array.from(e.target.files || []))} />
                  </label>
                </div>
              )}
            </div>

            {saveError && <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-3 py-2 mt-3">{saveError}</p>}
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setShowForm(false); setEditingId(null); }} className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving} className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors">
                {saving ? "Kaydediliyor..." : editingId ? "Güncelle" : "Kaydet"}
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
            <p className="text-zinc-500 text-xs mb-4">Fişi kaybetmeden hızlıca ekle — en az fotoğraf yeter, kalanı doldurulabilirse hızlanır. Kayıt onay bekleyen olarak düşer.</p>
            <div className="space-y-3">
              <label className="flex items-center justify-center gap-2 bg-zinc-800 border-2 border-dashed border-amber-700 rounded-lg px-3 py-6 text-amber-400 text-sm font-semibold cursor-pointer hover:border-amber-500 transition-colors">
                {hizliFile ? hizliFile.name : "Fotoğraf Çek / Seç"}
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => setHizliFile(e.target.files?.[0] || null)} />
              </label>
              <input type="number" placeholder="Tutar (opsiyonel)" value={hizliForm.tutar}
                onChange={e => setHizliForm(f => ({ ...f, tutar: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-lg px-3 py-3 rounded-lg focus:outline-none focus:border-amber-600 text-center font-semibold" />
              <select value={hizliForm.kategoriId} onChange={e => setHizliForm(f => ({ ...f, kategoriId: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none">
                <option value="">Kategori (opsiyonel, sonra da seçilebilir)</option>
                {kategoriler.map((k: any) => <option key={k.id} value={k.id}>{k.parent_id ? "   " + k.ad : k.ad}</option>)}
              </select>
              <input type="date" value={hizliForm.tarih} onChange={e => setHizliForm(f => ({ ...f, tarih: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none" />
              <input placeholder="Not (opsiyonel)" value={hizliForm.aciklama}
                onChange={e => setHizliForm(f => ({ ...f, aciklama: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none" />
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowHizli(false)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={saveHizli} disabled={hizliSaving || (!hizliFile && !hizliForm.tutar)}
                className="flex-1 bg-amber-600 text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-amber-500 disabled:opacity-50 transition-colors">
                {hizliSaving ? "Kaydediliyor..." : "Hemen Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Toplu Yükle Modal ─── */}
      {showBulk && (
        <div className="fixed inset-0 bg-black/80 flex items-start justify-center z-50 px-4 overflow-y-auto py-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-3xl my-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Excel ile Toplu Yükle</h2>
              <button onClick={() => setShowBulk(false)} className="text-zinc-600 hover:text-white text-xl leading-none">×</button>
            </div>

            {!bulkRows && !bulkResult && (
              <div className="space-y-3">
                <p className="text-zinc-500 text-sm">
                  Önce <a href="/api/finans/gider/template" className="text-white underline">şablonu indirin</a>, verinizi girin ve buradan yükleyin.
                  Kategori adları, şablondaki "Kategoriler" sayfasıyla birebir eşleşmeli.
                </p>
                <label className="flex items-center justify-center gap-2 bg-zinc-800 border-2 border-dashed border-zinc-700 rounded-lg px-3 py-8 text-zinc-300 text-sm font-semibold cursor-pointer hover:border-zinc-500 transition-colors">
                  {bulkParsing ? "Okunuyor..." : "Excel Dosyası Seç"}
                  <input type="file" accept=".xlsx,.xls" className="hidden" disabled={bulkParsing}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleBulkFile(f); }} />
                </label>
              </div>
            )}

            {bulkRows && (
              <div className="space-y-3">
                <p className="text-sm">
                  <span className="text-emerald-400 font-semibold">{bulkRows.filter(r => !r.hata).length} geçerli</span>
                  {bulkRows.some(r => r.hata) && <span className="text-red-400 font-semibold"> · {bulkRows.filter(r => r.hata).length} hatalı (yüklenmeyecek)</span>}
                </p>
                <div className="max-h-80 overflow-y-auto border border-zinc-800 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-zinc-800/60 sticky top-0">
                      <tr className="text-zinc-400 text-left">
                        <th className="px-2 py-1.5">Satır</th>
                        <th className="px-2 py-1.5">Tip</th>
                        <th className="px-2 py-1.5">Tarih</th>
                        <th className="px-2 py-1.5">Kategori</th>
                        <th className="px-2 py-1.5">Tutar</th>
                        <th className="px-2 py-1.5">Durum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkRows.map((r: any) => (
                        <tr key={r.row} className={`border-t border-zinc-800/60 ${r.hata ? "bg-red-950/30" : ""}`}>
                          <td className="px-2 py-1.5 text-zinc-500">{r.row}</td>
                          <td className="px-2 py-1.5 text-zinc-300">{r.tip === "fis" ? "Fiş" : "Fatura"}</td>
                          <td className="px-2 py-1.5 text-zinc-300">{r.tarih || "—"}</td>
                          <td className="px-2 py-1.5 text-zinc-300">{r.kategori_raw || "—"}</td>
                          <td className="px-2 py-1.5 text-zinc-300 tabular-nums">{r.tutar ?? "—"}</td>
                          <td className="px-2 py-1.5">
                            {r.hata ? <span className="text-red-400">{r.hata}</span> : <span className="text-emerald-400">OK</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setBulkRows(null)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">Vazgeç</button>
                  <button onClick={handleBulkSave} disabled={bulkSaving || bulkRows.filter(r => !r.hata).length === 0}
                    className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                    {bulkSaving ? "Kaydediliyor..." : `${bulkRows.filter(r => !r.hata).length} Kaydı Onayla ve Yükle`}
                  </button>
                </div>
              </div>
            )}

            {bulkResult && (
              <div className="space-y-3">
                <p className="text-emerald-400 text-sm font-semibold">{bulkResult.created} kayıt eklendi.</p>
                {bulkResult.hatalar.length > 0 && (
                  <div className="bg-red-950/40 border border-red-800 rounded-lg p-3 text-xs text-red-300 space-y-1">
                    {bulkResult.hatalar.map((h: any, i: number) => <p key={i}>Satır {h.index + 1}: {h.hata}</p>)}
                  </div>
                )}
                <button onClick={() => setShowBulk(false)} className="w-full bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 transition-colors">Kapat</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
