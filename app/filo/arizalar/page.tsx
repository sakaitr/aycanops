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

const DURUM_BADGE: Record<string, { label: string; cls: string }> = {
  bekliyor: { label: "Bekliyor", cls: "bg-amber-950 border-amber-800 text-amber-300" },
  devam_ediyor: { label: "Devam Ediyor", cls: "bg-sky-950 border-sky-800 text-sky-300" },
  onarildi: { label: "Onarıldı", cls: "bg-emerald-950 border-emerald-800 text-emerald-300" },
};

const EMPTY_FORM = {
  vehicle_id: "", driver_id: "", ariza_tarihi: "", arac_km: "",
  ariza_detay: "", bildiren_kisi: "", bildiren_gorevi: "", vardiya_amiri: "",
};

export default function ArizalarPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [durumFilter, setDurumFilter] = useState("");

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

  useEffect(() => { load(); }, [durumFilter]);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (durumFilter) params.set("durum", durumFilter);
      const r = await fetch(`/api/filo/arizalar?${params}`);
      const d = await r.json();
      if (d.ok) setRows(d.data);
    } finally { setLoading(false); }
  }

  async function save() {
    if (!form.vehicle_id) { setSaveError("Araç seçiniz"); return; }
    if (!form.ariza_tarihi) { setSaveError("Arıza tarihi zorunludur"); return; }
    setSaving(true); setSaveError(null);
    try {
      const res = await fetch("/api/filo/arizalar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!d.ok) { setSaveError(d.error || "Kayıt hatası"); return; }
      toast.success("Arıza kaydı eklendi");
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      load();
    } finally { setSaving(false); }
  }

  async function degistirDurum(id: string, durum: string) {
    const res = await fetch(`/api/filo/arizalar/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "durum-degistir", durum }),
    });
    const d = await res.json();
    if (!d.ok) { toast.error(d.error || "Hata"); return; }
    toast.success("Durum güncellendi");
    load();
  }

  const canCreate = hasPermission(user, "fleet_breakdowns:create");

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-4xl mx-auto px-4 py-6">

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Arızalar</h1>
              <p className="text-zinc-500 text-sm mt-0.5">{rows.length} kayıt</p>
            </div>
            {canCreate && (
              <button onClick={() => { setShowForm(true); setForm({ ...EMPTY_FORM }); setSaveError(null); }}
                className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors whitespace-nowrap">
                + Yeni Arıza Bildir
              </button>
            )}
          </div>

          <div className="flex gap-2 mb-6">
            {[["", "Tümü"], ["bekliyor", "Bekliyor"], ["devam_ediyor", "Devam Ediyor"], ["onarildi", "Onarıldı"]].map(([v, l]) => (
              <button key={v} onClick={() => setDurumFilter(v)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  durumFilter === v ? "bg-zinc-700 border-zinc-600 text-white" : "border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-600"
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
            <div className="text-center py-16 text-zinc-600">Arıza kaydı yok</div>
          ) : (
            <div className="space-y-2">
              {rows.map(row => {
                const badge = DURUM_BADGE[row.durum] || DURUM_BADGE.bekliyor;
                return (
                  <div key={row.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-mono font-semibold text-sm">{row.plate}</span>
                      <span className="text-zinc-500 text-xs">{formatDate(row.ariza_tarihi)}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ml-auto ${badge.cls}`}>{badge.label}</span>
                    </div>
                    {row.ariza_detay && <p className="text-zinc-400 text-xs mt-1">{row.ariza_detay}</p>}
                    <p className="text-zinc-600 text-xs mt-0.5">
                      {row.bildiren_kisi ? `Bildiren: ${row.bildiren_kisi}` : ""}
                      {row.driver_name ? ` · Sürücü: ${row.driver_name}` : ""}
                    </p>
                    {canCreate && row.durum !== "onarildi" && (
                      <div className="flex gap-2 mt-2">
                        {row.durum === "bekliyor" && (
                          <button onClick={() => degistirDurum(row.id, "devam_ediyor")}
                            className="text-xs px-3 py-1.5 rounded-lg border border-sky-800 bg-sky-950 text-sky-300 hover:bg-sky-900 transition-colors">
                            Devam Ediyor İşaretle
                          </button>
                        )}
                        <button onClick={() => degistirDurum(row.id, "onarildi")}
                          className="text-xs px-3 py-1.5 rounded-lg border border-emerald-800 bg-emerald-950 text-emerald-300 hover:bg-emerald-900 transition-colors">
                          Onarıldı İşaretle
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

      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/60" onClick={() => setShowForm(false)} />
          <div className="w-full max-w-md bg-zinc-900 border-l border-zinc-800 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
              <h2 className="text-white font-semibold">Yeni Arıza Bildir</h2>
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
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Arıza Tarihi *</span>
                  <input type="date" value={form.ariza_tarihi} onChange={e => setForm(f => ({ ...f, ariza_tarihi: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Araç KM</span>
                  <input type="number" value={form.arac_km} onChange={e => setForm(f => ({ ...f, arac_km: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
              </div>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Sürücü</span>
                <ComboboxSearch options={drivers.map((d: any) => ({ value: d.id, label: d.name }))}
                  value={form.driver_id} onChange={v => setForm(f => ({ ...f, driver_id: v }))}
                  placeholder="Sürücü seç..." emptyLabel="— Sürücü Yok —" />
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Arıza Detayı</span>
                <textarea value={form.ariza_detay} onChange={e => setForm(f => ({ ...f, ariza_detay: e.target.value }))} rows={3}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Bildiren Kişi</span>
                  <input value={form.bildiren_kisi} onChange={e => setForm(f => ({ ...f, bildiren_kisi: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Görevi</span>
                  <input value={form.bildiren_gorevi} onChange={e => setForm(f => ({ ...f, bildiren_gorevi: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
              </div>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Vardiya Amiri</span>
                <input value={form.vardiya_amiri} onChange={e => setForm(f => ({ ...f, vardiya_amiri: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
              </label>
            </div>
            <div className="px-5 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving || !form.vehicle_id || !form.ariza_tarihi}
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
