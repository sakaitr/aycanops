"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { toast } from "@/lib/toast";
import { hasPermission } from "@/lib/permissions";
import { todayIstanbul } from "@/lib/time";

const TUR_LABELS: Record<string, string> = { gelir: "Gelir", gider: "Gider" };
const TUR_BADGE_CLASS: Record<string, string> = {
  gelir: "bg-emerald-950 text-emerald-400",
  gider: "bg-red-950 text-red-400",
};
const DURUM_LABELS: Record<string, string> = {
  taslak: "Taslak", onay_bekliyor: "Onay Bekliyor", onaylandi: "Onaylandı", reddedildi: "Reddedildi",
};
const DURUM_BADGE_CLASS: Record<string, string> = {
  taslak: "bg-zinc-800 text-zinc-400",
  onay_bekliyor: "bg-amber-950 text-amber-400",
  onaylandi: "bg-emerald-950 text-emerald-400",
  reddedildi: "bg-red-950 text-red-400",
};
const EMPTY_FORM = {
  tur: "gider",
  belge_tarihi: todayIstanbul(),
  tahakkuk_tarihi: "",
  vade_tarihi: "",
  kategori_id: "",
  net_tutar: "",
  vergi_tutari: "",
  para_birimi_kod: "TRY",
  kur: "1",
  company_id: "",
  department_id: "",
  proje_id: "",
  masraf_merkezi_id: "",
  aciklama: "",
};

