"use client";
import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { toast } from "@/lib/toast";
import { hasPermission } from "@/lib/permissions";

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("tr-TR").format(new Date(d));
}

function formatCurrency(v: number | string | null | undefined) {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(n);
}

const TEVKIFAT_LABELS: Record<string, string> = {
  tum_araclar: "Tüm Araçlar",
  sadece_ozmal: "Sadece Öz Mal",
  uygulanmasin: "Uygulanmasın",
};

const ISLEM_TURU_OPTS = [
  { value: "hakedis", label: "Hakediş" },
  { value: "odeme", label: "Ödeme" },
  { value: "avans", label: "Avans" },
  { value: "kesinti", label: "Kesinti" },
  { value: "diger", label: "Diğer" },
];

const ISLEM_TURU_LABELS: Record<string, string> = {
  hakedis: "Hakediş",
  odeme: "Ödeme",
  avans: "Avans",
  kesinti: "Kesinti",
  diger: "Diğer",
};

type Tab = "genel" | "araclar" | "cari";

export default function IsletenDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isleten, setIsleten] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("genel");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  // Araçlar tab
  const [araclar, setAraclar] = useState<any[]>([]);
  const [araclarLoading, setAraclarLoading] = useState(false);
  const [showAracForm, setShowAracForm] = useState(false);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [aracForm, setAracForm] = useState({ vehicle_id: "", baslangic_tarihi: "", aciklama: "" });
  const [aracSaving, setAracSaving] = useState(false);

  // Cari tab
  const [cari, setCari] = useState<any[]>([]);
  const [cariSummary, setCariSummary] = useState<any>(null);
  const [cariLoading, setCariLoading] = useState(false);
  const [showCariForm, setShowCariForm] = useState(false);
  const [cariForm, setCariForm] = useState({ islem_turu: "hakedis", tutar: "", tarih: "", aciklama: "" });
  const [cariSaving, setCariSaving] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data);
      else router.replace("/login");
    });
    loadIsleten();
  }, [id]);

  useEffect(() => {
    if (tab === "araclar") loadAraclar();
    if (tab === "cari") loadCari();
  }, [tab]);

  async function loadIsleten() {
    setLoading(true);
    const r = await fetch(`/api/isletenler/${id}`);
    const d = await r.json();
    if (d.ok) { setIsleten(d.data); setEditForm(d.data); }
    else router.push("/isletenler");
    setLoading(false);
  }

  async function loadAraclar() {
    setAraclarLoading(true);
    const r = await fetch(`/api/isletenler/${id}/araclar`);
    const d = await r.json();
    if (d.ok) setAraclar(d.data);
    setAraclarLoading(false);

    // Load all vehicles for assignment form
    const vr = await fetch("/api/vehicles?limit=500&status=active");
    const vd = await vr.json();
    if (vd.ok) setVehicles(vd.data);
  }

  async function loadCari() {
    setCariLoading(true);
    const r = await fetch(`/api/isletenler/${id}/cari?limit=100`);
    const d = await r.json();
    if (d.ok) { setCari(d.data); setCariSummary(d.summary); }
    setCariLoading(false);
  }

  async function saveEdit() {
    setSaving(true);
    try {
      const res = await fetch(`/api/isletenler/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const d = await res.json();
      if (!d.ok) { toast.error(d.error || "Kayıt hatası"); return; }
      toast.success("Güncellendi");
      setEditing(false);
      loadIsleten();
    } finally { setSaving(false); }
  }

  async function deactivate() {
    if (!confirm(`${isleten.unvan} pasife alınsın mı?`)) return;
    const res = await fetch(`/api/isletenler/${id}`, { method: "DELETE" });
    const d = await res.json();
    if (d.ok) { toast.success("Pasife alındı"); router.push("/isletenler"); }
    else toast.error(d.error || "Hata");
  }

  async function saveArac() {
    if (!aracForm.vehicle_id || !aracForm.baslangic_tarihi) return;
    setAracSaving(true);
    try {
      const res = await fetch(`/api/isletenler/${id}/araclar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aracForm),
      });
      const d = await res.json();
      if (!d.ok) { toast.error(d.error || "Hata"); return; }
      toast.success("Araç atandı");
      setShowAracForm(false);
      setAracForm({ vehicle_id: "", baslangic_tarihi: "", aciklama: "" });
      loadAraclar();
    } finally { setAracSaving(false); }
  }

  async function saveCari() {
    if (!cariForm.tutar || !cariForm.islem_turu) return;
    setCariSaving(true);
    try {
      const res = await fetch(`/api/isletenler/${id}/cari`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cariForm),
      });
      const d = await res.json();
      if (!d.ok) { toast.error(d.error || "Hata"); return; }
      toast.success("Hareket eklendi");
      setShowCariForm(false);
      setCariForm({ islem_turu: "hakedis", tutar: "", tarih: "", aciklama: "" });
      loadCari();
    } finally { setCariSaving(false); }
  }

  const canEdit = hasPermission(user, "isleten:update");
  const canDeactivate = user?.role === "admin";

  if (loading) {
    return (
      <>
        <Nav user={user} />
        <div className="min-h-screen bg-zinc-950 pt-16 flex items-center justify-center">
          <div className="text-zinc-500">Yükleniyor...</div>
        </div>
      </>
    );
  }

  if (!isleten) return null;

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-5xl mx-auto px-4 py-6">

          {/* Back */}
          <button onClick={() => router.push("/isletenler")}
            className="text-zinc-500 hover:text-white text-sm mb-4 flex items-center gap-1 transition-colors">
            ← İşletenler
          </button>

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xl shrink-0">
                {isleten.unvan.trim().charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">{isleten.unvan}</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-zinc-500 font-mono text-sm">{isleten.cari_kod}</span>
                  {isleten.ana_isleten ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border bg-amber-950 border-amber-800 text-amber-300">Ana İşleten</span>
                  ) : null}
                  {!isleten.is_active ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border bg-zinc-800 border-zinc-700 text-zinc-500">Pasif</span>
                  ) : null}
                </div>
              </div>
            </div>

            {canEdit && (
              <div className="flex gap-2">
                {!editing ? (
                  <button onClick={() => setEditing(true)}
                    className="bg-zinc-800 text-zinc-200 text-sm px-4 py-2 rounded-xl hover:bg-zinc-700 transition-colors">
                    Düzenle
                  </button>
                ) : (
                  <>
                    <button onClick={() => { setEditing(false); setEditForm(isleten); }}
                      className="bg-zinc-800 text-zinc-400 text-sm px-4 py-2 rounded-xl hover:bg-zinc-700 transition-colors">
                      İptal
                    </button>
                    <button onClick={saveEdit} disabled={saving}
                      className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                      {saving ? "Kaydediliyor..." : "Kaydet"}
                    </button>
                  </>
                )}
                {canDeactivate && isleten.is_active ? (
                  <button onClick={deactivate}
                    className="bg-red-950 text-red-300 border border-red-800 text-sm px-3 py-2 rounded-xl hover:bg-red-900 transition-colors">
                    Pasife Al
                  </button>
                ) : null}
              </div>
            )}
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Cari Bakiye", value: formatCurrency(isleten.cari_bakiye), highlight: Number(isleten.cari_bakiye) >= 0 ? "text-emerald-400" : "text-red-400" },
              { label: "Bağlı Araç", value: isleten.arac_sayisi ?? 0, highlight: "text-white" },
              { label: "Tevkifat", value: TEVKIFAT_LABELS[isleten.tevkifat_durumu] || "—", highlight: "text-zinc-300" },
              { label: "Durum", value: isleten.is_active ? "Aktif" : "Pasif", highlight: isleten.is_active ? "text-emerald-400" : "text-zinc-500" },
            ].map(card => (
              <div key={card.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                <p className="text-zinc-500 text-xs mb-1">{card.label}</p>
                <p className={`text-sm font-semibold ${card.highlight}`}>{String(card.value)}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 border-b border-zinc-800">
            {(["genel", "araclar", "cari"] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                  tab === t
                    ? "border-white text-white"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {t === "genel" ? "Genel Bilgiler" : t === "araclar" ? "Araçlar" : "Cari Hareketler"}
              </button>
            ))}
          </div>

          {/* Tab: Genel */}
          {tab === "genel" && (
            <div className="space-y-6">
              {editing ? (
                <EditForm form={editForm} setForm={setEditForm} />
              ) : (
                <ReadonlyDetail isleten={isleten} />
              )}
            </div>
          )}

          {/* Tab: Araçlar */}
          {tab === "araclar" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-zinc-400 text-sm">{araclar.filter(a => !a.bitis_tarihi).length} aktif araç</p>
                {canEdit && (
                  <button onClick={() => setShowAracForm(true)}
                    className="bg-white text-zinc-950 font-semibold text-sm px-3 py-1.5 rounded-xl hover:bg-zinc-200 transition-colors">
                    + Araç Ata
                  </button>
                )}
              </div>

              {araclarLoading ? (
                <div className="text-zinc-500 text-sm">Yükleniyor...</div>
              ) : araclar.length === 0 ? (
                <div className="text-center py-12 text-zinc-600">Henüz araç atanmamış</div>
              ) : (
                <div className="space-y-2">
                  {araclar.map(a => (
                    <div key={a.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-mono font-semibold">{a.plate}</span>
                          <span className="text-zinc-500 text-sm">{a.brand} {a.model} {a.year}</span>
                          {!a.bitis_tarihi && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded border bg-emerald-950 border-emerald-800 text-emerald-300">Aktif</span>
                          )}
                        </div>
                        <p className="text-zinc-600 text-xs mt-0.5">
                          {formatDate(a.baslangic_tarihi)} — {a.bitis_tarihi ? formatDate(a.bitis_tarihi) : "devam ediyor"}
                        </p>
                      </div>
                      <span className="text-zinc-600 text-xs capitalize">{a.islem_turu}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Araç atama formu */}
              {showAracForm && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
                  <div className="absolute inset-0 bg-black/60" onClick={() => setShowAracForm(false)} />
                  <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md mx-4 space-y-4">
                    <h3 className="text-white font-semibold">Araç Ata</h3>
                    <label className="block">
                      <span className="text-zinc-400 text-xs font-medium mb-1 block">Araç *</span>
                      <select value={aracForm.vehicle_id} onChange={e => setAracForm(f => ({ ...f, vehicle_id: e.target.value }))}
                        className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none">
                        <option value="">Araç seç...</option>
                        {vehicles.map(v => (
                          <option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-zinc-400 text-xs font-medium mb-1 block">Başlangıç Tarihi *</span>
                      <input type="date" value={aracForm.baslangic_tarihi} onChange={e => setAracForm(f => ({ ...f, baslangic_tarihi: e.target.value }))}
                        className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none [color-scheme:dark]" />
                    </label>
                    <label className="block">
                      <span className="text-zinc-400 text-xs font-medium mb-1 block">Açıklama</span>
                      <input value={aracForm.aciklama} onChange={e => setAracForm(f => ({ ...f, aciklama: e.target.value }))}
                        className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none" />
                    </label>
                    <div className="flex gap-3 pt-2">
                      <button onClick={() => setShowAracForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm py-2.5 rounded-xl">İptal</button>
                      <button onClick={saveArac} disabled={aracSaving || !aracForm.vehicle_id || !aracForm.baslangic_tarihi}
                        className="flex-1 bg-white text-zinc-950 font-semibold text-sm py-2.5 rounded-xl disabled:opacity-50">
                        {aracSaving ? "Atanıyor..." : "Ata"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab: Cari */}
          {tab === "cari" && (
            <div>
              {/* Summary */}
              {cariSummary && (
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                    <p className="text-zinc-500 text-xs mb-1">Toplam Giriş</p>
                    <p className="text-emerald-400 font-semibold text-sm">{formatCurrency(cariSummary.toplam_giris)}</p>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                    <p className="text-zinc-500 text-xs mb-1">Toplam Çıkış</p>
                    <p className="text-red-400 font-semibold text-sm">{formatCurrency(cariSummary.toplam_cikis)}</p>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                    <p className="text-zinc-500 text-xs mb-1">Bakiye</p>
                    <p className={`font-semibold text-sm ${Number(cariSummary.bakiye) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {formatCurrency(cariSummary.bakiye)}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between mb-4">
                <p className="text-zinc-400 text-sm">{cari.length} hareket</p>
                {canEdit && (
                  <button onClick={() => setShowCariForm(true)}
                    className="bg-white text-zinc-950 font-semibold text-sm px-3 py-1.5 rounded-xl hover:bg-zinc-200 transition-colors">
                    + Hareket Ekle
                  </button>
                )}
              </div>

              {cariLoading ? (
                <div className="text-zinc-500 text-sm">Yükleniyor...</div>
              ) : cari.length === 0 ? (
                <div className="text-center py-12 text-zinc-600">Henüz cari hareket yok</div>
              ) : (
                <div className="space-y-2">
                  {cari.map(h => {
                    const isGiris = Number(h.para_girisi) > 0;
                    return (
                      <div key={h.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-4">
                        <div className={`w-1 h-10 rounded-full shrink-0 ${isGiris ? "bg-emerald-500" : "bg-red-500"}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-300 text-sm font-medium">{ISLEM_TURU_LABELS[h.islem_turu] || h.islem_turu}</span>
                            {h.aciklama && <span className="text-zinc-600 text-xs truncate">{h.aciklama}</span>}
                          </div>
                          <p className="text-zinc-600 text-xs mt-0.5">{formatDate(h.tarih)} · {h.created_by_name || "Sistem"}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`font-semibold text-sm ${isGiris ? "text-emerald-400" : "text-red-400"}`}>
                            {isGiris ? "+" : "-"}{formatCurrency(isGiris ? h.para_girisi : h.para_cikisi)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Cari hareket formu */}
              {showCariForm && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
                  <div className="absolute inset-0 bg-black/60" onClick={() => setShowCariForm(false)} />
                  <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md mx-4 space-y-4">
                    <h3 className="text-white font-semibold">Cari Hareket Ekle</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="text-zinc-400 text-xs font-medium mb-1 block">İşlem Türü *</span>
                        <select value={cariForm.islem_turu} onChange={e => setCariForm(f => ({ ...f, islem_turu: e.target.value }))}
                          className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none">
                          {ISLEM_TURU_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-zinc-400 text-xs font-medium mb-1 block">Tutar *</span>
                        <input type="number" min="0" step="0.01" value={cariForm.tutar} onChange={e => setCariForm(f => ({ ...f, tutar: e.target.value }))}
                          className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none"
                          placeholder="0.00" />
                      </label>
                    </div>
                    <label className="block">
                      <span className="text-zinc-400 text-xs font-medium mb-1 block">Tarih</span>
                      <input type="date" value={cariForm.tarih} onChange={e => setCariForm(f => ({ ...f, tarih: e.target.value }))}
                        className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none [color-scheme:dark]" />
                    </label>
                    <label className="block">
                      <span className="text-zinc-400 text-xs font-medium mb-1 block">Açıklama</span>
                      <input value={cariForm.aciklama} onChange={e => setCariForm(f => ({ ...f, aciklama: e.target.value }))}
                        className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none" />
                    </label>
                    <div className="flex gap-3 pt-2">
                      <button onClick={() => setShowCariForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm py-2.5 rounded-xl">İptal</button>
                      <button onClick={saveCari} disabled={cariSaving || !cariForm.tutar || !cariForm.islem_turu}
                        className="flex-1 bg-white text-zinc-950 font-semibold text-sm py-2.5 rounded-xl disabled:opacity-50">
                        {cariSaving ? "Kaydediliyor..." : "Kaydet"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function ReadonlyDetail({ isleten }: { isleten: any }) {
  const fields = [
    { label: "Cep Telefon", value: isleten.cep_tel },
    { label: "İş Telefon", value: isleten.is_tel },
    { label: "Ev Telefon", value: isleten.ev_tel },
    { label: "E-posta", value: isleten.email },
    { label: "Vergi No", value: isleten.vergi_no },
    { label: "TC Kimlik No", value: isleten.tc_no },
    { label: "Vergi Dairesi", value: isleten.vergi_dairesi },
    { label: "Kayıtlı Oda", value: isleten.kayitli_oda },
    { label: "Sözleşme Başlangıç", value: isleten.sozlesme_baslangic ? new Intl.DateTimeFormat("tr-TR").format(new Date(isleten.sozlesme_baslangic)) : null },
    { label: "Sözleşme Bitiş", value: isleten.sozlesme_bitis ? new Intl.DateTimeFormat("tr-TR").format(new Date(isleten.sozlesme_bitis)) : null },
    { label: "Banka", value: isleten.banka_adi },
    { label: "Şube", value: isleten.banka_sube },
    { label: "IBAN", value: isleten.banka_iban, mono: true },
    { label: "Yakıt Kredi Oranı", value: isleten.yakit_kredi_orani ? `%${isleten.yakit_kredi_orani}` : null },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
      {fields.map(f => (
        <div key={f.label} className="flex flex-col">
          <span className="text-zinc-600 text-xs">{f.label}</span>
          <span className={`text-zinc-200 text-sm mt-0.5 ${(f as any).mono ? "font-mono" : ""}`}>
            {f.value || <span className="text-zinc-700">—</span>}
          </span>
        </div>
      ))}
      {isleten.aciklama && (
        <div className="col-span-full flex flex-col">
          <span className="text-zinc-600 text-xs">Açıklama</span>
          <span className="text-zinc-300 text-sm mt-0.5">{isleten.aciklama}</span>
        </div>
      )}
    </div>
  );
}

function EditForm({ form, setForm }: { form: any; setForm: (f: any) => void }) {
  const field = (key: string, label: string, type = "text", placeholder = "") => (
    <label className="block">
      <span className="text-zinc-400 text-xs font-medium mb-1 block">{label}</span>
      <input
        type={type}
        value={form[key] || ""}
        onChange={e => setForm((f: any) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]"
      />
    </label>
  );

  return (
    <div className="space-y-4">
      {field("unvan", "Ünvan *")}
      <div className="grid grid-cols-2 gap-3">
        {field("cep_tel", "Cep Tel *")}
        {field("is_tel", "İş Tel")}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {field("email", "E-posta", "email")}
        {field("vergi_no", "Vergi No")}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {field("tc_no", "TC Kimlik No")}
        {field("vergi_dairesi", "Vergi Dairesi")}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {field("kayitli_oda", "Kayıtlı Oda")}
        {field("cari_kod", "Cari Kod")}
      </div>
      <label className="block">
        <span className="text-zinc-400 text-xs font-medium mb-1 block">Tevkifat Durumu</span>
        <select value={form.tevkifat_durumu || "tum_araclar"} onChange={e => setForm((f: any) => ({ ...f, tevkifat_durumu: e.target.value }))}
          className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none">
          <option value="tum_araclar">Tüm Araçlar</option>
          <option value="sadece_ozmal">Sadece Öz Mal</option>
          <option value="uygulanmasin">Uygulanmasın</option>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        {field("sozlesme_baslangic", "Sözleşme Başlangıç", "date")}
        {field("sozlesme_bitis", "Sözleşme Bitiş", "date")}
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={!!form.ana_isleten} onChange={e => setForm((f: any) => ({ ...f, ana_isleten: e.target.checked }))}
            className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 accent-indigo-500" />
          <span className="text-zinc-400 text-sm">Ana İşleten</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={!!form.surucu_mu} onChange={e => setForm((f: any) => ({ ...f, surucu_mu: e.target.checked }))}
            className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 accent-indigo-500" />
          <span className="text-zinc-400 text-sm">Sürücü de</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={!!form.ruhsat_sahibi_mi} onChange={e => setForm((f: any) => ({ ...f, ruhsat_sahibi_mi: e.target.checked }))}
            className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 accent-indigo-500" />
          <span className="text-zinc-400 text-sm">Ruhsat Sahibi</span>
        </label>
      </div>

      <div className="border-t border-zinc-800 pt-3">
        <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-3">Banka</p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {field("banka_adi", "Banka Adı")}
            {field("banka_sube", "Şube")}
          </div>
          {field("banka_iban", "IBAN")}
        </div>
      </div>
      <label className="block">
        <span className="text-zinc-400 text-xs font-medium mb-1 block">Açıklama</span>
        <textarea value={form.aciklama || ""} onChange={e => setForm((f: any) => ({ ...f, aciklama: e.target.value }))} rows={3}
          className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none resize-none" />
      </label>
    </div>
  );
}
