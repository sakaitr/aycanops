"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { toast } from "@/lib/toast";
import { hasPermission } from "@/lib/permissions";
import { todayIstanbul } from "@/lib/time";

const TUR_LABELS: Record<string, string> = { satis: "Satış", alis: "Alış" };
const DURUM_LABELS: Record<string, string> = {
  taslak: "Taslak",
  onay_bekliyor: "Onay Bekliyor",
  onaylandi: "Onaylandı",
  muhasebelesti: "Muhasebeleşti",
  iptal: "İptal",
};
const DURUM_BADGE_CLASS: Record<string, string> = {
  taslak: "bg-zinc-800 text-zinc-400",
  onay_bekliyor: "bg-amber-950 text-amber-400",
  onaylandi: "bg-emerald-950 text-emerald-400",
  muhasebelesti: "bg-sky-950 text-sky-400",
  iptal: "bg-red-950 text-red-400",
};
const ODEME_DURUMU_LABELS: Record<string, string> = {
  odenmedi: "Ödenmedi",
  kismen_odendi: "Kısmen Ödendi",
  odendi: "Ödendi",
  fazla_odendi: "Fazla Ödendi",
};
const ODEME_DURUMU_BADGE_CLASS: Record<string, string> = {
  odenmedi: "bg-zinc-800 text-zinc-400",
  kismen_odendi: "bg-amber-950 text-amber-400",
  odendi: "bg-emerald-950 text-emerald-400",
  fazla_odendi: "bg-sky-950 text-sky-400",
};
const ODEME_TURU_LABELS: Record<string, string> = {
  pesin: "Peşin",
  vade: "Vade",
  cek: "Çek",
  kart: "Kart",
  nakit: "Nakit",
};

