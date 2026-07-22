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
  gps_saglayici: "", gps_id: "", gsm_no: "", imei: "", vehicle_id: "",
  atama_tarihi: "", atama_turu: "kalici", notlar: "",
};

export default function GpsCihazlariPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [durumFilter, setDurumFilter] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data);
      else router.replace("/login");
    });
    fetch("/api/vehicles?limit=500").then(r => r.json()).then(d => { if (d.ok) setVehicles(d.data); });
  }, []);

  useEffect(() => { load(); }, [durumFilter]);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (durumFilter) params.set("is_active", durumFilter);
      const r = await fetch(`/api/gps-cihazlari?${params}`);
      const d = await r.json();
      if (d.ok) setRows(d.data);
    } finally { setLoading(false); }
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setSaveError(null);
    setShowForm(true);
  }

  function openEdit(row: any) {
    setEditing(row);
    setForm({
      gps_saglayici: row.gps_saglayici || "", gps_id: row.gps_id || "", gsm_no: row.gsm_no || "",
      imei: row.imei || "", vehicle_id: row.vehicle_id || "", atama_tarihi: row.atama_tarihi || "",
      atama_turu: row.atama_turu || "kalici", notlar: row.notlar || "",
    });
    setSaveError(null);
    setShowForm(true);
  }

  async function save() {
    if (!form.imei.trim()) { setSaveError("IMEI zorunludur"); return; }
    setSaving(true); setSaveError(null);
    try {
      const url = editing ? `/api/gps-cihazlari/${editing.id}` : "/api/gps-cihazlari";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await res.json();
      if (!d.ok) { setSaveError(d.error || "Kayıt hatası"); return; }
      toast.success(editing ? "Cihaz güncellendi" : "Cihaz eklendi");
      setShowForm(false);
      load();
    } finally { setSaving(false); }
  }

  async function toggleActive(row: any) {
    const res = await fetch(`/api/gps-cihazlari/${row.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "durum-degistir", is_active: !row.is_active }),
    });
    const d = await res.json();
    if (!d.ok) { toast.error(d.error || "Hata"); return; }
    toast.success(row.is_active ? "Cihaz pasife alındı" : "Cihaz aktifleştirildi");
    load();
  }

  const canCreate = hasPermission(user, "gps_devices:create");

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-4xl mx-auto px-4 py-6">

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">GPS Cihazları</h1>
              <p className="text-zinc-500 text-sm mt-0.5">{rows.length} cihaz</p>
            </div>
            {canCreate && (
              <button onClick={openCreate}
                className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors whitespace-nowrap">
                + Yeni Cihaz
              </button>
            )}
          </div>

          <div className="flex gap-2 mb-6">
            {[["", "Tümü"], ["1", "Aktif"], ["0", "Pasif"]].map(([v, l]) => (
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
            <div className="text-center py-16 text-zinc-600">
              <p>Henüz GPS cihazı kaydı yok</p>
              <p className="text-xs mt-1">Araçlara takılı GPS cihazlarının GSM/IMEI bilgilerini burada takip edebilirsiniz</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map(row => (
                <div key={row.id} onClick={() => openEdit(row)} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 cursor-pointer hover:border-zinc-700 transition-colors">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-semibold text-sm">{row.gps_saglayici || "Sağlayıcı belirtilmemiş"}</span>
                    {row.plate && <span className="text-zinc-400 font-mono text-xs">{row.plate}</span>}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ml-auto ${
                      row.atama_turu === "kalici" ? "bg-zinc-800 border-zinc-700 text-zinc-400" : "bg-amber-950 border-amber-800 text-amber-300"
                    }`}>
                      {row.atama_turu === "kalici" ? "Kalıcı" : "Geçici"}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      row.is_active ? "bg-emerald-950 border-emerald-800 text-emerald-300" : "bg-zinc-800 border-zinc-700 text-zinc-500"
                    }`}>
                      {row.is_active ? "Aktif" : "Pasif"}
                    </span>
                  </div>
                  <p className="text-zinc-600 text-xs mt-1">
                    IMEI: {row.imei}{row.gsm_no ? ` · GSM: ${row.gsm_no}` : ""}{row.atama_tarihi ? ` · Atama: ${formatDate(row.atama_tarihi)}` : ""}
                  </p>
                  {canCreate && (
                    <button onClick={e => { e.stopPropagation(); toggleActive(row); }}
                      className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors mt-2">
                      {row.is_active ? "Pasife Al" : "Aktifleştir"}
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
              <h2 className="text-white font-semibold">{editing ? "Cihazı Düzenle" : "Yeni GPS Cihazı"}</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {saveError && <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">{saveError}</div>}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">GPS Sağlayıcı</span>
                  <input value={form.gps_saglayici} onChange={e => setForm(f => ({ ...f, gps_saglayici: e.target.value }))}
                    placeholder="örn. Arvento, Radar"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Sağlayıcı Cihaz ID</span>
                  <input value={form.gps_id} onChange={e => setForm(f => ({ ...f, gps_id: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">IMEI *</span>
                  <input value={form.imei} onChange={e => setForm(f => ({ ...f, imei: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">GSM No</span>
                  <input value={form.gsm_no} onChange={e => setForm(f => ({ ...f, gsm_no: e.target.value }))}
                    placeholder="05xx xxx xx xx"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
              </div>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Takılı Araç</span>
                <ComboboxSearch options={vehicles.map((v: any) => ({ value: v.id, label: v.plate }))}
                  value={form.vehicle_id} onChange={v => setForm(f => ({ ...f, vehicle_id: v }))}
                  placeholder="Araç seç..." emptyLabel="— Araca takılı değil —" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Atama Tarihi</span>
                  <input type="date" value={form.atama_tarihi} onChange={e => setForm(f => ({ ...f, atama_tarihi: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Atama Türü</span>
                  <select value={form.atama_turu} onChange={e => setForm(f => ({ ...f, atama_turu: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                    <option value="kalici">Kalıcı</option>
                    <option value="gecici">Geçici</option>
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Not</span>
                <textarea value={form.notlar} onChange={e => setForm(f => ({ ...f, notlar: e.target.value }))} rows={3}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </label>
            </div>
            <div className="px-5 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving || !form.imei.trim()}
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
