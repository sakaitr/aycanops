"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { toast } from "@/lib/toast";
import { hasPermission } from "@/lib/permissions";
import { todayIstanbul } from "@/lib/time";

const DURUM_LABELS: Record<string, string> = {
  bekliyor: "Bekliyor", onaylandi: "Onaylandı", reddedildi: "Reddedildi", tamamlandi: "Tamamlandı",
};
const DURUM_BADGE_CLASS: Record<string, string> = {
  bekliyor: "bg-amber-950 text-amber-400",
  onaylandi: "bg-emerald-950 text-emerald-400",
  reddedildi: "bg-red-950 text-red-400",
  tamamlandi: "bg-zinc-800 text-zinc-400",
};
const EMPTY_FORM = {
  tarih: todayIstanbul(),
  baslik: "",
  aciklama: "",
  tahmini_tutar: "",
  para_birimi_kod: "TRY",
  kategori_id: "",
  department_id: "",
  proje_id: "",
  masraf_merkezi_id: "",
};

function toDateInputValue(v: unknown): string {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v as string);
  if (Number.isNaN(d.getTime())) return typeof v === "string" ? v.slice(0, 10) : "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function MasrafTalebiPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const [kategoriler, setKategoriler] = useState<any[]>([]);
  const [departmanlar, setDepartmanlar] = useState<any[]>([]);
  const [projeler, setProjeler] = useState<any[]>([]);
  const [masrafMerkezleri, setMasrafMerkezleri] = useState<any[]>([]);

  const [durumFilter, setDurumFilter] = useState("");

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data); else router.replace("/login");
    });
    fetch("/api/finans/kategori").then(r => r.json()).then(d => { if (d.ok) setKategoriler(d.data); });
    fetch("/api/departments").then(r => r.json()).then(d => { if (d.ok) setDepartmanlar(d.data); });
    fetch("/api/finans/proje").then(r => r.json()).then(d => { if (d.ok) setProjeler(d.data); });
    fetch("/api/finans/masraf-merkezi").then(r => r.json()).then(d => { if (d.ok) setMasrafMerkezleri(d.data); });
  }, []);

  useEffect(() => { load(); }, [durumFilter]);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (durumFilter) params.set("durum", durumFilter);
      const qs = params.toString();
      const r = await fetch(`/api/finans/masraf-talebi${qs ? `?${qs}` : ""}`);
      const d = await r.json();
      if (d.ok) setRows(d.data);
    } finally { setLoading(false); }
  }

  function openCreate() { setForm({ ...EMPTY_FORM }); setSaveError(null); setShowForm(true); }

  async function save() {
    const tutar = Number(form.tahmini_tutar);
    if (!form.tarih) { setSaveError("Tarih zorunludur"); return; }
    if (!form.baslik.trim()) { setSaveError("Başlık zorunludur"); return; }
    if (!form.tahmini_tutar.trim() || !Number.isFinite(tutar) || tutar < 0) { setSaveError("Tahmini tutar geçerli bir sayı olmalıdır"); return; }
    setSaving(true); setSaveError(null);
    try {
      const payload = {
        tarih: form.tarih,
        baslik: form.baslik.trim(),
        aciklama: form.aciklama || null,
        tahmini_tutar: tutar,
        para_birimi_kod: form.para_birimi_kod || "TRY",
        kategori_id: form.kategori_id || null,
        department_id: form.department_id || null,
        proje_id: form.proje_id || null,
        masraf_merkezi_id: form.masraf_merkezi_id || null,
      };
      const res = await fetch("/api/finans/masraf-talebi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!d.ok) { setSaveError(typeof d.error === "string" ? d.error : "Kayıt hatası"); return; }
      toast.success("Talep oluşturuldu");
      setShowForm(false);
      load();
    } finally { setSaving(false); }
  }

  async function onayla(row: any) {
    setActingId(row.id);
    try {
      const res = await fetch(`/api/finans/masraf-talebi/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "onayla" }),
      });
      const d = await res.json();
      if (!d.ok) { toast.error(typeof d.error === "string" ? d.error : "İşlem başarısız"); return; }
      toast.success("Talep onaylandı");
      load();
    } finally { setActingId(null); }
  }

  async function reddet(row: any) {
    const red_nedeni = window.prompt("Red nedeni:");
    if (red_nedeni === null || !red_nedeni.trim()) return;
    setActingId(row.id);
    try {
      const res = await fetch(`/api/finans/masraf-talebi/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reddet", red_nedeni: red_nedeni.trim() }),
      });
      const d = await res.json();
      if (!d.ok) { toast.error(typeof d.error === "string" ? d.error : "İşlem başarısız"); return; }
      toast.success("Talep reddedildi");
      load();
    } finally { setActingId(null); }
  }

  const canCreate = hasPermission(user, "finans_masraf_talebi:create");
  const canApprove = hasPermission(user, "finans_masraf_talebi:approve");
  const canReject = hasPermission(user, "finans_masraf_talebi:reject");

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Masraf Talepleri</h1>
              <p className="text-zinc-500 text-sm mt-0.5">{rows.length} talep</p>
            </div>
            {canCreate && (
              <button onClick={openCreate} className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors whitespace-nowrap">
                + Talep Oluştur
              </button>
            )}
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <select value={durumFilter} onChange={e => setDurumFilter(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none">
              <option value="">Tümü (Durum)</option>
              <option value="bekliyor">Bekliyor</option>
              <option value="onaylandi">Onaylandı</option>
              <option value="reddedildi">Reddedildi</option>
              <option value="tamamlandi">Tamamlandı</option>
            </select>
          </div>

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-20 animate-pulse" />)}</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-zinc-600">Henüz masraf talebi yok</div>
          ) : (
            <div className="space-y-2">
              {rows.map(row => {
                const isOwnPending = row.talep_eden_user_id !== user?.id && row.durum === "bekliyor";
                const showActions = (canApprove || canReject) && isOwnPending;
                return (
                  <div key={row.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 transition-colors">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-semibold text-sm">{row.baslik}</span>
                      <span className="text-zinc-500 text-xs">{row.talep_eden_ad}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-md font-medium ml-auto ${DURUM_BADGE_CLASS[row.durum] || "bg-zinc-800 text-zinc-400"}`}>
                        {DURUM_LABELS[row.durum] || row.durum}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1.5">
                      <p className="text-zinc-500 text-xs">
                        {Number(row.tahmini_tutar).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {row.para_birimi_kod}
                        {" · "}{toDateInputValue(row.tarih)}
                      </p>
                      {showActions && (
                        <div className="flex gap-2 shrink-0">
                          {canApprove && (
                            <button onClick={() => onayla(row)} disabled={actingId === row.id}
                              className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-950 text-emerald-300 hover:bg-emerald-900 disabled:opacity-50 transition-colors">
                              Onayla
                            </button>
                          )}
                          {canReject && (
                            <button onClick={() => reddet(row)} disabled={actingId === row.id}
                              className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-red-950 text-red-300 hover:bg-red-900 disabled:opacity-50 transition-colors">
                              Reddet
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
              <h2 className="text-white font-semibold">Yeni Masraf Talebi</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {saveError && <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">{saveError}</div>}

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Tarih *</span>
                <input type="date" value={form.tarih} onChange={e => setForm(f => ({ ...f, tarih: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
              </label>

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Başlık *</span>
                <input value={form.baslik} onChange={e => setForm(f => ({ ...f, baslik: e.target.value }))}
                  placeholder="örn. Klavye alımı"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
              </label>

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Açıklama</span>
                <textarea value={form.aciklama} onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))} rows={3}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Tahmini Tutar *</span>
                  <input type="number" step="0.01" min="0" value={form.tahmini_tutar} onChange={e => setForm(f => ({ ...f, tahmini_tutar: e.target.value }))}
                    placeholder="0.00"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Para Birimi</span>
                  <select value={form.para_birimi_kod} onChange={e => setForm(f => ({ ...f, para_birimi_kod: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none">
                    <option value="TRY">TRY</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Kategori</span>
                <select value={form.kategori_id} onChange={e => setForm(f => ({ ...f, kategori_id: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none">
                  <option value="">— Seçilmedi —</option>
                  {kategoriler.map(k => <option key={k.id} value={k.id}>{k.ad}</option>)}
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
            </div>
            <div className="px-5 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving || !form.tarih || !form.baslik.trim() || !form.tahmini_tutar.trim()}
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
