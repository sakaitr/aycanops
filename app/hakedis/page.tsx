"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import ComboboxSearch from "@/components/ComboboxSearch";
import { toast } from "@/lib/toast";
import { hasPermission } from "@/lib/permissions";
import { computeHakedisTutarlari } from "@/lib/hakedis-calc";
import { validatePeriod, financialNumber } from "@/lib/financial-validation";
import { errorText } from "@/lib/error-text";

function formatCurrency(v: number | string | null | undefined) {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(n);
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("tr-TR").format(new Date(d));
}

const DURUM_LABELS: Record<string, { label: string; cls: string }> = {
  taslak: { label: "Taslak", cls: "bg-zinc-800 border-zinc-700 text-zinc-400" },
  tahakkuk: { label: "Tahakkuk", cls: "bg-amber-950 border-amber-800 text-amber-300" },
  onaylandi: { label: "Onaylandı", cls: "bg-emerald-950 border-emerald-800 text-emerald-300" },
  odendi: { label: "Ödendi", cls: "bg-sky-950 border-sky-800 text-sky-300" },
  iptal: { label: "İptal", cls: "bg-zinc-900 border-zinc-800 text-zinc-600 line-through" },
};

const EMPTY_FORM = {
  isleten_id: "", donem_baslangic: "", donem_bitis: "", form_tipi_id: "",
  brut_tutar: "", kdv_orani: "20", tevkifat_orani: "0", aciklama: "",
};

