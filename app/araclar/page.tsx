"use client";
import { useState, useEffect, useRef } from "react";
import Nav from "@/components/Nav";
import Badge from "@/components/Badge";

const TYPE_LABELS: Record<string, string> = { minibus: "Minibüs", midibus: "Midibüs", otobus: "Otobüs", sedan: "Sedan" };
const STATUS_OPTS = [{ value: "active", label: "Aktif" }, { value: "maintenance", label: "Bakımda" }, { value: "inactive", label: "Pasif" }];
const TYPE_OPTS = [{ value: "minibus", label: "Minibüs" }, { value: "midibus", label: "Midibüs" }, { value: "otobus", label: "Otobüs" }, { value: "sedan", label: "Sedan" }];
const EMPTY_FORM = { plate: "", type: "minibus", capacity: 14, brand: "", model: "", year: "", driver_name: "", driver_phone: "", status_code: "active", notes: "" };

export default function AraclarPage() {
  const [user, setUser] = useState<any>(null);
  useEffect(() => { fetch("/api/auth/me").then(r => r.json()).then(d => { if (d.ok) setUser(d.data); }).catch(() => {}); }, []);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [searchPlate, setSearchPlate] = useState("");

  // Bulk import (Excel)
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ inserted: number; skipped: number; errors?: string[] } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleBulkUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/companies/upload", { method: "POST", body: fd });
      const d = await r.json();
      if (d.ok) { setUploadResult(d.data); load(); }
      else setUploadError(d.error || "Yükleme başarısız");
    } catch { setUploadError("Sunucuya bağlanılamadı"); }
    finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/vehicles");
      const d = await r.json();
      if (d.ok) setVehicles(d.data);
    } finally { setLoading(false); }
  }

  function openCreate() { setEditing(null); setForm({ ...EMPTY_FORM }); setShowForm(true); }
  function openEdit(v: any) {
    setEditing(v);
    setForm({ plate: v.plate, type: v.type, capacity: v.capacity, brand: v.brand || "", model: v.model || "", year: v.year || "", driver_name: v.driver_name || "", driver_phone: v.driver_phone || "", status_code: v.status_code, notes: v.notes || "" });
    setShowForm(true);
  }

  async function save() {
    if (!form.plate.trim()) return;
    setSaving(true); setSaveError(null);
    try {
      const url = editing ? `/api/vehicles/${editing.id}` : "/api/vehicles";
      const method = editing ? "PUT" : "POST";
      const body = { ...form, year: form.year ? parseInt(form.year as string) || null : null };
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      if (d.ok) { setShowForm(false); load(); }
      else setSaveError(d.error || "Kaydetme başarısız");
    } finally { setSaving(false); }
  }

  const filtered = vehicles
    .filter(v => !filterStatus || v.status_code === filterStatus)
    .filter(v => !searchPlate || v.plate.toLowerCase().includes(searchPlate.toLowerCase()));

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Araçlar</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{filtered.length} araç</p>
          </div>
          <div className="flex gap-2">
            <label className={`cursor-pointer bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm font-medium px-4 py-2 rounded-lg hover:bg-zinc-700 transition-colors whitespace-nowrap ${uploading ? "opacity-50 cursor-not-allowed" : ""}`}>
              {uploading ? "Yükleniyor..." : "↑ Toplu Ekle"}
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleBulkUpload} disabled={uploading} />
            </label>
            <button onClick={openCreate} className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors">+ Araç Ekle</button>
          </div>
        </div>

        {/* Bulk upload result */}
        {uploadResult && (
          <div className="mb-4 px-4 py-3 bg-emerald-950 border border-emerald-800 rounded-xl text-emerald-300 text-sm flex items-center justify-between">
            <span>✓ {uploadResult.inserted} araç eklendi, {uploadResult.skipped} atlandı</span>
            <button onClick={() => setUploadResult(null)} className="text-emerald-500 hover:text-white ml-4">×</button>
          </div>
        )}
        {uploadError && (
          <div className="mb-4 px-4 py-3 bg-red-950 border border-red-800 rounded-xl text-red-300 text-sm flex items-center justify-between">
            <span>{uploadError}</span>
            <button onClick={() => setUploadError(null)} className="text-red-500 hover:text-white ml-4">×</button>
          </div>
        )}
        {/* Excel format hint */}
        <div className="mb-5 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl">
          <p className="text-zinc-500 text-xs">
            <span className="text-zinc-400 font-medium">Toplu Ekle Excel formatı:</span> A = Firma Adı, B = Plaka, C = Şöför (opsiyonel). İlk satır başlık (atlanır). Plaka hem bu listelere, hem firma atamalarına eklenir. Bir plaka birden fazla firmaya atanabilir.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-5">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs pointer-events-none">🔍</span>
            <input
              value={searchPlate}
              onChange={e => setSearchPlate(e.target.value.toUpperCase())}
              placeholder="Plaka ara..."
              className="bg-zinc-900 border border-zinc-800 text-white text-sm pl-8 pr-4 py-2 rounded-lg focus:outline-none focus:border-zinc-600 placeholder-zinc-600 font-mono w-40"
            />
          </div>
          {[{ value: "", label: "Tümü" }, ...STATUS_OPTS].map(o => (
            <button key={o.value} onClick={() => setFilterStatus(o.value)}
              className={`text-xs font-medium px-3 py-2 rounded-lg transition-colors ${filterStatus === o.value ? "bg-white text-zinc-950" : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"}`}>
              {o.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-zinc-600 text-sm">Yükleniyor...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(v => (
              <div key={v.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-white font-bold text-lg tracking-wider">{v.plate}</p>
                    <p className="text-zinc-500 text-xs">{TYPE_LABELS[v.type] || v.type} · {v.capacity} kişi</p>
                  </div>
                  <Badge status={v.status_code} showLabel />
                </div>
                {(v.brand || v.model) && <p className="text-zinc-400 text-sm mb-2">{[v.brand, v.model, v.year].filter(Boolean).join(" ")}</p>}
                {v.driver_name && (
                  <div className="border-t border-zinc-800 pt-3 mt-3">
                    <p className="text-zinc-400 text-xs">Şöför: <span className="text-white">{v.driver_name}</span></p>
                    {v.driver_phone && <p className="text-zinc-500 text-xs">{v.driver_phone}</p>}
                  </div>
                )}
                {v.companies && v.companies.length > 0 && (
                  <div className="border-t border-zinc-800 pt-3 mt-3">
                    <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Firma Atamaları</p>
                    <div className="flex flex-wrap gap-1.5">
                      {v.companies.map((c: any) => (
                        <span key={c.company_id} className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 px-2 py-0.5 rounded-full">{c.company_name}</span>
                      ))}
                    </div>
                  </div>
                )}
                {v.notes && <p className="text-zinc-600 text-xs mt-2 italic">{v.notes}</p>}
                <button onClick={() => openEdit(v)} className="mt-4 text-xs text-zinc-600 hover:text-white transition-colors">Düzenle →</button>
              </div>
            ))}
            {filtered.length === 0 && <div className="col-span-3 py-16 text-center text-zinc-600 text-sm">Araç bulunamadı</div>}
          </div>
        )}
      </main>

      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4 overflow-y-auto py-8">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">{editing ? "Araç Düzenle" : "Araç Ekle"}</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-600 hover:text-white text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Plaka *</label>
                  <input value={form.plate} onChange={e => setForm(f => ({ ...f, plate: e.target.value.toUpperCase() }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 uppercase" placeholder="34 AB 1234" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Tip</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                    {TYPE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Kapasite</label>
                  <input type="number" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: +e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Marka</label>
                  <input value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" placeholder="Ford" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Model</label>
                  <input value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" placeholder="Transit" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Sürücü Adı</label>
                  <input value={form.driver_name} onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Telefon</label>
                  <input value={form.driver_phone} onChange={e => setForm(f => ({ ...f, driver_phone: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Durum</label>
                <select value={form.status_code} onChange={e => setForm(f => ({ ...f, status_code: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                  {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Not</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </div>
            </div>
              {saveError && <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-3 py-2 mt-3">{saveError}</p>}
              <div className="flex gap-3 mt-3">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving || !form.plate.trim()}
                className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors">
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
