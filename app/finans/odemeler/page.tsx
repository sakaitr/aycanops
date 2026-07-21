"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { toast } from "@/lib/toast";
import { hasPermission } from "@/lib/permissions";
import { todayIstanbul } from "@/lib/time";

const CARI_TIP_LABELS: Record<string, string> = { musteri: "Müşteri", tedarikci: "Tedarikçi" };
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

// MySQL DATE sütunları mysql2 tarafından JS Date nesnesi olarak döner ve bu nesne
// JSON.stringify sırasında UTC'ye çevrilir. new Date(...) ile ayrıştırıp tarayıcının
// yerel (Europe/Istanbul, sunucuyla aynı dilim) metotlarıyla okumak UTC kaymasını
// geri alır (bkz. app/finans/faturalar/page.tsx aynı yardımcı).
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

const EMPTY_FORM = {
  cari_tip: "musteri" as "musteri" | "tedarikci",
  cari_id: "",
  tutar: "",
  tarih: todayIstanbul(),
  kasa_banka_hesabi_id: "",
  odeme_yontemi_id: "",
  aciklama: "",
};

type Eslesme = { checked: boolean; tutar: string };

export default function OdemelerPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [companies, setCompanies] = useState<any[]>([]);
  const [isletenler, setIsletenler] = useState<any[]>([]);
  const [kasaBankaHesaplari, setKasaBankaHesaplari] = useState<any[]>([]);
  const [odemeYontemleri, setOdemeYontemleri] = useState<any[]>([]);
  const [faturalar, setFaturalar] = useState<any[]>([]);

  // fatura_id -> { checked, tutar } — cari değiştiğinde sıfırlanır.
  const [eslesmeler, setEslesmeler] = useState<Record<string, Eslesme>>({});

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data); else router.replace("/login");
    });
    fetch("/api/companies").then(r => r.json()).then(d => { if (d.ok) setCompanies(d.data); });
    fetch("/api/isletenler?active=1&limit=500").then(r => r.json()).then(d => { if (d.ok) setIsletenler(d.data); });
    fetch("/api/finans/kasa-banka?is_active=1").then(r => r.json()).then(d => { if (d.ok) setKasaBankaHesaplari(d.data); });
    fetch("/api/finans/odeme-yontemi?is_active=1").then(r => r.json()).then(d => { if (d.ok) setOdemeYontemleri(d.data); });
    // Açık fatura kontrol listesi için Task 6 fatura listesi tek seferde çekilir;
    // şirket kısıtlaması (allowed_companies) sunucu tarafında zaten uygulanıyor,
    // burada sadece cari_id + odeme_durumu'na göre client-side filtreleniyor.
    fetch("/api/finans/fatura").then(r => r.json()).then(d => { if (d.ok) setFaturalar(d.data); });
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/finans/odeme");
      const d = await r.json();
      if (d.ok) setRows(d.data);
    } finally { setLoading(false); }
  }

  function openCreate() {
    setForm({ ...EMPTY_FORM });
    setEslesmeler({});
    setSaveError(null);
    setShowForm(true);
  }

  const cariOptions = form.cari_tip === "musteri" ? companies : isletenler;
  function cariLabel(c: any) { return form.cari_tip === "musteri" ? c.name : c.unvan; }

  // Liste satırında cari adını, ödemenin cari_tip'ine göre companies/isletenler
  // listesinden eşleştirerek bulur (bkz. app/finans/faturalar/page.tsx aynı desen).
  function rowCariAdi(row: any): string {
    if (row.cari_tip === "musteri") return companies.find(c => c.id === row.cari_id)?.name || "—";
    return isletenler.find(i => i.id === row.cari_id)?.unvan || "—";
  }

  // Seçilen cariye ait, henüz tam ödenmemiş faturalar. İptal edilmiş faturalar
  // (durum='iptal') eşleştirme listesine dahil edilmez.
  const acikFaturalar = useMemo(() => {
    if (!form.cari_id) return [];
    return faturalar.filter(f =>
      f.cari_tip === form.cari_tip &&
      f.cari_id === form.cari_id &&
      f.durum !== "iptal" &&
      (f.odeme_durumu === "odenmedi" || f.odeme_durumu === "kismen_odendi")
    );
  }, [faturalar, form.cari_tip, form.cari_id]);

  function onCariChange(cari_id: string) {
    setForm(f => ({ ...f, cari_id }));
    // Cari değişince eşleşme seçimlerini sıfırla; her açık fatura için
    // varsayılan tutar fatura toplamıdır — kısmen ödenmiş faturalarda kalan
    // bakiye bu fazda fatura listesi endpoint'inden gelmiyor (Task 6'nın
    // fatura route'u değiştirilmiyor), bu yüzden varsayılan olarak genel
    // toplam kullanılır; kullanıcı gerekirse tutarı elle düşürebilir.
    const yeni: Record<string, Eslesme> = {};
    for (const f2 of faturalar) {
      if (f2.cari_tip === form.cari_tip && f2.cari_id === cari_id && f2.durum !== "iptal" &&
          (f2.odeme_durumu === "odenmedi" || f2.odeme_durumu === "kismen_odendi")) {
        yeni[f2.id] = { checked: false, tutar: String(f2.genel_toplam) };
      }
    }
    setEslesmeler(yeni);
  }

  function toggleFatura(faturaId: string, checked: boolean) {
    setEslesmeler(e => ({ ...e, [faturaId]: { ...e[faturaId], checked } }));
  }
  function updateFaturaTutar(faturaId: string, tutar: string) {
    setEslesmeler(e => ({ ...e, [faturaId]: { ...e[faturaId], tutar } }));
  }

  const toplamEslesenTutar = useMemo(() => {
    return acikFaturalar.reduce((sum, f) => {
      const e = eslesmeler[f.id];
      if (!e?.checked) return sum;
      return sum + (Number(e.tutar) || 0);
    }, 0);
  }, [acikFaturalar, eslesmeler]);

  const odemeTutari = Number(form.tutar) || 0;
  const eslesmeAsiyor = toplamEslesenTutar > odemeTutari && odemeTutari > 0;

  async function save() {
    if (!form.tarih) { setSaveError("Tarih zorunludur"); return; }
    if (!form.cari_id) { setSaveError("Cari seçimi zorunludur"); return; }
    if (!form.tutar.trim() || !(Number(form.tutar) > 0)) { setSaveError("Tutar geçerli bir sayı olmalıdır"); return; }
    if (!form.kasa_banka_hesabi_id) { setSaveError("Kasa/Banka hesabı zorunludur"); return; }

    const fatura_eslesme = acikFaturalar
      .filter(f => eslesmeler[f.id]?.checked && Number(eslesmeler[f.id]?.tutar) > 0)
      .map(f => ({ fatura_id: f.id, tutar: Number(eslesmeler[f.id].tutar) }));

    const payload = {
      cari_tip: form.cari_tip,
      cari_id: form.cari_id,
      tutar: Number(form.tutar),
      tarih: form.tarih,
      kasa_banka_hesabi_id: form.kasa_banka_hesabi_id,
      odeme_yontemi_id: form.odeme_yontemi_id || null,
      aciklama: form.aciklama || null,
      fatura_eslesme,
    };

    setSaving(true); setSaveError(null);
    try {
      const res = await fetch("/api/finans/odeme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!d.ok) { setSaveError(typeof d.error === "string" ? d.error : "Kayıt hatası"); return; }
      toast.success("Ödeme oluşturuldu");
      setShowForm(false);
      load();
      // Fatura eşleşmeleri değiştiği için açık fatura listesini tazele.
      fetch("/api/finans/fatura").then(r => r.json()).then(d2 => { if (d2.ok) setFaturalar(d2.data); });
    } finally { setSaving(false); }
  }

  async function remove(row: any) {
    if (!window.confirm("Bu ödeme silinsin mi? Fatura eşleşmeleri de kaldırılır ve ilgili faturaların ödeme durumu yeniden hesaplanır.")) return;
    setDeletingId(row.id);
    try {
      const res = await fetch(`/api/finans/odeme/${row.id}`, { method: "DELETE" });
      const d = await res.json();
      if (!d.ok) { toast.error(typeof d.error === "string" ? d.error : "Silme başarısız"); return; }
      toast.success("Ödeme silindi");
      load();
      fetch("/api/finans/fatura").then(r => r.json()).then(d2 => { if (d2.ok) setFaturalar(d2.data); });
    } finally { setDeletingId(null); }
  }

  const canCreate = hasPermission(user, "finans_odeme:create");

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Ödemeler</h1>
              <p className="text-zinc-500 text-sm mt-0.5">{rows.length} kayıt</p>
            </div>
            {canCreate && (
              <button onClick={openCreate} className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors whitespace-nowrap">
                + Yeni Ödeme
              </button>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-20 animate-pulse" />)}</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-zinc-600">Henüz ödeme yok</div>
          ) : (
            <div className="space-y-2">
              {rows.map(row => (
                <div key={row.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-semibold text-sm">{rowCariAdi(row)}</span>
                    <span className="text-xs px-2 py-0.5 rounded-md font-medium bg-zinc-800 text-zinc-400">
                      {CARI_TIP_LABELS[row.cari_tip] || row.cari_tip}
                    </span>
                    <span className="text-zinc-500 text-xs">{toDateInputValue(row.tarih)}</span>
                    {canCreate && (
                      <button onClick={() => remove(row)} disabled={deletingId === row.id}
                        className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-lg bg-red-950 text-red-300 hover:bg-red-900 disabled:opacity-50 transition-colors">
                        {deletingId === row.id ? "Siliniyor..." : "Sil"}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1.5">
                    <div className="flex items-center gap-2">
                      <p className="text-zinc-300 text-sm font-medium">{formatTutar(row.tutar)} TRY</p>
                      <span className="text-zinc-500 text-xs">{row.kasa_banka_ad || "—"}</span>
                      {row.odeme_yontemi_ad && <span className="text-zinc-600 text-xs">· {row.odeme_yontemi_ad}</span>}
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-md font-medium bg-zinc-800 text-zinc-400 whitespace-nowrap">
                      {row.eslesen_fatura_sayisi > 0
                        ? `${row.eslesen_fatura_sayisi} faturaya eşleşti`
                        : "Eşleşme yok"}
                    </span>
                  </div>
                  {row.aciklama && <p className="text-zinc-600 text-xs mt-1.5">{row.aciklama}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/60" onClick={() => setShowForm(false)} />
          <div className="w-full max-w-md bg-zinc-900 border-l border-zinc-800 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
              <h2 className="text-white font-semibold">Yeni Ödeme</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {saveError && <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">{saveError}</div>}

              <div className="mb-1 inline-flex rounded-xl border border-zinc-800 bg-zinc-950 p-1">
                <button onClick={() => { setForm(f => ({ ...f, cari_tip: "musteri", cari_id: "" })); setEslesmeler({}); }}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${form.cari_tip === "musteri" ? "bg-white text-zinc-950" : "text-zinc-400 hover:text-white"}`}>
                  Müşteri
                </button>
                <button onClick={() => { setForm(f => ({ ...f, cari_tip: "tedarikci", cari_id: "" })); setEslesmeler({}); }}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${form.cari_tip === "tedarikci" ? "bg-white text-zinc-950" : "text-zinc-400 hover:text-white"}`}>
                  Tedarikçi
                </button>
              </div>

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">
                  {form.cari_tip === "musteri" ? "Firma (Müşteri) *" : "İşleten (Tedarikçi) *"}
                </span>
                <select value={form.cari_id} onChange={e => onCariChange(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none">
                  <option value="">— Seçilmedi —</option>
                  {cariOptions.map((c: any) => <option key={c.id} value={c.id}>{cariLabel(c)}</option>)}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Tutar *</span>
                  <input type="number" step="0.01" min="0.01" value={form.tutar}
                    onChange={e => setForm(f => ({ ...f, tutar: e.target.value }))}
                    placeholder="0.00"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Tarih *</span>
                  <input type="date" value={form.tarih} onChange={e => setForm(f => ({ ...f, tarih: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
                </label>
              </div>

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Kasa/Banka Hesabı *</span>
                <select value={form.kasa_banka_hesabi_id} onChange={e => setForm(f => ({ ...f, kasa_banka_hesabi_id: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none">
                  <option value="">— Seçilmedi —</option>
                  {kasaBankaHesaplari.map(h => <option key={h.id} value={h.id}>{h.ad}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Ödeme Yöntemi</span>
                <select value={form.odeme_yontemi_id} onChange={e => setForm(f => ({ ...f, odeme_yontemi_id: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none">
                  <option value="">— Seçilmedi —</option>
                  {odemeYontemleri.map(o => <option key={o.id} value={o.id}>{o.ad}</option>)}
                </select>
              </label>

              {form.cari_id && (
                <div className="space-y-2">
                  <span className="text-zinc-400 text-xs font-medium block">Açık Faturalar</span>
                  {acikFaturalar.length === 0 ? (
                    <p className="text-zinc-600 text-xs">Bu cariye ait açık fatura bulunamadı.</p>
                  ) : (
                    <div className="bg-zinc-800/60 border border-zinc-700 rounded-lg divide-y divide-zinc-700">
                      {acikFaturalar.map(f => {
                        const e = eslesmeler[f.id] || { checked: false, tutar: String(f.genel_toplam) };
                        return (
                          <div key={f.id} className="px-3 py-2 flex items-center gap-2">
                            <input type="checkbox" checked={e.checked}
                              onChange={ev => toggleFatura(f.id, ev.target.checked)}
                              className="shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-zinc-300 text-sm truncate">{f.fatura_no || toDateInputValue(f.tarih)}</p>
                              <p className="text-zinc-500 text-xs flex items-center gap-1.5">
                                <span>{formatTutar(f.genel_toplam)} {f.para_birimi_kod}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ODEME_DURUMU_BADGE_CLASS[f.odeme_durumu] || "bg-zinc-800 text-zinc-400"}`}>
                                  {ODEME_DURUMU_LABELS[f.odeme_durumu] || f.odeme_durumu}
                                </span>
                              </p>
                            </div>
                            <input type="number" step="0.01" min="0" value={e.tutar} disabled={!e.checked}
                              onChange={ev => updateFaturaTutar(f.id, ev.target.value)}
                              className="w-24 bg-zinc-900 border border-zinc-700 text-white text-sm px-2 py-1 rounded-lg focus:outline-none disabled:opacity-40" />
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {eslesmeAsiyor && (
                    <p className="text-amber-400 text-xs">
                      Eşleştirilen toplam ({formatTutar(toplamEslesenTutar)}) ödeme tutarını ({formatTutar(odemeTutari)}) aşıyor.
                    </p>
                  )}
                </div>
              )}

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Açıklama</span>
                <textarea value={form.aciklama} onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))} rows={3}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </label>
            </div>
            <div className="px-5 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving || !form.tarih || !form.cari_id || !form.tutar.trim() || !form.kasa_banka_hesabi_id}
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
