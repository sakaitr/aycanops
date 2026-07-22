"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import ComboboxSearch from "@/components/ComboboxSearch";
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

const SIGORTA_TURU_OPTS = [
  { value: "kasko", label: "Kasko" },
  { value: "trafik", label: "Trafik" },
  { value: "koltuk", label: "Koltuk" },
  { value: "ferdi_kaza", label: "Ferdi Kaza" },
];

function expiryBadge(kalanGun: number | null) {
  if (kalanGun == null) return null;
  if (kalanGun < 0) return { label: "Süresi Geçti", cls: "bg-red-950 border-red-800 text-red-300" };
  if (kalanGun <= 30) return { label: `${kalanGun}g kaldı`, cls: "bg-amber-950 border-amber-800 text-amber-300" };
  return null;
}

const EMPTY_FORM = {
  vehicle_id: "", police_no: "", sigorta_turu: "trafik", sigorta_firmasi: "",
  acente_no: "", baslangic_tarihi: "", bitis_tarihi: "", prim_tutari: "", aciklama: "",
};

export default function SigortalarPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<any[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data);
      else router.replace("/login");
    });
    fetch("/api/vehicles?limit=500").then(r => r.json()).then(d => { if (d.ok) setVehicles(d.data); });
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/filo/sigortalar");
      const d = await r.json();
      if (d.ok) { setRows(d.data); setTotal(d.meta?.total ?? d.data.length); }
    } finally { setLoading(false); }
  }

  async function save() {
    if (!form.vehicle_id) { setSaveError("Araç seçiniz"); return; }
    if (!form.police_no.trim()) { setSaveError("Poliçe numarası zorunludur"); return; }
    if (!form.baslangic_tarihi || !form.bitis_tarihi) { setSaveError("Başlangıç/bitiş tarihi zorunludur"); return; }
    setSaving(true); setSaveError(null);
    try {
      const res = await fetch("/api/filo/sigortalar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!d.ok) { setSaveError(d.error || "Kayıt hatası"); return; }
      toast.success("Sigorta kaydı eklendi");
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      load();
    } finally { setSaving(false); }
  }

  const canCreate = hasPermission(user, "fleet_insurances:create");

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-4xl mx-auto px-4 py-6">

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Sigortalar</h1>
              <p className="text-zinc-500 text-sm mt-0.5">{total} poliçe</p>
            </div>
            {canCreate && (
              <button onClick={() => { setShowForm(true); setForm({ ...EMPTY_FORM }); setSaveError(null); }}
                className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors whitespace-nowrap">
                + Yeni Poliçe
              </button>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-16 animate-pulse" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-zinc-600">Sigorta kaydı yok</div>
          ) : (
            <div className="space-y-2">
              {rows.map(row => {
                const badge = expiryBadge(row.kalan_gun);
                const turuLabel = SIGORTA_TURU_OPTS.find(o => o.value === row.sigorta_turu)?.label || row.sigorta_turu;
                return (
                  <div key={row.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-mono font-semibold text-sm">{row.plate}</span>
                      <span className="text-zinc-500 text-xs">{turuLabel}</span>
                      <span className="text-zinc-600 text-xs">{row.police_no}</span>
                      {badge && <span className={`text-[10px] px-1.5 py-0.5 rounded border ${badge.cls}`}>{badge.label}</span>}
                      {row.prim_tutari && <span className="text-white font-semibold text-sm ml-auto">{formatCurrency(row.prim_tutari)}</span>}
                    </div>
                    <p className="text-zinc-600 text-xs mt-1">
                      {formatDate(row.baslangic_tarihi)} — {formatDate(row.bitis_tarihi)}
                      {row.sigorta_firmasi ? ` · ${row.sigorta_firmasi}` : ""}
                    </p>
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
              <h2 className="text-white font-semibold">Yeni Poliçe</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {saveError && <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">{saveError}</div>}
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Araç *</span>
                <ComboboxSearch options={vehicles.map((v: any) => ({ value: v.id, label: v.plate }))}
                  value={form.vehicle_id} onChange={v => setForm(f => ({ ...f, vehicle_id: v }))}
                  placeholder="Araç seç..." emptyLabel="— Araç Yok —" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Poliçe No *</span>
                  <input value={form.police_no} onChange={e => setForm(f => ({ ...f, police_no: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Sigorta Türü *</span>
                  <select value={form.sigorta_turu} onChange={e => setForm(f => ({ ...f, sigorta_turu: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                    {SIGORTA_TURU_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Sigorta Firması</span>
                  <input value={form.sigorta_firmasi} onChange={e => setForm(f => ({ ...f, sigorta_firmasi: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Acente No</span>
                  <input value={form.acente_no} onChange={e => setForm(f => ({ ...f, acente_no: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Başlangıç Tarihi *</span>
                  <input type="date" value={form.baslangic_tarihi} onChange={e => setForm(f => ({ ...f, baslangic_tarihi: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Bitiş Tarihi *</span>
                  <input type="date" value={form.bitis_tarihi} onChange={e => setForm(f => ({ ...f, bitis_tarihi: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
                </label>
              </div>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Prim Tutarı</span>
                <input type="number" min="0" step="0.01" value={form.prim_tutari} onChange={e => setForm(f => ({ ...f, prim_tutari: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Açıklama</span>
                <textarea value={form.aciklama} onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))} rows={2}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </label>
            </div>
            <div className="px-5 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving || !form.vehicle_id || !form.police_no.trim()}
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
