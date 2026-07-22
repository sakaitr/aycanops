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

const EMPTY_FORM = {
  vehicle_id: "", driver_id: "", tarih: "", arac_km: "",
  kaza_turu: "", kaza_sekli: "", belge_no: "", kusur_orani: "", aciklama: "",
};

const KAZA_TURU_OPTS = ["Maddi Hasarlı", "Yaralanmalı", "Ölümlü", "Diğer"];
const KAZA_SEKLI_OPTS = ["Arkadan Çarpma", "Öndeki Araca Çarpma", "Yandan Çarpma", "Tek Taraflı Kaza", "Park Halinde Çarpılan", "Diğer"];

export default function KazalarPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [durumFilter, setDurumFilter] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [kazaTuruDiger, setKazaTuruDiger] = useState(false);
  const [kazaSekliDiger, setKazaSekliDiger] = useState(false);
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
      const r = await fetch(`/api/filo/kazalar?${params}`);
      const d = await r.json();
      if (d.ok) setRows(d.data);
    } finally { setLoading(false); }
  }

  async function save() {
    if (!form.vehicle_id) { setSaveError("Araç seçiniz"); return; }
    if (!form.tarih) { setSaveError("Tarih zorunludur"); return; }
    setSaving(true); setSaveError(null);
    try {
      const res = await fetch("/api/filo/kazalar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!d.ok) { setSaveError(d.error || "Kayıt hatası"); return; }
      toast.success("Kaza kaydı eklendi");
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      setKazaTuruDiger(false);
      setKazaSekliDiger(false);
      load();
    } finally { setSaving(false); }
  }

  async function kapat(id: string) {
    if (!confirm("Bu kaza kaydı kapatılsın mı?")) return;
    const res = await fetch(`/api/filo/kazalar/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "durum-degistir", durum: "kapali" }),
    });
    const d = await res.json();
    if (!d.ok) { toast.error(d.error || "Hata"); return; }
    toast.success("Kayıt kapatıldı");
    load();
  }

  const canCreate = hasPermission(user, "fleet_accidents:create");

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-4xl mx-auto px-4 py-6">

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Kazalar</h1>
              <p className="text-zinc-500 text-sm mt-0.5">{rows.length} kayıt</p>
            </div>
            {canCreate && (
              <button onClick={() => { setShowForm(true); setForm({ ...EMPTY_FORM }); setKazaTuruDiger(false); setKazaSekliDiger(false); setSaveError(null); }}
                className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors whitespace-nowrap">
                + Yeni Kaza Kaydı
              </button>
            )}
          </div>

          <div className="flex gap-2 mb-6">
            {[["", "Tümü"], ["aktif", "Aktif"], ["kapali", "Kapalı"]].map(([v, l]) => (
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
            <div className="text-center py-16 text-zinc-600">Kaza kaydı yok</div>
          ) : (
            <div className="space-y-2">
              {rows.map(row => (
                <div key={row.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-mono font-semibold text-sm">{row.plate}</span>
                    <span className="text-zinc-500 text-xs">{formatDate(row.tarih)}</span>
                    {row.kaza_turu && <span className="text-zinc-500 text-xs">· {row.kaza_turu}</span>}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ml-auto ${
                      row.durum === "aktif" ? "bg-amber-950 border-amber-800 text-amber-300" : "bg-zinc-800 border-zinc-700 text-zinc-500"
                    }`}>
                      {row.durum === "aktif" ? "Aktif" : "Kapalı"}
                    </span>
                  </div>
                  <p className="text-zinc-600 text-xs mt-1">
                    {row.driver_name ? `${row.driver_name} · ` : ""}
                    {row.kusur_orani != null ? `Kusur %${row.kusur_orani} · ` : ""}
                    {row.aciklama || ""}
                  </p>
                  {canCreate && row.durum === "aktif" && (
                    <button onClick={() => kapat(row.id)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors mt-2">
                      Kapat
                    </button>
                  )}
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
              <h2 className="text-white font-semibold">Yeni Kaza Kaydı</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {saveError && <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">{saveError}</div>}
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Araç *</span>
                <ComboboxSearch options={vehicles.map((v: any) => ({ value: v.id, label: `${v.plate}` }))}
                  value={form.vehicle_id} onChange={v => setForm(f => ({ ...f, vehicle_id: v }))}
                  placeholder="Araç seç..." emptyLabel="— Araç Yok —" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Tarih *</span>
                  <input type="date" value={form.tarih} onChange={e => setForm(f => ({ ...f, tarih: e.target.value }))}
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
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Kaza Türü</span>
                  <select
                    value={kazaTuruDiger ? "Diğer" : form.kaza_turu}
                    onChange={e => {
                      const isDiger = e.target.value === "Diğer";
                      setKazaTuruDiger(isDiger);
                      setForm(f => ({ ...f, kaza_turu: isDiger ? "" : e.target.value }));
                    }}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                    <option value="">— Seçin —</option>
                    {KAZA_TURU_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  {kazaTuruDiger && (
                    <input value={form.kaza_turu} onChange={e => setForm(f => ({ ...f, kaza_turu: e.target.value }))}
                      className="w-full mt-1.5 bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" placeholder="Kaza türünü yazın" />
                  )}
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Kaza Şekli</span>
                  <select
                    value={kazaSekliDiger ? "Diğer" : form.kaza_sekli}
                    onChange={e => {
                      const isDiger = e.target.value === "Diğer";
                      setKazaSekliDiger(isDiger);
                      setForm(f => ({ ...f, kaza_sekli: isDiger ? "" : e.target.value }));
                    }}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                    <option value="">— Seçin —</option>
                    {KAZA_SEKLI_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  {kazaSekliDiger && (
                    <input value={form.kaza_sekli} onChange={e => setForm(f => ({ ...f, kaza_sekli: e.target.value }))}
                      className="w-full mt-1.5 bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" placeholder="Kaza şeklini yazın" />
                  )}
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Belge No</span>
                  <input value={form.belge_no} onChange={e => setForm(f => ({ ...f, belge_no: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Kusur Oranı (%)</span>
                  <input type="number" min="0" max="100" value={form.kusur_orani} onChange={e => setForm(f => ({ ...f, kusur_orani: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
              </div>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Açıklama</span>
                <textarea value={form.aciklama} onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))} rows={3}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </label>
            </div>
            <div className="px-5 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving || !form.vehicle_id || !form.tarih}
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
