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

const EMPTY_FORM = {
  vehicle_id: "", driver_id: "", ceza_tarihi: "", referans_no: "",
  belge_no: "", ceza_puani: "", ceza_tutari: "", ceza_turu: "", aciklama: "",
};

export default function CezalarPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [odendiFilter, setOdendiFilter] = useState("");

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
    fetch("/api/suruculer?limit=500").then(r => r.json()).then(d => { if (d.ok) setDrivers(d.data); });
  }, []);

  useEffect(() => { load(); }, [odendiFilter]);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (odendiFilter) params.set("odendi", odendiFilter);
      const r = await fetch(`/api/filo/cezalar?${params}`);
      const d = await r.json();
      if (d.ok) setRows(d.data);
    } finally { setLoading(false); }
  }

  async function save() {
    if (!form.vehicle_id) { setSaveError("Araç seçiniz"); return; }
    if (!form.ceza_tarihi) { setSaveError("Ceza tarihi zorunludur"); return; }
    setSaving(true); setSaveError(null);
    try {
      const res = await fetch("/api/filo/cezalar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!d.ok) { setSaveError(d.error || "Kayıt hatası"); return; }
      toast.success("Ceza kaydı eklendi");
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      load();
    } finally { setSaving(false); }
  }

  async function toggleOdendi(id: string, odendi: boolean) {
    const res = await fetch(`/api/filo/cezalar/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle-odendi", odendi: !odendi }),
    });
    const d = await res.json();
    if (!d.ok) { toast.error(d.error || "Hata"); return; }
    load();
  }

  const canCreate = hasPermission(user, "fleet_penalties:create");
  const toplamCeza = rows.reduce((sum, r) => sum + Number(r.ceza_tutari || 0), 0);
  const toplamPuan = rows.reduce((sum, r) => sum + Number(r.ceza_puani || 0), 0);

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-4xl mx-auto px-4 py-6">

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Cezalar</h1>
              <p className="text-zinc-500 text-sm mt-0.5">{rows.length} kayıt · {toplamPuan} puan · {formatCurrency(toplamCeza)}</p>
            </div>
            {canCreate && (
              <button onClick={() => { setShowForm(true); setForm({ ...EMPTY_FORM }); setSaveError(null); }}
                className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors whitespace-nowrap">
                + Yeni Ceza Kaydı
              </button>
            )}
          </div>

          <div className="flex gap-2 mb-6">
            {[["", "Tümü"], ["0", "Ödenmedi"], ["1", "Ödendi"]].map(([v, l]) => (
              <button key={v} onClick={() => setOdendiFilter(v)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  odendiFilter === v ? "bg-zinc-700 border-zinc-600 text-white" : "border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-600"
                }`}>
                {l}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-16 animate-pulse" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-zinc-600">Ceza kaydı yok</div>
          ) : (
            <div className="space-y-2">
              {rows.map(row => (
                <div key={row.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-mono font-semibold text-sm">{row.plate}</span>
                    <span className="text-zinc-500 text-xs">{formatDate(row.ceza_tarihi)}</span>
                    {row.ceza_turu && <span className="text-zinc-500 text-xs">· {row.ceza_turu}</span>}
                    {row.ceza_puani && <span className="text-amber-400 text-xs">{row.ceza_puani} puan</span>}
                    <span className="text-white font-semibold text-sm ml-auto">{formatCurrency(row.ceza_tutari)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <p className="text-zinc-600 text-xs">{row.driver_name || ""}</p>
                    {canCreate && (
                      <button onClick={() => toggleOdendi(row.id, !!row.odendi)}
                        className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                          row.odendi ? "bg-emerald-950 border-emerald-800 text-emerald-300" : "bg-zinc-800 border-zinc-700 text-zinc-500 hover:text-white"
                        }`}>
                        {row.odendi ? "Ödendi" : "Ödenmedi"}
                      </button>
                    )}
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
              <h2 className="text-white font-semibold">Yeni Ceza Kaydı</h2>
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
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Ceza Tarihi *</span>
                  <input type="date" value={form.ceza_tarihi} onChange={e => setForm(f => ({ ...f, ceza_tarihi: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Ceza Türü</span>
                  <input value={form.ceza_turu} onChange={e => setForm(f => ({ ...f, ceza_turu: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" placeholder="örn. Hız İhlali" />
                </label>
              </div>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Sürücü</span>
                <ComboboxSearch options={drivers.map((d: any) => ({ value: d.id, label: d.name }))}
                  value={form.driver_id} onChange={v => setForm(f => ({ ...f, driver_id: v }))}
                  placeholder="Sürücü seç..." emptyLabel="— Sürücü Yok —" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Referans No</span>
                  <input value={form.referans_no} onChange={e => setForm(f => ({ ...f, referans_no: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Belge No</span>
                  <input value={form.belge_no} onChange={e => setForm(f => ({ ...f, belge_no: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Ceza Puanı</span>
                  <input type="number" min="0" value={form.ceza_puani} onChange={e => setForm(f => ({ ...f, ceza_puani: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Ceza Tutarı</span>
                  <input type="number" min="0" step="0.01" value={form.ceza_tutari} onChange={e => setForm(f => ({ ...f, ceza_tutari: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
              </div>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Açıklama</span>
                <textarea value={form.aciklama} onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))} rows={2}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </label>
            </div>
            <div className="px-5 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving || !form.vehicle_id || !form.ceza_tarihi}
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