// MySQL DATE sütunları mysql2 tarafından JS Date nesnesi olarak döner ve bu nesne
// JSON.stringify sırasında UTC'ye çevrilir. new Date(...) ile ayrıştırıp tarayıcının
// yerel (Europe/Istanbul, sunucuyla aynı dilim) metotlarıyla okumak UTC kaymasını
// geri alır (bkz. app/finans/gelir-gider/page.tsx aynı yardımcı).
function toDateInputValue(v: unknown): string {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v as string);
  if (Number.isNaN(d.getTime())) return typeof v === "string" ? v.slice(0, 10) : "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTutar(v: unknown): string {
  return Number(v || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const EMPTY_KALEM = {
  urun_hizmet_adi: "",
  miktar: "1",
  birim_fiyat: "",
  vergi_kodu_id: "",
  masraf_merkezi_id: "",
  proje_id: "",
  department_id: "",
};

function emptyForm(tur: string) {
  return {
    tur,
    fatura_no: "",
    odeme_turu: "",
    belge_turu_id: "",
    cari_id: "",
    tarih: todayIstanbul(),
    vade_tarihi: "",
    para_birimi_kod: "TRY",
    kur: "1",
    aciklama: "",
    kalemler: [{ ...EMPTY_KALEM }],
  };
}

export default function FaturalarPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"satis" | "alis">("satis");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>(() => emptyForm("satis"));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const [companies, setCompanies] = useState<any[]>([]);
  const [isletenler, setIsletenler] = useState<any[]>([]);
  const [belgeTurleri, setBelgeTurleri] = useState<any[]>([]);
  const [vergiKodlari, setVergiKodlari] = useState<any[]>([]);
  const [masrafMerkezleri, setMasrafMerkezleri] = useState<any[]>([]);
  const [projeler, setProjeler] = useState<any[]>([]);
  const [departmanlar, setDepartmanlar] = useState<any[]>([]);

  const [attachments, setAttachments] = useState<any[]>([]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadingAttach, setUploadingAttach] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data); else router.replace("/login");
    });
    fetch("/api/companies").then(r => r.json()).then(d => { if (d.ok) setCompanies(d.data); });
    fetch("/api/isletenler?active=1&limit=500").then(r => r.json()).then(d => { if (d.ok) setIsletenler(d.data); });
    fetch("/api/finans/belge-turu?is_active=1").then(r => r.json()).then(d => { if (d.ok) setBelgeTurleri(d.data); });
    fetch("/api/finans/vergi-kodu?is_active=1").then(r => r.json()).then(d => { if (d.ok) setVergiKodlari(d.data); });
    fetch("/api/finans/masraf-merkezi").then(r => r.json()).then(d => { if (d.ok) setMasrafMerkezleri(d.data); });
    fetch("/api/finans/proje").then(r => r.json()).then(d => { if (d.ok) setProjeler(d.data); });
    fetch("/api/departments").then(r => r.json()).then(d => { if (d.ok) setDepartmanlar(d.data); });
  }, []);

  useEffect(() => { load(); }, [activeTab]);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/finans/fatura?tur=${activeTab}`);
      const d = await r.json();
      if (d.ok) setRows(d.data);
    } finally { setLoading(false); }
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm(activeTab));
    setAttachments([]);
    setPendingFile(null);
    setSaveError(null);
    setShowForm(true);
  }

  function openEdit(row: any) {
    setEditing(row);
    setForm({
      tur: row.tur,
      fatura_no: row.fatura_no || "",
      odeme_turu: row.odeme_turu || "",
      belge_turu_id: row.belge_turu_id || "",
      cari_id: row.cari_id || "",
      tarih: toDateInputValue(row.tarih),
      vade_tarihi: toDateInputValue(row.vade_tarihi),
      para_birimi_kod: row.para_birimi_kod || "TRY",
      kur: row.kur != null ? String(row.kur) : "1",
      aciklama: row.aciklama || "",
      kalemler: [{ ...EMPTY_KALEM }], // bu fazda düzenlenmiyor; sadece başlık gösterilir
    });
    setPendingFile(null);
    setSaveError(null);
    setShowForm(true);
    loadAttachments(row.id);
  }

  async function loadAttachments(faturaId: string) {
    const r = await fetch(`/api/finans/belge?iliskili_tip=fatura&iliskili_id=${faturaId}`);
    const d = await r.json();
    if (d.ok) setAttachments(d.data);
  }

  async function uploadAttachment(faturaId: string, file: File) {
    setUploadingAttach(true);
    try {
      const fd = new FormData();
      fd.append("dosya", file);
      fd.append("iliskili_tip", "fatura");
      fd.append("iliskili_id", faturaId);
      const r = await fetch("/api/finans/belge", { method: "POST", body: fd });
      const d = await r.json();
      if (!d.ok) { toast.error(typeof d.error === "string" ? d.error : "Dosya yüklenemedi"); return; }
      loadAttachments(faturaId);
    } finally { setUploadingAttach(false); }
  }

  function addKalem() {
    setForm((f: any) => ({ ...f, kalemler: [...f.kalemler, { ...EMPTY_KALEM }] }));
  }
  function removeKalem(idx: number) {
    setForm((f: any) => ({
      ...f,
      kalemler: f.kalemler.length > 1 ? f.kalemler.filter((_: any, i: number) => i !== idx) : f.kalemler,
    }));
  }
  function updateKalem(idx: number, field: string, value: string) {
    setForm((f: any) => ({
      ...f,
      kalemler: f.kalemler.map((k: any, i: number) => (i === idx ? { ...k, [field]: value } : k)),
    }));
  }

  // Masraf merkezi/proje/departman listeleri genelde neredeyse boş oluyor —
  // fatura formundan ayrılmadan hızlıca yeni bir tane eklenebilir olsun diye
  // her select'in altına "+ Yeni Ekle" seçeneği eklendi.
  async function quickAddCari() {
    if (cariTip === "musteri") {
      const name = window.prompt("Yeni firma (müşteri) adı:");
      if (!name?.trim()) return;
      const r = await fetch("/api/companies", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }),
      });
      const d = await r.json();
      if (!d.ok) { toast.error(typeof d.error === "string" ? d.error : "Eklenemedi"); return; }
      const listRes = await fetch("/api/companies");
      const listData = await listRes.json();
      if (listData.ok) setCompanies(listData.data);
      setForm((f: any) => ({ ...f, cari_id: d.data.id }));
    } else {
      const unvan = window.prompt("Yeni işleten (tedarikçi) ünvanı:");
      if (!unvan?.trim()) return;
      const cep_tel = window.prompt("Cep telefonu:");
      if (!cep_tel?.trim()) { toast.error("Cep telefonu zorunlu, işleten eklenmedi"); return; }
      const r = await fetch("/api/isletenler", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unvan: unvan.trim(), cep_tel: cep_tel.trim() }),
      });
      const d = await r.json();
      if (!d.ok) { toast.error(typeof d.error === "string" ? d.error : "Eklenemedi"); return; }
      const listRes = await fetch("/api/isletenler?active=1&limit=500");
      const listData = await listRes.json();
      if (listData.ok) setIsletenler(listData.data);
      setForm((f: any) => ({ ...f, cari_id: d.data.id }));
    }
  }

  async function quickAddMasrafMerkezi(idx: number) {
    const ad = window.prompt("Yeni masraf merkezi adı:");
    if (!ad?.trim()) return;
    const r = await fetch("/api/finans/masraf-merkezi", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ad: ad.trim() }),
    });
    const d = await r.json();
    if (!d.ok) { toast.error(typeof d.error === "string" ? d.error : "Eklenemedi"); return; }
    const listRes = await fetch("/api/finans/masraf-merkezi?is_active=1");
    const listData = await listRes.json();
    if (listData.ok) setMasrafMerkezleri(listData.data);
    updateKalem(idx, "masraf_merkezi_id", d.data.id);
  }

  async function quickAddProje(idx: number) {
    const ad = window.prompt("Yeni proje adı:");
    if (!ad?.trim()) return;
    const r = await fetch("/api/finans/proje", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ad: ad.trim() }),
    });
    const d = await r.json();
    if (!d.ok) { toast.error(typeof d.error === "string" ? d.error : "Eklenemedi"); return; }
    const listRes = await fetch("/api/finans/proje?is_active=1");
    const listData = await listRes.json();
    if (listData.ok) setProjeler(listData.data);
    updateKalem(idx, "proje_id", d.data.id);
  }

  async function quickAddDepartman(idx: number) {
    const name = window.prompt("Yeni departman adı:");
    if (!name?.trim()) return;
    const r = await fetch("/api/departments", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }),
    });
    const d = await r.json();
    if (!d.ok) { toast.error(typeof d.error === "string" ? d.error : "Eklenemedi"); return; }
    const listRes = await fetch("/api/departments");
    const listData = await listRes.json();
    if (listData.ok) setDepartmanlar(listData.data);
    updateKalem(idx, "department_id", d.data.id);
  }

  function kalemTutar(k: any) {
    return (Number(k.miktar) || 0) * (Number(k.birim_fiyat) || 0);
  }
  function vergiOranFor(k: any) {
    const vk = vergiKodlari.find(v => v.id === k.vergi_kodu_id);
    return vk ? Number(vk.oran) : 0;
  }
  const araToplamEstimate = form.kalemler.reduce((sum: number, k: any) => sum + kalemTutar(k), 0);
  const vergiToplamEstimate = form.kalemler.reduce(
    (sum: number, k: any) => sum + kalemTutar(k) * (vergiOranFor(k) / 100), 0
  );
  const genelToplamEstimate = araToplamEstimate + vergiToplamEstimate;

  const cariTip = form.tur === "satis" ? "musteri" : "tedarikci";
  const cariOptions = form.tur === "satis" ? companies : isletenler;
  function cariLabel(c: any) { return form.tur === "satis" ? c.name : c.unvan; }

  // Liste satırında cari adını, ilgili faturanın cari_tip'ine göre companies/isletenler
  // listesinden eşleştirerek bulur.
  function rowCariAdi(row: any): string {
    if (row.cari_tip === "musteri") return companies.find(c => c.id === row.cari_id)?.name || "—";
    return isletenler.find(i => i.id === row.cari_id)?.unvan || "—";
  }

  async function save() {
    if (!form.tarih) { setSaveError("Tarih zorunludur"); return; }
    if (!form.cari_id) { setSaveError("Cari seçimi zorunludur"); return; }
    let payload: any;
    if (editing) {
      payload = {
        tur: form.tur,
        fatura_no: form.fatura_no.trim() || null,
        odeme_turu: form.odeme_turu || null,
        belge_turu_id: form.belge_turu_id || null,
        cari_tip: cariTip,
        cari_id: form.cari_id,
        tarih: form.tarih,
        vade_tarihi: form.vade_tarihi || null,
        para_birimi_kod: form.para_birimi_kod || "TRY",
        kur: Number(form.kur) || 1,
        aciklama: form.aciklama || null,
      };
    } else {
      const gecerliKalemler = form.kalemler
        .filter((k: any) => k.urun_hizmet_adi.trim() && Number(k.miktar) > 0)
        .map((k: any) => ({
          urun_hizmet_adi: k.urun_hizmet_adi.trim(),
          miktar: Number(k.miktar),
          birim_fiyat: Number(k.birim_fiyat) || 0,
          vergi_kodu_id: k.vergi_kodu_id || null,
          masraf_merkezi_id: k.masraf_merkezi_id || null,
          proje_id: k.proje_id || null,
          department_id: k.department_id || null,
        }));
      if (gecerliKalemler.length === 0) { setSaveError("En az bir kalem gereklidir"); return; }
      payload = {
        tur: form.tur,
        fatura_no: form.fatura_no.trim() || null,
        odeme_turu: form.odeme_turu || null,
        belge_turu_id: form.belge_turu_id || null,
        cari_tip: cariTip,
        cari_id: form.cari_id,
        tarih: form.tarih,
        vade_tarihi: form.vade_tarihi || null,
        para_birimi_kod: form.para_birimi_kod || "TRY",
        kur: Number(form.kur) || 1,
        aciklama: form.aciklama || null,
        kalemler: gecerliKalemler,
      };
    }
    setSaving(true); setSaveError(null);
    try {
      const url = editing ? `/api/finans/fatura/${editing.id}` : "/api/finans/fatura";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await res.json();
      if (!d.ok) { setSaveError(typeof d.error === "string" ? d.error : "Kayıt hatası"); return; }
      const faturaId = editing ? editing.id : d.data.id;
      if (pendingFile) await uploadAttachment(faturaId, pendingFile);
      toast.success(editing ? "Fatura güncellendi" : "Fatura oluşturuldu");
      setShowForm(false);
      load();
    } finally { setSaving(false); }
  }

  async function actOn(row: any, action: "onayla" | "iptal") {
    setActingId(row.id);
    try {
      const res = await fetch(`/api/finans/fatura/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const d = await res.json();
      if (!d.ok) { toast.error(typeof d.error === "string" ? d.error : "İşlem başarısız"); return; }
      toast.success(action === "onayla" ? "Fatura onaylandı" : "Fatura iptal edildi");
      load();
    } finally { setActingId(null); }
  }

  const canCreate = hasPermission(user, "finans_fatura:create");
  const canUpdate = hasPermission(user, "finans_fatura:update");
  const canApprove = hasPermission(user, "finans_fatura:approve");

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Faturalar</h1>
              <p className="text-zinc-500 text-sm mt-0.5">{rows.length} kayıt</p>
            </div>
            {canCreate && (
              <button onClick={openCreate} className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors whitespace-nowrap">
                + Yeni Fatura
              </button>
            )}
          </div>

          <div className="mb-4 inline-flex rounded-xl border border-zinc-800 bg-zinc-900 p-1">
            <button onClick={() => setActiveTab("satis")}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${activeTab === "satis" ? "bg-white text-zinc-950" : "text-zinc-400 hover:text-white"}`}>
              Satış
            </button>
            <button onClick={() => setActiveTab("alis")}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${activeTab === "alis" ? "bg-white text-zinc-950" : "text-zinc-400 hover:text-white"}`}>
              Alış
            </button>
          </div>

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-20 animate-pulse" />)}</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-zinc-600">Henüz {TUR_LABELS[activeTab]} faturası yok</div>
          ) : (
            <div className="space-y-2">
              {rows.map(row => {
                const clickable = row.durum === "taslak" && canUpdate;
                const showActions = row.durum === "taslak" && (canApprove || canUpdate);
                return (
                  <div key={row.id}
                    onClick={clickable ? () => openEdit(row) : undefined}
                    className={`bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 transition-colors ${clickable ? "cursor-pointer hover:border-zinc-700" : ""}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-semibold text-sm">{row.fatura_no || "—"}</span>
                      <span className="text-zinc-400 text-sm">{rowCariAdi(row)}</span>
                      <span className="text-zinc-500 text-xs">{toDateInputValue(row.tarih)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-md font-medium ml-auto ${DURUM_BADGE_CLASS[row.durum] || "bg-zinc-800 text-zinc-400"}`}>
                        {DURUM_LABELS[row.durum] || row.durum}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1.5">
                      <div className="flex items-center gap-2">
                        <p className="text-zinc-300 text-sm font-medium">
                          {formatTutar(row.genel_toplam)} {row.para_birimi_kod}
                        </p>
                        <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${ODEME_DURUMU_BADGE_CLASS[row.odeme_durumu] || "bg-zinc-800 text-zinc-400"}`}>
                          {ODEME_DURUMU_LABELS[row.odeme_durumu] || row.odeme_durumu}
                        </span>
                        {row.odeme_turu && <span className="text-xs px-2 py-0.5 rounded-md bg-zinc-800/60 text-zinc-500">{ODEME_TURU_LABELS[row.odeme_turu]}</span>}
                      </div>
                      {showActions && (
                        <div className="flex gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                          {canApprove && (
                            <button onClick={() => actOn(row, "onayla")} disabled={actingId === row.id}
                              className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-950 text-emerald-300 hover:bg-emerald-900 disabled:opacity-50 transition-colors">
                              Onayla
                            </button>
                          )}
                          {canUpdate && (
                            <button onClick={() => actOn(row, "iptal")} disabled={actingId === row.id}
                              className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-red-950 text-red-300 hover:bg-red-900 disabled:opacity-50 transition-colors">
                              İptal Et
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/60" onClick={() => setShowForm(false)} />
          <div className="w-full max-w-md bg-zinc-900 border-l border-zinc-800 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
              <h2 className="text-white font-semibold">
                {editing ? "Faturayı Düzenle" : `Yeni ${TUR_LABELS[activeTab]} Faturası`}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {saveError && <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">{saveError}</div>}

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">
                  {form.tur === "satis" ? "Firma (Müşteri) *" : "İşleten (Tedarikçi) *"}
                </span>
                <select value={form.cari_id}
                  onChange={e => e.target.value === "__new__" ? quickAddCari() : setForm((f: any) => ({ ...f, cari_id: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none">
                  <option value="">— Seçilmedi —</option>
                  {cariOptions.map((c: any) => <option key={c.id} value={c.id}>{cariLabel(c)}</option>)}
                  <option value="__new__">+ Yeni Ekle</option>
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Fatura No</span>
                  <input type="text" value={form.fatura_no} onChange={e => setForm((f: any) => ({ ...f, fatura_no: e.target.value }))}
                    placeholder="örn. A2026000123"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Ödeme Türü</span>
                  <select value={form.odeme_turu} onChange={e => setForm((f: any) => ({ ...f, odeme_turu: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none">
                    <option value="">— Seçilmedi —</option>
                    {Object.entries(ODEME_TURU_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Tarih *</span>
                  <input type="date" value={form.tarih} onChange={e => setForm((f: any) => ({ ...f, tarih: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Vade Tarihi</span>
                  <input type="date" value={form.vade_tarihi} onChange={e => setForm((f: any) => ({ ...f, vade_tarihi: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
                </label>
              </div>

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Belge Türü</span>
                <select value={form.belge_turu_id} onChange={e => setForm((f: any) => ({ ...f, belge_turu_id: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none">
                  <option value="">— Seçilmedi —</option>
                  {belgeTurleri.map(bt => <option key={bt.id} value={bt.id}>{bt.ad}</option>)}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Para Birimi</span>
                  <select value={form.para_birimi_kod} onChange={e => {
                      const yeniKod = e.target.value;
                      setForm((f: any) => ({ ...f, para_birimi_kod: yeniKod, kur: yeniKod === "TRY" ? "1" : f.kur }));
                    }}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none">
                    <option value="TRY">TRY</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Kur</span>
                  <input type="number" step="0.0001" min="0" value={form.kur}
                    disabled={form.para_birimi_kod === "TRY"}
                    onChange={e => setForm((f: any) => ({ ...f, kur: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed" />
                </label>
              </div>

              {editing ? (
                <div className="space-y-2">
                  <span className="text-zinc-400 text-xs font-medium block">Kalemler (bu fazda düzenlenemez)</span>
                  <div className="bg-zinc-800/60 border border-zinc-700 rounded-lg divide-y divide-zinc-700">
                    {(editing.kalemler || []).map((k: any) => (
                      <div key={k.id} className="px-3 py-2 flex items-center justify-between text-sm gap-2">
                        <span className="text-zinc-300">{k.urun_hizmet_adi} × {k.miktar}</span>
                        <span className="text-zinc-400 whitespace-nowrap">{formatTutar(k.tutar)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-zinc-600 text-xs">Kalemleri düzeltmek isterseniz faturayı iptal edip yeniden oluşturun.</p>
                  <div className="bg-zinc-800/60 border border-zinc-700 rounded-lg p-3 space-y-1 text-sm">
                    <div className="flex justify-between text-zinc-400"><span>Ara Toplam</span><span className="text-zinc-200">{formatTutar(editing.ara_toplam)}</span></div>
                    <div className="flex justify-between text-zinc-400"><span>Vergi Toplam</span><span className="text-zinc-200">{formatTutar(editing.vergi_toplam)}</span></div>
                    <div className="flex justify-between text-white font-semibold border-t border-zinc-700 pt-1 mt-1">
                      <span>Genel Toplam</span><span>{formatTutar(editing.genel_toplam)} {editing.para_birimi_kod}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400 text-xs font-medium">Kalemler *</span>
                    <button type="button" onClick={addKalem} className="text-xs font-semibold text-white hover:text-zinc-300">
                      + Satır Ekle
                    </button>
                  </div>
                  {form.kalemler.map((k: any, idx: number) => (
                    <div key={idx} className="bg-zinc-800/60 border border-zinc-700 rounded-lg p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <input type="text" value={k.urun_hizmet_adi} onChange={e => updateKalem(idx, "urun_hizmet_adi", e.target.value)}
                          placeholder="Ürün / hizmet adı"
                          className="flex-1 bg-zinc-900 border border-zinc-700 text-white text-sm px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                        {form.kalemler.length > 1 && (
                          <button type="button" onClick={() => removeKalem(idx)}
                            className="text-zinc-500 hover:text-red-400 text-lg leading-none px-1">×</button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <input type="number" step="0.01" min="0.01" value={k.miktar} onChange={e => updateKalem(idx, "miktar", e.target.value)}
                          placeholder="Miktar"
                          className="bg-zinc-900 border border-zinc-700 text-white text-sm px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                        <input type="number" step="0.01" min="0" value={k.birim_fiyat} onChange={e => updateKalem(idx, "birim_fiyat", e.target.value)}
                          placeholder="Birim Fiyat"
                          className="bg-zinc-900 border border-zinc-700 text-white text-sm px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                        <select value={k.vergi_kodu_id} onChange={e => updateKalem(idx, "vergi_kodu_id", e.target.value)}
                          className="bg-zinc-900 border border-zinc-700 text-white text-sm px-2 py-1.5 rounded-lg focus:outline-none">
                          <option value="">Vergi Yok</option>
                          {vergiKodlari.map(v => <option key={v.id} value={v.id}>{v.ad} (%{v.oran})</option>)}
                        </select>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <select value={k.masraf_merkezi_id}
                          onChange={e => e.target.value === "__new__" ? quickAddMasrafMerkezi(idx) : updateKalem(idx, "masraf_merkezi_id", e.target.value)}
                          className="bg-zinc-900 border border-zinc-700 text-zinc-400 text-xs px-2 py-1.5 rounded-lg focus:outline-none">
                          <option value="">Masraf Merkezi</option>
                          {masrafMerkezleri.map(m => <option key={m.id} value={m.id}>{m.ad}</option>)}
                          <option value="__new__">+ Yeni Ekle</option>
                        </select>
                        <select value={k.proje_id}
                          onChange={e => e.target.value === "__new__" ? quickAddProje(idx) : updateKalem(idx, "proje_id", e.target.value)}
                          className="bg-zinc-900 border border-zinc-700 text-zinc-400 text-xs px-2 py-1.5 rounded-lg focus:outline-none">
                          <option value="">Proje</option>
                          {projeler.map(p => <option key={p.id} value={p.id}>{p.ad}</option>)}
                          <option value="__new__">+ Yeni Ekle</option>
                        </select>
                        <select value={k.department_id}
                          onChange={e => e.target.value === "__new__" ? quickAddDepartman(idx) : updateKalem(idx, "department_id", e.target.value)}
                          className="bg-zinc-900 border border-zinc-700 text-zinc-400 text-xs px-2 py-1.5 rounded-lg focus:outline-none">
                          <option value="">Departman</option>
                          {departmanlar.map(dep => <option key={dep.id} value={dep.id}>{dep.name}</option>)}
                          <option value="__new__">+ Yeni Ekle</option>
                        </select>
                      </div>
                      <p className="text-right text-zinc-500 text-xs">
                        Tutar: <span className="text-zinc-300 font-medium">{formatTutar(kalemTutar(k))}</span>
                      </p>
                    </div>
                  ))}

                  <div className="bg-zinc-800/60 border border-zinc-700 rounded-lg p-3 space-y-1 text-sm">
                    <div className="flex justify-between text-zinc-400"><span>Ara Toplam</span><span className="text-zinc-200">{formatTutar(araToplamEstimate)}</span></div>
                    <div className="flex justify-between text-zinc-400"><span>Vergi Toplam</span><span className="text-zinc-200">{formatTutar(vergiToplamEstimate)}</span></div>
                    <div className="flex justify-between text-white font-semibold border-t border-zinc-700 pt-1 mt-1">
                      <span>Genel Toplam</span><span>{formatTutar(genelToplamEstimate)} {form.para_birimi_kod}</span>
                    </div>
                    <p className="text-zinc-600 text-xs pt-1">Toplamlar tahminidir; kesin değer kaydedildiğinde sunucudan gelir.</p>
                  </div>
                </div>
              )}

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Açıklama</span>
                <textarea value={form.aciklama} onChange={e => setForm((f: any) => ({ ...f, aciklama: e.target.value }))} rows={3}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </label>

              <div>
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Dosya Eki (fatura/fiş görseli veya PDF)</span>
                {attachments.length > 0 && (
                  <div className="space-y-1 mb-2">
                    {attachments.map(a => (
                      <a key={a.id} href={`/api/uploads/finans-belge/${a.dosya_yolu}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800">
                        📎 <span className="truncate">{a.dosya_adi}</span>
                      </a>
                    ))}
                  </div>
                )}
                {editing ? (
                  <label className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white cursor-pointer px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700 border-dashed">
                    {uploadingAttach ? "Yükleniyor..." : "+ Dosya Ekle"}
                    <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,application/xml,text/xml" className="hidden"
                      disabled={uploadingAttach}
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadAttachment(editing.id, f); e.target.value = ""; }} />
                  </label>
                ) : (
                  <label className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white cursor-pointer px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700 border-dashed">
                    {pendingFile ? pendingFile.name : "+ Dosya Seç"}
                    <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,application/xml,text/xml" className="hidden"
                      onChange={e => setPendingFile(e.target.files?.[0] || null)} />
                  </label>
                )}
              </div>
            </div>
            <div className="px-5 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving || !form.tarih || !form.cari_id}
                className="flex-1 bg-white text-zinc-950 font-semibold text-sm py-2.5 rounded-xl hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