export default function HakedisPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isletenler, setIsletenler] = useState<any[]>([]);
  const [formTipleri, setFormTipleri] = useState<any[]>([]);
  const [durumFilter, setDurumFilter] = useState("");
  const [isletenFilter, setIsletenFilter] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [availableCetele, setAvailableCetele] = useState<any[]>([]);
  const [ceteleLoading, setCeteleLoading] = useState(false);
  const [ceteleLoadError, setCeteleLoadError] = useState<string | null>(null);
  const [selectedCeteleIds, setSelectedCeteleIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data);
      else router.replace("/login");
    });
    fetch("/api/isletenler?limit=500").then(r => r.json()).then(d => { if (d.ok) setIsletenler(d.data); });
    fetch("/api/ucretlendirme-form-tipi").then(r => r.json()).then(d => { if (d.ok) setFormTipleri(d.data); });
  }, []);

  useEffect(() => { load(); }, [durumFilter, isletenFilter]);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (durumFilter) params.set("durum", durumFilter);
      if (isletenFilter) params.set("isleten_id", isletenFilter);
      params.set("limit", "200");
      const r = await fetch(`/api/hakedis?${params}`);
      const d = await r.json();
      if (d.ok) setRows(d.data);
    } finally { setLoading(false); }
  }

  // İşleten + dönem seçildiğinde, o işletenin araçlarına ait onaylı ve henüz
  // hiçbir hakedişe bağlanmamış çetele kayıtlarını getirir.
  useEffect(() => {
    setAvailableCetele([]); setSelectedCeteleIds(new Set()); setCeteleLoadError(null);
    if (!form.isleten_id || !form.donem_baslangic || !form.donem_bitis || form.donem_baslangic > form.donem_bitis) {
      setCeteleLoading(false);
      return;
    }
    const controller = new AbortController();
    loadAvailableCetele(controller.signal);
    return () => controller.abort();
  }, [form.isleten_id, form.donem_baslangic, form.donem_bitis]);

  async function loadAvailableCetele(signal: AbortSignal) {
    setCeteleLoading(true);
    try {
      const [araclarRes, ceteleRes] = await Promise.all([
        fetch(`/api/isletenler/${form.isleten_id}/araclar`, { signal }).then(r => r.json()),
        fetch(`/api/cetele?tarih=${form.donem_baslangic}&tarih_bitis=${form.donem_bitis}&durum=onaylandi&limit=500`, { signal }).then(r => r.json()),
      ]);
      if (signal.aborted) return;
      if (!araclarRes.ok || !ceteleRes.ok) throw new Error("Hizmet kayıtları yüklenemedi");
      // Aracın o günün tarihinde bu işletene atanmış olması gerekir — sadece
      // "bu araç bu işletende geçmişte hiç bulunmuş mu" yetmez, çünkü araç
      // sonradan başka bir işletene geçmiş olabilir (sunucu tarafı da aynı
      // kontrolü yapıyor, burası sadece ön izleme — işaretli görünen bir
      // satır sunucuda reddedilmesin diye).
      const owned = (vehicleId: string, tarih: string) => {
        const d = String(tarih).slice(0, 10);
        return araclarRes.data.some((a: any) =>
          a.vehicle_id === vehicleId &&
          String(a.baslangic_tarihi).slice(0, 10) <= d &&
          (!a.bitis_tarihi || String(a.bitis_tarihi).slice(0, 10) >= d)
        );
      };
      const filtered = ceteleRes.data.filter((c: any) => !c.hakedis_id && owned(c.vehicle_id, c.tarih));
      setAvailableCetele(filtered);
      setSelectedCeteleIds(new Set(filtered.map((c: any) => c.id)));
    } catch { if (!signal.aborted) setCeteleLoadError("Hizmet kayıtları yüklenemedi. Dönemi yeniden seçerek tekrar deneyin"); }
    finally { if (!signal.aborted) setCeteleLoading(false); }
  }

  function toggleCetele(id: string) {
    setSelectedCeteleIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function save() {
    if (saving || ceteleLoading) return;
    if (!form.isleten_id) { setSaveError("İşleten seçiniz"); return; }
    if (!form.donem_baslangic || !form.donem_bitis) { setSaveError("Dönem başlangıç/bitiş zorunludur"); return; }
    try {
      validatePeriod(form.donem_baslangic, form.donem_bitis);
      financialNumber(form.brut_tutar || 0, "Brüt tutar");
      financialNumber(form.kdv_orani, "KDV oranı", 100);
      financialNumber(form.tevkifat_orani, "Tevkifat oranı", 100);
    } catch (e) { setSaveError(e instanceof Error ? e.message : "Girdileri kontrol edin"); return; }
    if (ceteleLoadError || invalidPriceCount) { setSaveError(ceteleLoadError || "Seçili hizmetlerin fiyatlarını ve para birimini kontrol edin"); return; }
    setSaving(true); setSaveError(null);
    try {
      const res = await fetch("/api/hakedis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, cetele_ids: Array.from(selectedCeteleIds) }),
      });
      const d = await res.json();
      if (!d.ok) { setSaveError(errorText(d.error, "Kayıt hatası")); return; }
      const excluded = [...(d.data.already_linked || []), ...(d.data.not_owned || [])];
      if (excluded.length > 0) {
        toast.error(
          `Hakediş oluşturuldu ama ${excluded.length} çetele hariç tutuldu` +
          (d.data.already_linked?.length ? ` — ${d.data.already_linked.length} zaten başka hakedişte` : "") +
          (d.data.not_owned?.length ? `${d.data.already_linked?.length ? "," : ""} ${d.data.not_owned.length} bu tarihte bu işletene ait değil` : "")
        );
      } else {
        toast.success("Hakediş oluşturuldu");
      }
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      load();
    } catch { setSaveError("Kayıt işlemi tamamlanamadı. Girdileriniz korundu"); }
    finally { setSaving(false); }
  }

  async function doAction(id: string, action: string, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    const res = await fetch(`/api/hakedis/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const d = await res.json();
    if (!d.ok) { toast.error(d.error || "Hata"); return; }
    toast.success("İşlem tamamlandı");
    load();
  }

  const canCreate = hasPermission(user, "hakedis:create");
  const canApprove = hasPermission(user, "hakedis:approve");
  const canPay = hasPermission(user, "hakedis:pay");

  // Çetele bağlıysa brüt, seçili çetelelerin güzergah fiyatından hesaplanan toplamıdır —
  // araca çeteleden işlenen iş otomatik olarak hakedişe yansır. Çetele yoksa elle girilir.
  const ceteleToplam = availableCetele
    .filter((c: any) => selectedCeteleIds.has(c.id))
    .reduce((sum: number, c: any) => sum + (Number(c.birim_ucret) || 0), 0);
  const invalidPriceCount = availableCetele.filter(c => selectedCeteleIds.has(c.id) &&
    (c.birim_ucret == null || !Number.isFinite(Number(c.birim_ucret)) || Number(c.birim_ucret) < 0 || c.birim_ucret_para_birimi !== "TRY")).length;
  const ceteleFiyatliMi = selectedCeteleIds.size > 0;
  const brut = ceteleFiyatliMi ? ceteleToplam : parseFloat(form.brut_tutar || "0");
  const kdvOrani = parseFloat(form.kdv_orani || "0");
  const tevkifatOrani = parseFloat(form.tevkifat_orani || "0");
  const { kdvTutari, tevkifatTutari, netTutar } = computeHakedisTutarlari(brut, kdvOrani, tevkifatOrani);

  const toplamNet = rows.reduce((sum, r) => sum + Number(r.net_tutar || 0), 0);

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-5xl mx-auto px-4 py-6">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Hakediş</h1>
              <p className="text-zinc-500 text-sm mt-0.5">{rows.length} kayıt · Toplam net {formatCurrency(toplamNet)}</p>
            </div>
            <div className="flex gap-2">
              {canCreate && (
                <button
                  onClick={() => router.push("/hakedis/tahakkuk")}
                  className="bg-zinc-800 text-zinc-200 font-medium text-sm px-4 py-2 rounded-xl hover:bg-zinc-700 transition-colors whitespace-nowrap"
                >
                  Toplu Tahakkuk
                </button>
              )}
              {canCreate && (
                <button
                  onClick={() => { setShowForm(true); setForm({ ...EMPTY_FORM }); setSaveError(null); }}
                  className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors whitespace-nowrap"
                >
                  + Yeni Hakediş
                </button>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2 mb-6">
            <ComboboxSearch
              options={isletenler.map((i: any) => ({ value: i.id, label: i.unvan }))}
              value={isletenFilter}
              onChange={setIsletenFilter}
              placeholder="İşletene göre filtrele..."
              emptyLabel="— Tüm İşletenler —"
            />
            <select value={durumFilter} onChange={e => setDurumFilter(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-zinc-600">
              <option value="">Tüm Durumlar</option>
              {Object.entries(DURUM_LABELS).map(([v, l]) => <option key={v} value={v}>{l.label}</option>)}
            </select>
          </div>

          {/* List */}
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-20 animate-pulse" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-zinc-600">Hakediş kaydı yok</div>
          ) : (
            <div className="space-y-2">
              {rows.map(row => {
                const badge = DURUM_LABELS[row.durum] || DURUM_LABELS.taslak;
                return (
                  <div key={row.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-white font-medium text-sm">{row.isleten_unvan}</span>
                      <span className="text-zinc-600 font-mono text-xs">{row.cari_kod}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${badge.cls}`}>{badge.label}</span>
                      {row.form_tipi_adi && <span className="text-zinc-600 text-xs">· {row.form_tipi_adi}</span>}
                      <span className="text-zinc-600 text-xs ml-auto">{formatDate(row.donem_baslangic)} — {formatDate(row.donem_bitis)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-zinc-500 text-xs">
                        Brüt {formatCurrency(row.brut_tutar)} · KDV {formatCurrency(row.kdv_tutari)} · Tevkifat {formatCurrency(row.tevkifat_tutari)}
                        {row.cetele_sayisi > 0 ? ` · ${row.cetele_sayisi} çetele` : ""}
                      </p>
                      <p className="text-white font-semibold text-sm">{formatCurrency(row.net_tutar)}</p>
                    </div>
                    {canCreate && row.durum === "taslak" && (
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => doAction(row.id, "tahakkuk")}
                          className="text-xs px-3 py-1.5 rounded-lg border border-amber-800 bg-amber-950 text-amber-300 hover:bg-amber-900 transition-colors">
                          Tahakkuk Ettir
                        </button>
                        <button onClick={() => doAction(row.id, "iptal", "Bu hakediş iptal edilsin mi?")}
                          className="text-xs px-3 py-1.5 rounded-lg border border-red-800 bg-red-950 text-red-300 hover:bg-red-900 transition-colors">
                          İptal
                        </button>
                      </div>
                    )}
                    {canApprove && row.durum === "tahakkuk" && (
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => doAction(row.id, "onayla", "Bu hakediş onaylansın mı? İşleten cari hesabına işlenecek.")}
                          className="text-xs px-3 py-1.5 rounded-lg border border-emerald-800 bg-emerald-950 text-emerald-300 hover:bg-emerald-900 transition-colors">
                          Onayla
                        </button>
                        <button onClick={() => doAction(row.id, "iptal", "Bu hakediş iptal edilsin mi?")}
                          className="text-xs px-3 py-1.5 rounded-lg border border-red-800 bg-red-950 text-red-300 hover:bg-red-900 transition-colors">
                          İptal
                        </button>
                      </div>
                    )}
                    {canPay && row.durum === "onaylandi" && (
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => doAction(row.id, "odendi", "Ödendi olarak işaretlensin mi? Cari hesaptan düşülecek.")}
                          className="text-xs px-3 py-1.5 rounded-lg border border-sky-800 bg-sky-950 text-sky-300 hover:bg-sky-900 transition-colors">
                          Ödendi İşaretle
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Yeni hakediş formu */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/60" onClick={() => setShowForm(false)} />
          <div className="w-full max-w-lg bg-zinc-900 border-l border-zinc-800 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
              <h2 className="text-white font-semibold">Yeni Hakediş</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {saveError && (
                <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">{saveError}</div>
              )}

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">İşleten *</span>
                <ComboboxSearch
                  options={isletenler.map((i: any) => ({ value: i.id, label: `${i.unvan} (${i.cari_kod})` }))}
                  value={form.isleten_id}
                  onChange={v => setForm(f => ({ ...f, isleten_id: v }))}
                  placeholder="İşleten seç..."
                  emptyLabel="— İşleten Yok —"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Dönem Başlangıç *</span>
                  <input type="date" value={form.donem_baslangic} onChange={e => setForm(f => ({ ...f, donem_baslangic: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Dönem Bitiş *</span>
                  <input type="date" min={form.donem_baslangic} value={form.donem_bitis} onChange={e => setForm(f => ({ ...f, donem_bitis: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
                </label>
              </div>

              {formTipleri.length > 0 && (
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Ücretlendirme Formu</span>
                  <select value={form.form_tipi_id} onChange={e => setForm(f => ({ ...f, form_tipi_id: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                    <option value="">— Seçilmedi —</option>
                    {formTipleri.map((f: any) => <option key={f.id} value={f.id}>{f.form_adi}</option>)}
                  </select>
                </label>
              )}

              {/* Bağlanacak çetele kayıtları */}
              {form.isleten_id && form.donem_baslangic && form.donem_bitis && (
                <div className="border-t border-zinc-800 pt-3">
                  <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2">
                    Bağlanacak Çetele Kayıtları {ceteleLoading ? "" : `(${selectedCeteleIds.size}/${availableCetele.length})`}
                  </p>
                  {ceteleLoading ? (
                    <p className="text-zinc-600 text-xs">Yükleniyor...</p>
                  ) : availableCetele.length === 0 ? (
                    <p className="text-zinc-600 text-xs">Bu dönemde bu işletene ait bağlanabilir onaylı çetele kaydı yok.</p>
                  ) : (
                    <>
                    <div className="max-h-40 overflow-y-auto space-y-1 border border-zinc-800 rounded-lg p-2">
                      {availableCetele.map((c: any) => (
                        <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer px-1.5 py-1 rounded hover:bg-zinc-800/60">
                          <input type="checkbox" checked={selectedCeteleIds.has(c.id)} onChange={() => toggleCetele(c.id)}
                            className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-800 accent-indigo-500" />
                          <span className="text-zinc-300 font-mono">{c.plate}</span>
                          <span className="text-zinc-500">{c.route_name || c.hareket_tipi}{c.yon ? ` · ${c.yon === "giris" ? "Giriş" : "Çıkış"}` : ""}</span>
                          <span className="text-zinc-600">{formatDate(c.tarih)}</span>
                          <span className={`ml-auto font-medium ${Number(c.birim_ucret) > 0 ? "text-emerald-400" : "text-zinc-600"}`}>
                            {c.birim_ucret != null ? `${Number(c.birim_ucret).toLocaleString("tr-TR")} ${c.birim_ucret_para_birimi || "?"}` : "fiyat tanımlı değil"}
                          </span>
                        </label>
                      ))}
                    </div>
                    <p className="text-zinc-500 text-xs mt-2">
                      Seçili çetelelerin toplamı: <span className="text-white font-semibold">{formatCurrency(ceteleToplam)}</span>
                      {ceteleFiyatliMi
                        ? " — brüt tutara otomatik yansır"
                        : " — hizmet seçilmedi; manuel brüt tutar kullanılacak"}
                    </p>
                    {invalidPriceCount > 0 && <p role="alert" className="text-red-400 text-xs">{invalidPriceCount} hizmette fiyat eksik veya para birimi uyumsuz. Kaydetmeden önce fiyatı düzeltin.</p>}
                    </>
                  )}
                  {ceteleLoadError && <p role="alert" className="text-red-400 text-xs mt-2">{ceteleLoadError}</p>}
                </div>
              )}

              <div className="border-t border-zinc-800 pt-3 space-y-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">
                    Brüt Tutar {ceteleFiyatliMi && <span className="text-zinc-600 font-normal">(çeteleden otomatik hesaplanıyor)</span>}
                  </span>
                  <input type="number" min="0" step="0.01"
                    value={ceteleFiyatliMi ? ceteleToplam.toFixed(2) : form.brut_tutar}
                    onChange={e => setForm(f => ({ ...f, brut_tutar: e.target.value }))}
                    disabled={ceteleFiyatliMi}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 disabled:opacity-60 disabled:cursor-not-allowed" placeholder="0.00" />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-zinc-400 text-xs font-medium mb-1 block">KDV Oranı (%)</span>
                    <input type="number" min="0" max="100" step="0.01" value={form.kdv_orani} onChange={e => setForm(f => ({ ...f, kdv_orani: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                  </label>
                  <label className="block">
                    <span className="text-zinc-400 text-xs font-medium mb-1 block">KDV Tevkifat Oranı (%)</span>
                    <input type="number" min="0" max="100" step="0.01" value={form.tevkifat_orani} onChange={e => setForm(f => ({ ...f, tevkifat_orani: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                  </label>
                </div>

                <div className="bg-zinc-800/60 rounded-lg p-3 space-y-1 text-xs">
                  <div className="flex justify-between text-zinc-400"><span>KDV Tutarı</span><span>{formatCurrency(kdvTutari)}</span></div>
                  <div className="flex justify-between text-zinc-400"><span>Tevkifat Tutarı</span><span>-{formatCurrency(tevkifatTutari)}</span></div>
                  <div className="flex justify-between text-white font-semibold text-sm pt-1 border-t border-zinc-700"><span>Net Tutar</span><span>{formatCurrency(netTutar)}</span></div>
                </div>
              </div>

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Açıklama</span>
                <textarea value={form.aciklama} onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))} rows={2}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </label>
            </div>

            <div className="px-5 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={() => setShowForm(false)}
                className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors">
                İptal
              </button>
              <button onClick={save} disabled={saving || ceteleLoading || !!ceteleLoadError || invalidPriceCount > 0 || !form.isleten_id || !form.donem_baslangic || !form.donem_bitis || form.donem_baslangic > form.donem_bitis}
                className="flex-1 bg-white text-zinc-950 font-semibold text-sm py-2.5 rounded-xl hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                {saving ? "Kaydediliyor..." : "Taslak Olarak Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
