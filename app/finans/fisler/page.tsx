"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { toast } from "@/lib/toast";
import { hasPermission } from "@/lib/permissions";
import { todayIstanbul } from "@/lib/time";

const TIP_LABELS: Record<string, string> = {
  gider_fisi: "Gider Fişi",
  tahsilat_makbuzu: "Tahsilat Makbuzu",
  tediye_makbuzu: "Tediye Makbuzu",
  kasa_giris: "Kasa Girişi",
  kasa_cikis: "Kasa Çıkışı",
  banka_islem: "Banka İşlemi",
  virman: "Virman",
  mahsup: "Mahsup",
  acilis_kapanis: "Açılış/Kapanış",
  personel_masraf: "Personel Masraf Formu",
};

const ODEME_TURU_LABELS: Record<string, string> = {
  pesin: "Peşin",
  vade: "Vade",
  cek: "Çek",
  kart: "Kart",
  nakit: "Nakit",
};

const EMPTY_FORM = {
  tip: "gider_fisi",
  fis_no: "",
  odeme_turu: "",
  tarih: todayIstanbul(),
  tutar: "",
  kasa_banka_hesabi_id: "",
  karsi_hesap_id: "",
  aciklama: "",
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

export default function FislerPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [kasaBankaHesaplari, setKasaBankaHesaplari] = useState<any[]>([]);
  const [tipFilter, setTipFilter] = useState("");

  const [attachments, setAttachments] = useState<any[]>([]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadingAttach, setUploadingAttach] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data); else router.replace("/login");
    });
    fetch("/api/finans/kasa-banka?is_active=1").then(r => r.json()).then(d => { if (d.ok) setKasaBankaHesaplari(d.data); });
  }, []);

  useEffect(() => { load(); }, [tipFilter]);

  async function load() {
    setLoading(true);
    try {
      const qs = tipFilter ? `?tip=${tipFilter}` : "";
      const r = await fetch(`/api/finans/fis${qs}`);
      const d = await r.json();
      if (d.ok) setRows(d.data);
    } finally { setLoading(false); }
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setAttachments([]);
    setPendingFile(null);
    setSaveError(null);
    setShowForm(true);
  }
  function openEdit(row: any) {
    setEditing(row);
    setForm({
      tip: row.tip,
      fis_no: row.fis_no || "",
      odeme_turu: row.odeme_turu || "",
      tarih: toDateInputValue(row.tarih),
      tutar: row.tutar != null ? String(row.tutar) : "",
      kasa_banka_hesabi_id: row.kasa_banka_hesabi_id || "",
      karsi_hesap_id: row.karsi_hesap_id || "",
      aciklama: row.aciklama || "",
    });
    setPendingFile(null);
    setSaveError(null); setShowForm(true);
    loadAttachments(row.id);
  }

  async function loadAttachments(fisId: string) {
    const r = await fetch(`/api/finans/belge?iliskili_tip=fis&iliskili_id=${fisId}`);
    const d = await r.json();
    if (d.ok) setAttachments(d.data);
  }

  // finans_fis.belge_id tekli bir FK (fatura'daki gibi çoklu ilişki değil) —
  // yeni dosya yüklenince hem finans_belge'de genel ilişki kurulur hem de
  // fiş kaydının belge_id'si en son yüklenene güncellenir.
  async function attachToFis(fisId: string, file: File, baseRow: any) {
    setUploadingAttach(true);
    try {
      const fd = new FormData();
      fd.append("dosya", file);
      fd.append("iliskili_tip", "fis");
      fd.append("iliskili_id", fisId);
      const r = await fetch("/api/finans/belge", { method: "POST", body: fd });
      const d = await r.json();
      if (!d.ok) { toast.error(typeof d.error === "string" ? d.error : "Dosya yüklenemedi"); return; }
      const belgeId = d.data.id;
      await fetch(`/api/finans/fis/${fisId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tip: baseRow.tip, fis_no: baseRow.fis_no || null, odeme_turu: baseRow.odeme_turu || null,
          tarih: baseRow.tarih, tutar: Number(baseRow.tutar),
          kasa_banka_hesabi_id: baseRow.kasa_banka_hesabi_id || null,
          karsi_hesap_id: baseRow.karsi_hesap_id || null,
          belge_id: belgeId, aciklama: baseRow.aciklama || null,
        }),
      });
      loadAttachments(fisId);
    } finally { setUploadingAttach(false); }
  }

  async function save() {
    const tutar = Number(form.tutar);
    if (!form.tarih) { setSaveError("Tarih zorunludur"); return; }
    if (!form.tutar.trim() || !Number.isFinite(tutar)) { setSaveError("Tutar geçerli bir sayı olmalıdır"); return; }
    setSaving(true); setSaveError(null);
    try {
      const payload = {
        tip: form.tip,
        fis_no: form.fis_no.trim() || null,
        odeme_turu: form.odeme_turu || null,
        tarih: form.tarih,
        tutar,
        kasa_banka_hesabi_id: form.kasa_banka_hesabi_id || null,
        karsi_hesap_id: form.tip === "virman" ? (form.karsi_hesap_id || null) : null,
        // Normal başlık güncellemesi mevcut dosya ilişkisini silmesin diye
        // (finansFisSchema'da belge_id ayrı bir akışla — attachToFis — yönetilir).
        belge_id: editing ? (editing.belge_id ?? null) : null,
        aciklama: form.aciklama || null,
      };
      const url = editing ? `/api/finans/fis/${editing.id}` : "/api/finans/fis";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await res.json();
      if (!d.ok) { setSaveError(typeof d.error === "string" ? d.error : "Kayıt hatası"); return; }
      const fisId = editing ? editing.id : d.data.id;
      if (pendingFile) await attachToFis(fisId, pendingFile, { ...payload, id: fisId });
      toast.success(editing ? "Fiş güncellendi" : "Fiş oluşturuldu");
      setShowForm(false);
      load();
    } finally { setSaving(false); }
  }

  const canCreate = hasPermission(user, "finans_fis:create");
  const canUpdate = hasPermission(user, "finans_fis:update");

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Fişler</h1>
              <p className="text-zinc-500 text-sm mt-0.5">{rows.length} kayıt</p>
            </div>
            {canCreate && (
              <button onClick={openCreate} className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors whitespace-nowrap">
                + Yeni Fiş
              </button>
            )}
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <select value={tipFilter} onChange={e => setTipFilter(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none">
              <option value="">Tümü (Tip)</option>
              {Object.entries(TIP_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-16 animate-pulse" />)}</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-zinc-600">Henüz fiş yok</div>
          ) : (
            <div className="space-y-2">
              {rows.map(row => (
                <div key={row.id} onClick={() => openEdit(row)}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 transition-colors cursor-pointer hover:border-zinc-700">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded-md font-medium bg-zinc-800 text-zinc-300">
                      {TIP_LABELS[row.tip] || row.tip}
                    </span>
                    {row.fis_no && <span className="text-white text-sm font-semibold">{row.fis_no}</span>}
                    <span className="text-zinc-500 text-xs">{toDateInputValue(row.tarih)}</span>
                    <span className="text-zinc-400 text-sm ml-auto">
                      {row.kasa_banka_hesabi_ad || "—"}
                      {row.tip === "virman" && row.karsi_hesap_ad ? ` → ${row.karsi_hesap_ad}` : ""}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <p className="text-zinc-200 text-sm font-medium">{formatTutar(row.tutar)}</p>
                    {row.odeme_turu && <span className="text-xs px-2 py-0.5 rounded-md bg-zinc-800/60 text-zinc-500">{ODEME_TURU_LABELS[row.odeme_turu]}</span>}
                  </div>
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
              <h2 className="text-white font-semibold">{editing ? (canUpdate ? "Fişi Düzenle" : "Fiş Detayı") : "Yeni Fiş"}</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {saveError && <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">{saveError}</div>}
              {!!editing && !canUpdate && (
                <div className="bg-zinc-800/60 border border-zinc-700 text-zinc-400 text-sm px-3 py-2 rounded-lg">
                  Bu fişi düzenleme yetkiniz yok — sadece görüntüleniyor.
                </div>
              )}
              <fieldset disabled={!!editing && !canUpdate} className="contents">

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Tip *</span>
                <select value={form.tip} onChange={e => setForm(f => ({ ...f, tip: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none">
                  {Object.entries(TIP_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Fiş No</span>
                  <input type="text" value={form.fis_no} onChange={e => setForm(f => ({ ...f, fis_no: e.target.value }))}
                    placeholder="örn. F2026000045"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Ödeme Türü</span>
                  <select value={form.odeme_turu} onChange={e => setForm(f => ({ ...f, odeme_turu: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none">
                    <option value="">— Seçilmedi —</option>
                    {Object.entries(ODEME_TURU_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Tarih *</span>
                  <input type="date" value={form.tarih} onChange={e => setForm(f => ({ ...f, tarih: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Tutar *</span>
                  <input type="number" step="0.01" value={form.tutar} onChange={e => setForm(f => ({ ...f, tutar: e.target.value }))}
                    placeholder="0.00"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
              </div>

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Kasa/Banka Hesabı</span>
                <select value={form.kasa_banka_hesabi_id} onChange={e => setForm(f => ({ ...f, kasa_banka_hesabi_id: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none">
                  <option value="">— Seçilmedi —</option>
                  {kasaBankaHesaplari.map(h => <option key={h.id} value={h.id}>{h.ad}</option>)}
                </select>
              </label>

              {form.tip === "virman" && (
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Karşı Hesap</span>
                  <select value={form.karsi_hesap_id} onChange={e => setForm(f => ({ ...f, karsi_hesap_id: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none">
                    <option value="">— Seçilmedi —</option>
                    {kasaBankaHesaplari.map(h => <option key={h.id} value={h.id}>{h.ad}</option>)}
                  </select>
                </label>
              )}

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Açıklama</span>
                <textarea value={form.aciklama} onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))} rows={3}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </label>
              </fieldset>

              <div>
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Dosya Eki (fiş görseli veya PDF)</span>
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
                      onChange={e => { const f = e.target.files?.[0]; if (f) attachToFis(editing.id, f, { ...editing, fis_no: form.fis_no, odeme_turu: form.odeme_turu }); e.target.value = ""; }} />
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
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors">
                {!!editing && !canUpdate ? "Kapat" : "İptal"}
              </button>
              {(!editing || canUpdate) && (
                <button onClick={save} disabled={saving || !form.tarih || !form.tutar.trim()}
                  className="flex-1 bg-white text-zinc-950 font-semibold text-sm py-2.5 rounded-xl hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                  {saving ? "Kaydediliyor..." : "Kaydet"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
