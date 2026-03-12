"use client";
import { useState, useEffect } from "react";
import Nav from "@/components/Nav";

const DIR_LABELS: Record<string, string> = { both: "Sabah + Akşam", morning: "Sadece Sabah", evening: "Sadece Akşam" };
const DIR_OPTS = [{ value: "both", label: "Sabah + Akşam" }, { value: "morning", label: "Sadece Sabah" }, { value: "evening", label: "Sadece Akşam" }];
const EMPTY_FORM = { name: "", code: "", direction: "both", morning_departure: "", morning_arrival: "", evening_departure: "", evening_arrival: "", vehicle_id: "", notes: "" };

export default function GuzergahlarPage() {
  const [user, setUser] = useState<any>(null);
  useEffect(() => { fetch("/api/auth/me").then(r => r.json()).then(d => { if (d.ok) setUser(d.data); }).catch(() => {}); }, []);
  const [routes, setRoutes] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    try {
      const [rr, vr] = await Promise.all([fetch("/api/routes"), fetch("/api/vehicles")]);
      const rd = await rr.json();
      const vd = await vr.json();
      if (rd.ok) setRoutes(rd.data);
      if (vd.ok) setVehicles(vd.data.filter((v: any) => v.status_code === "active"));
    } finally { setLoading(false); }
  }

  function openCreate() { setEditing(null); setForm({ ...EMPTY_FORM }); setShowForm(true); }
  function openEdit(r: any) {
    setEditing(r);
    setForm({ name: r.name, code: r.code || "", direction: r.direction, morning_departure: r.morning_departure || "", morning_arrival: r.morning_arrival || "", evening_departure: r.evening_departure || "", evening_arrival: r.evening_arrival || "", vehicle_id: r.vehicle_id || "", notes: r.notes || "" });
    setShowForm(true);
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const url = editing ? `/api/routes/${editing.id}` : "/api/routes";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await res.json();
      if (d.ok) { setShowForm(false); load(); }
      else alert(d.error);
    } finally { setSaving(false); }
  }

  async function toggleActive(r: any) {
    await fetch(`/api/routes/${r.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: r.is_active ? 0 : 1 }) });
    load();
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Güzergahlar</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{routes.length} güzergah</p>
          </div>
          <button onClick={openCreate} className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors">+ Güzergah Ekle</button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-zinc-600 text-sm">Yükleniyor...</div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            {routes.length === 0 ? (
              <div className="py-16 text-center text-zinc-600 text-sm">Güzergah bulunamadı</div>
            ) : routes.map((r, i) => (
              <div key={r.id} className={`flex items-center gap-4 px-5 py-4 ${i < routes.length - 1 ? "border-b border-zinc-800/50" : ""} ${!r.is_active ? "opacity-50" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-white font-semibold text-sm">{r.name}</span>
                    {r.code && <span className="text-zinc-600 text-xs font-mono">({r.code})</span>}
                    <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${r.is_active ? "bg-emerald-950 text-emerald-400" : "bg-zinc-800 text-zinc-500"}`}>
                      {r.is_active ? "Aktif" : "Pasif"}
                    </span>
                  </div>
                  <p className="text-zinc-500 text-xs">{DIR_LABELS[r.direction] || r.direction}</p>
                </div>
                <div className="hidden md:flex flex-col items-end gap-0.5 text-xs text-zinc-500">
                  {(r.direction === "morning" || r.direction === "both") && r.morning_departure && (
                    <span>Sabah: {r.morning_departure} → {r.morning_arrival || "?"}</span>
                  )}
                  {(r.direction === "evening" || r.direction === "both") && r.evening_departure && (
                    <span>Akşam: {r.evening_departure} → {r.evening_arrival || "?"}</span>
                  )}
                </div>
                {r.vehicle_plate && (
                  <span className="hidden lg:block text-xs font-mono text-zinc-400 bg-zinc-800 px-2 py-1 rounded">{r.vehicle_plate}</span>
                )}
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => openEdit(r)} className="text-xs text-zinc-600 hover:text-white transition-colors">Düzenle</button>
                  <button onClick={() => toggleActive(r)} className={`text-xs transition-colors ${r.is_active ? "text-zinc-600 hover:text-amber-400" : "text-zinc-600 hover:text-emerald-400"}`}>
                    {r.is_active ? "Durdur" : "Aktifleştir"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4 overflow-y-auto py-8">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">{editing ? "Güzergah Düzenle" : "Güzergah Ekle"}</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-600 hover:text-white text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Güzergah Adı *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" placeholder="Kadıköy - Şişli" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Kod</label>
                  <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" placeholder="R-01" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Yön</label>
                <select value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                  {DIR_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {(form.direction === "morning" || form.direction === "both") && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Sabah Kalkış</label>
                    <input type="time" value={form.morning_departure} onChange={e => setForm(f => ({ ...f, morning_departure: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Sabah Varış</label>
                    <input type="time" value={form.morning_arrival} onChange={e => setForm(f => ({ ...f, morning_arrival: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                  </div>
                </div>
              )}
              {(form.direction === "evening" || form.direction === "both") && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Akşam Kalkış</label>
                    <input type="time" value={form.evening_departure} onChange={e => setForm(f => ({ ...f, evening_departure: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Akşam Varış</label>
                    <input type="time" value={form.evening_arrival} onChange={e => setForm(f => ({ ...f, evening_arrival: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Atanan Araç</label>
                <select value={form.vehicle_id} onChange={e => setForm(f => ({ ...f, vehicle_id: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                  <option value="">— Seç —</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate}{v.driver_name ? ` · ${v.driver_name}` : ""}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Not</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving || !form.name.trim()}
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