// MySQL DATE sütunları mysql2 tarafından JS Date nesnesi olarak döner (dateStrings
// açık değil) ve bu nesne, JSON.stringify (API yanıtı) sırasında toISOString() ile
// UTC'ye çevrilir. Sunucu +03:00 yerel gece yarısını UTC'de "...T21:00:00.000Z" (bir
// önceki gün) olarak yazdığı için, ISO string'in ilk 10 karakterini almak (naive
// slice) bir gün geriye kayan yanlış tarih üretir. new Date(...) ile ayrıştırıp
// tarayıcının yerel (Europe/Istanbul, sunucuyla aynı dilim) getFullYear/Month/Date
// metotlarıyla okumak UTC kaymasını geri alır ve doğru takvim gününü verir.
function toDateInputValue(v: unknown): string {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v as string);
  if (Number.isNaN(d.getTime())) return typeof v === "string" ? v.slice(0, 10) : "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function GelirGiderPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const [kategoriler, setKategoriler] = useState<any[]>([]);
  const [departmanlar, setDepartmanlar] = useState<any[]>([]);
  const [projeler, setProjeler] = useState<any[]>([]);
  const [masrafMerkezleri, setMasrafMerkezleri] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);

  const [turFilter, setTurFilter] = useState("");
  const [durumFilter, setDurumFilter] = useState("");

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data); else router.replace("/login");
    });
    fetch("/api/finans/kategori").then(r => r.json()).then(d => { if (d.ok) setKategoriler(d.data); });
    fetch("/api/departments").then(r => r.json()).then(d => { if (d.ok) setDepartmanlar(d.data); });
    fetch("/api/finans/proje").then(r => r.json()).then(d => { if (d.ok) setProjeler(d.data); });
    fetch("/api/finans/masraf-merkezi").then(r => r.json()).then(d => { if (d.ok) setMasrafMerkezleri(d.data); });
    fetch("/api/companies").then(r => r.json()).then(d => { if (d.ok) setCompanies(d.data); });
  }, []);

  useEffect(() => { load(); }, [turFilter, durumFilter]);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (turFilter) params.set("tur", turFilter);
      if (durumFilter) params.set("durum", durumFilter);
      const qs = params.toString();
      const r = await fetch(`/api/finans/gelir-gider${qs ? `?${qs}` : ""}`);
      const d = await r.json();
      if (d.ok) setRows(d.data);
    } finally { setLoading(false); }
  }

  function openCreate() { setEditing(null); setForm({ ...EMPTY_FORM }); setSaveError(null); setShowForm(true); }

  function openEdit(row: any) {
    setEditing(row);
    setForm({
      tur: row.tur,
      belge_tarihi: toDateInputValue(row.belge_tarihi),
      tahakkuk_tarihi: toDateInputValue(row.tahakkuk_tarihi),
      vade_tarihi: toDateInputValue(row.vade_tarihi),
      kategori_id: row.kategori_id || "",
      net_tutar: row.net_tutar != null ? String(row.net_tutar) : "",
      vergi_tutari: row.vergi_tutari != null ? String(row.vergi_tutari) : "",
      para_birimi_kod: row.para_birimi_kod || "TRY",
      kur: row.kur != null ? String(row.kur) : "1",
      company_id: row.company_id || "",
      department_id: row.department_id || "",
      proje_id: row.proje_id || "",
      masraf_merkezi_id: row.masraf_merkezi_id || "",
      aciklama: row.aciklama || "",
    });
    setSaveError(null);
    setShowForm(true);
  }

  // tur değişince, seçili kategori yeni tür ile uyuşmuyorsa temizle
  function onTurChange(newTur: string) {
    setForm(f => {
      const stillValid = kategoriler.find(k => k.id === f.kategori_id)?.tip === newTur;
      return { ...f, tur: newTur, kategori_id: stillValid ? f.kategori_id : "" };
    });
  }

  const brutTutar = (Number(form.net_tutar) || 0) + (Number(form.vergi_tutari) || 0);
  const filteredKategoriler = kategoriler.filter(k => k.tip === form.tur);

  // Kullanıcı allowed_companies ile kısıtlıysa (null = kısıtlama yok), firma dropdown'unu
  // sadece izinli firmalarla sınırla. Sunucu kayıt sırasında zaten kısıtlamayı uyguluyor;
  // bu sadece dropdown'da izinsiz seçeneklerin görünmesini engelleyen bir UX düzeltmesi.
  let allowedCompanyIds: string[] | null = null;
  try { allowedCompanyIds = user?.allowed_companies ? JSON.parse(user.allowed_companies) : null; } catch {}
  const visibleCompanies = allowedCompanyIds
    ? companies.filter(c => allowedCompanyIds!.includes(c.id))
    : companies;

  async function save() {
    const net = Number(form.net_tutar);
    if (!form.belge_tarihi) { setSaveError("Belge tarihi zorunludur"); return; }
    if (!form.net_tutar.trim() || !Number.isFinite(net) || net < 0) { setSaveError("Net tutar geçerli bir sayı olmalıdır"); return; }
    setSaving(true); setSaveError(null);
    try {
      const payload = {
        tur: form.tur,
        belge_tarihi: form.belge_tarihi,
        tahakkuk_tarihi: form.tahakkuk_tarihi || null,
        vade_tarihi: form.vade_tarihi || null,
        kategori_id: form.kategori_id || null,
        net_tutar: net,
        vergi_tutari: Number(form.vergi_tutari) || 0,
        brut_tutar: brutTutar,
        para_birimi_kod: form.para_birimi_kod || "TRY",
        kur: Number(form.kur) || 1,
        company_id: form.company_id || null,
        department_id: form.department_id || null,
        proje_id: form.proje_id || null,
        masraf_merkezi_id: form.masraf_merkezi_id || null,
        aciklama: form.aciklama || null,
      };
      const url = editing ? `/api/finans/gelir-gider/${editing.id}` : "/api/finans/gelir-gider";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await res.json();
      if (!d.ok) { setSaveError(typeof d.error === "string" ? d.error : "Kayıt hatası"); return; }
      toast.success(editing ? "Kayıt güncellendi" : "Kayıt eklendi");
      setShowForm(false);
      load();
    } finally { setSaving(false); }
  }

  async function actOn(row: any, action: "onayla" | "reddet") {
    setActingId(row.id);
    try {
      const res = await fetch(`/api/finans/gelir-gider/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const d = await res.json();
      if (!d.ok) { toast.error(typeof d.error === "string" ? d.error : "İşlem başarısız"); return; }
      toast.success(action === "onayla" ? "Kayıt onaylandı" : "Kayıt reddedildi");
      load();
    } finally { setActingId(null); }
  }

  const canCreate = hasPermission(user, "finans_gelir_gider:create");
  const canUpdate = hasPermission(user, "finans_gelir_gider:update");
  const canApprove = hasPermission(user, "finans_gelir_gider:approve");

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Gelir-Gider Kayıtları</h1>
              <p className="text-zinc-500 text-sm mt-0.5">{rows.length} kayıt</p>
            </div>
            {canCreate && (
              <button onClick={openCreate} className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors whitespace-nowrap">
                + Yeni Kayıt
              </button>
            )}
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <select value={turFilter} onChange={e => setTurFilter(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none">
              <option value="">Tümü (Tür)</option>
              <option value="gelir">Gelir</option>
              <option value="gider">Gider</option>
            </select>
            <select value={durumFilter} onChange={e => setDurumFilter(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none">
              <option value="">Tümü (Durum)</option>
              <option value="taslak">Taslak</option>
              <option value="onaylandi">Onaylandı</option>
              <option value="reddedildi">Reddedildi</option>
            </select>
          </div>

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-20 animate-pulse" />)}</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-zinc-600">Henüz gelir-gider kaydı yok</div>
          ) : (
            <div className="space-y-2">
              {rows.map(row => {
                const clickable = row.durum === "taslak" && canUpdate;
                const showActions = canApprove && row.created_by !== user?.id && (row.durum === "taslak" || row.durum === "onay_bekliyor");
                return (
                  <div key={row.id}
                    onClick={clickable ? () => openEdit(row) : undefined}
                    className={`bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 transition-colors ${clickable ? "cursor-pointer hover:border-zinc-700" : ""}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${TUR_BADGE_CLASS[row.tur] || "bg-zinc-800 text-zinc-400"}`}>
                        {TUR_LABELS[row.tur] || row.tur}
                      </span>
                      <span className="text-white font-semibold text-sm">{row.kategori_ad || "Kategorisiz"}</span>
                      <span className="text-zinc-500 text-xs">{toDateInputValue(row.belge_tarihi)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-md font-medium ml-auto ${DURUM_BADGE_CLASS[row.durum] || "bg-zinc-800 text-zinc-400"}`}>
                        {DURUM_LABELS[row.durum] || row.durum}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1.5">
                      <p className="text-zinc-500 text-xs">
                        {row.company_name ? `${row.company_name} · ` : ""}
                        {Number(row.brut_tutar).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {row.para_birimi_kod}
                      </p>
                      {showActions && (
                        <div className="flex gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                          <button onClick={() => actOn(row, "onayla")} disabled={actingId === row.id}
                            className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-950 text-emerald-300 hover:bg-emerald-900 disabled:opacity-50 transition-colors">
                            Onayla
                          </button>
                          <button onClick={() => actOn(row, "reddet")} disabled={actingId === row.id}
                            className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-red-950 text-red-300 hover:bg-red-900 disabled:opacity-50 transition-colors">
                            Reddet
                          </button>
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
              <h2 className="text-white font-semibold">{editing ? "Kaydı Düzenle" : "Yeni Gelir/Gider Kaydı"}</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {saveError && <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">{saveError}</div>}

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Tür *</span>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => onTurChange("gelir")}
                    className={`text-sm font-semibold py-2 rounded-lg border transition-colors ${form.tur === "gelir" ? "bg-emerald-950 border-emerald-700 text-emerald-300" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white"}`}>
                    Gelir
                  </button>
                  <button type="button" onClick={() => onTurChange("gider")}
                    className={`text-sm font-semibold py-2 rounded-lg border transition-colors ${form.tur === "gider" ? "bg-red-950 border-red-700 text-red-300" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white"}`}>
                    Gider
                  </button>
                </div>
              </label>

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Belge Tarihi *</span>
                <input type="date" value={form.belge_tarihi} onChange={e => setForm(f => ({ ...f, belge_tarihi: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Tahakkuk Tarihi</span>
                  <input type="date" value={form.tahakkuk_tarihi} onChange={e => setForm(f => ({ ...f, tahakkuk_tarihi: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Vade Tarihi</span>
                  <input type="date" value={form.vade_tarihi} onChange={e => setForm(f => ({ ...f, vade_tarihi: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
                </label>
              </div>

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Kategori</span>
                <select value={form.kategori_id} onChange={e => setForm(f => ({ ...f, kategori_id: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none">
                  <option value="">— Seçilmedi —</option>
                  {filteredKategoriler.map(k => <option key={k.id} value={k.id}>{k.ad}</option>)}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Net Tutar *</span>
                  <input type="number" step="0.01" min="0" value={form.net_tutar} onChange={e => setForm(f => ({ ...f, net_tutar: e.target.value }))}
                    placeholder="0.00"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Vergi Tutarı</span>
                  <input type="number" step="0.01" min="0" value={form.vergi_tutari} onChange={e => setForm(f => ({ ...f, vergi_tutari: e.target.value }))}
                    placeholder="0.00"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
              </div>

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Brüt Tutar (otomatik hesaplanır)</span>
                <input type="text" readOnly disabled value={brutTutar.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  className="w-full bg-zinc-900 border border-zinc-800 text-zinc-400 text-sm px-3 py-2 rounded-lg cursor-not-allowed" />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Para Birimi</span>
                  <select value={form.para_birimi_kod} onChange={e => {
                      const yeniKod = e.target.value;
                      setForm(f => ({ ...f, para_birimi_kod: yeniKod, kur: yeniKod === "TRY" ? "1" : f.kur }));
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
                    onChange={e => setForm(f => ({ ...f, kur: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed" />
                </label>
              </div>

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Firma</span>
                <select value={form.company_id} onChange={e => setForm(f => ({ ...f, company_id: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none">
                  <option value="">— Seçilmedi —</option>
                  {visibleCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Departman</span>
                <select value={form.department_id} onChange={e => setForm(f => ({ ...f, department_id: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none">
                  <option value="">— Seçilmedi —</option>
                  {departmanlar.map(dep => <option key={dep.id} value={dep.id}>{dep.name}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Proje</span>
                <select value={form.proje_id} onChange={e => setForm(f => ({ ...f, proje_id: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none">
                  <option value="">— Seçilmedi —</option>
                  {projeler.map(p => <option key={p.id} value={p.id}>{p.ad}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Masraf Merkezi</span>
                <select value={form.masraf_merkezi_id} onChange={e => setForm(f => ({ ...f, masraf_merkezi_id: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none">
                  <option value="">— Seçilmedi —</option>
                  {masrafMerkezleri.map(m => <option key={m.id} value={m.id}>{m.ad}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Açıklama</span>
                <textarea value={form.aciklama} onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))} rows={3}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </label>
            </div>
            <div className="px-5 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving || !form.belge_tarihi || !form.net_tutar.trim()}
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
