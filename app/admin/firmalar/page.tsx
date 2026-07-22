"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";

export default function AdminFirmalarPage() {
  const [user, setUser] = useState<any>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const router = useRouter();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [formName, setFormName] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Araç yönetim popup
  const [vehicleCompany, setVehicleCompany] = useState<any | null>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [removingVehicle, setRemovingVehicle] = useState<string | null>(null);
  const [togglingVehicle, setTogglingVehicle] = useState<string | null>(null);
  const [clearingAll, setClearingAll] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (!d.ok || d.data?.role !== "admin") { router.replace("/"); return; }
      setUser(d.data);
    }).catch(() => router.replace("/"));
  }, [router]);

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/companies");
      const d = await r.json();
      if (d.ok) setCompanies(d.data);
    } finally { setLoading(false); }
  }

  function openNew() {
    setEditing(null);
    setFormName("");
    setFormNotes("");
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(c: any) {
    setEditing(c);
    setFormName(c.name);
    setFormNotes(c.notes || "");
    setFormError(null);
    setShowForm(true);
  }

  async function save() {
    setFormError(null);
    if (!formName.trim()) { setFormError("Firma adı zorunlu"); return; }
    setSaving(true);
    try {
      const url = editing ? `/api/companies/${editing.id}` : "/api/companies";
      const method = editing ? "PUT" : "POST";
      const r = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName.trim(), notes: formNotes || null, is_active: 1 }),
      });
      const d = await r.json();
      if (d.ok) { setShowForm(false); load(); }
      else setFormError(d.error || "Kayıt başarısız");
    } finally { setSaving(false); }
  }

  async function deleteCompany(id: string, name: string) {
    if (!confirm(`"${name}" firmasını silmek istediğinize emin misiniz?\n\nBu firma pasif duruma alınacaktır.`)) return;
    setDeletingId(id);
    try {
      const r = await fetch(`/api/companies/${id}`, { method: "DELETE" });
      const d = await r.json();
      if (d.ok) load();
      else alert(d.error);
    } finally { setDeletingId(null); }
  }

  async function openVehicles(c: any) {
    setVehicleCompany(c);
    setVehicles([]);
    setLoadingVehicles(true);
    try {
      const r = await fetch(`/api/companies/${c.id}/vehicles`);
      const d = await r.json();
      if (d.ok) setVehicles(d.data);
    } finally { setLoadingVehicles(false); }
  }

  async function removeVehicle(vehicleId: string) {
    if (!vehicleCompany) return;
    setRemovingVehicle(vehicleId);
    try {
      const r = await fetch(`/api/companies/${vehicleCompany.id}/vehicles?vehicleId=${vehicleId}`, { method: "DELETE" });
      const d = await r.json();
      if (d.ok) {
        setVehicles(vs => vs.filter(v => v.id !== vehicleId));
        load(); // araç sayısını güncelle
      } else alert(d.error);
    } finally { setRemovingVehicle(null); }
  }

  async function toggleTemporary(vehicle: any) {
    if (!vehicleCompany) return;
    setTogglingVehicle(vehicle.id);
    try {
      const r = await fetch(`/api/companies/${vehicleCompany.id}/vehicles?vehicleId=${vehicle.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plate: vehicle.plate, driver_name: vehicle.driver_name, route_name: vehicle.route_name, notes: vehicle.notes, is_temporary: !vehicle.is_temporary }),
      });
      const d = await r.json();
      if (d.ok) setVehicles(vs => vs.map(v => v.id === vehicle.id ? { ...v, is_temporary: !vehicle.is_temporary } : v));
      else alert(d.error);
    } finally { setTogglingVehicle(null); }
  }

  async function clearAllVehicles() {
    if (!vehicleCompany || vehicles.length === 0) return;
    if (!confirm(`"${vehicleCompany.name}" firmasına ait ${vehicles.length} aracın tamamı silinecek. Emin misiniz?`)) return;
    setClearingAll(true);
    try {
      for (const v of vehicles) {
        await fetch(`/api/companies/${vehicleCompany.id}/vehicles?vehicleId=${v.id}`, { method: "DELETE" });
      }
      setVehicles([]);
      load();
    } finally { setClearingAll(false); }
  }

  const filtered = companies.filter(c => {
    if (!search) return true;
    return c.name.toLowerCase().includes(search.toLowerCase());
  });

  if (!user) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center"><p className="text-zinc-500">Yükleniyor...</p></div>;

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <a href="/admin" className="text-zinc-500 hover:text-white text-sm transition-colors">Yönetim</a>
              <span className="text-zinc-700">/</span>
              <span className="text-white text-sm">Firmalar</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Firmalar</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{companies.length} aktif firma</p>
          </div>
          <button onClick={openNew}
            className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors whitespace-nowrap">
            + Firma Ekle
          </button>
        </div>

        <div className="relative mb-5">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm pointer-events-none">🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Firma adı ara..."
            className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm pl-8 pr-4 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 placeholder-zinc-600" />
        </div>

        {loading ? (
          <div className="py-16 text-center text-zinc-600 text-sm">Yükleniyor...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-zinc-600 text-sm">Firma bulunamadı</div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-5 py-3">Firma Adı</th>
                  <th className="text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3 hidden sm:table-cell">Araçlar</th>
                  <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Notlar</th>
                  <th className="px-4 py-3 w-40"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20">
                    <td className="px-5 py-3.5 text-white font-medium">{c.name}</td>
                    <td className="px-4 py-3.5 text-center hidden sm:table-cell">
                      <button
                        onClick={() => openVehicles(c)}
                        className="text-xs bg-zinc-800 border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white px-2.5 py-0.5 rounded-full transition-colors"
                      >
                        {c.vehicle_count} araç
                      </button>
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell text-zinc-500 text-xs">{c.notes || "—"}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openVehicles(c)}
                          className="text-xs text-zinc-500 hover:text-white border border-zinc-700 hover:border-zinc-500 px-2.5 py-1 rounded-lg transition-colors sm:hidden">
                          Araçlar
                        </button>
                        <button onClick={() => openEdit(c)}
                          className="text-xs text-zinc-500 hover:text-white border border-zinc-700 hover:border-zinc-500 px-2.5 py-1 rounded-lg transition-colors">
                          Düzenle
                        </button>
                        <button onClick={() => deleteCompany(c.id, c.name)} disabled={deletingId === c.id}
                          className="text-xs text-zinc-600 hover:text-red-400 border border-zinc-700 hover:border-red-800 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40">
                          {deletingId === c.id ? "..." : "Sil"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Add/Edit Firma Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">{editing ? "Firmayı Düzenle" : "Yeni Firma"}</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-600 hover:text-white text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Firma Adı *</label>
                <input value={formName} onChange={e => setFormName(e.target.value)} onKeyDown={e => e.key === "Enter" && save()}
                  placeholder="Örn: ABC Lojistik" autoFocus
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Notlar</label>
                <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={3}
                  placeholder="Opsiyonel notlar..."
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </div>
              {formError && <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-3 py-2">{formError}</p>}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving || !formName.trim()}
                className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Araç Yönetim Popup */}
      {vehicleCompany && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <div>
                <h2 className="text-lg font-bold text-white">{vehicleCompany.name}</h2>
                <p className="text-zinc-500 text-xs mt-0.5">{vehicles.length} araç</p>
              </div>
              <button onClick={() => setVehicleCompany(null)} className="text-zinc-600 hover:text-white text-xl">×</button>
            </div>

            {/* Vehicle list */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {loadingVehicles ? (
                <p className="text-zinc-600 text-sm text-center py-8">Yükleniyor...</p>
              ) : vehicles.length === 0 ? (
                <p className="text-zinc-600 text-sm text-center py-8">Bu firmaya ait araç yok</p>
              ) : (
                <div className="space-y-2">
                  {vehicles.map(v => (
                    <div key={v.id} className="flex items-center justify-between bg-zinc-800 rounded-xl px-4 py-3 gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white text-sm font-mono font-semibold">{v.plate}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${v.is_temporary ? "bg-amber-900/60 text-amber-400" : "bg-emerald-900/60 text-emerald-400"}`}>
                            {v.is_temporary ? "Geçici" : "Kalıcı"}
                          </span>
                        </div>
                        {v.route_name && <div className="text-emerald-500 text-xs mt-0.5">{v.route_name}</div>}
                        {v.driver_name && <div className="text-zinc-500 text-xs">{v.driver_name}</div>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => toggleTemporary(v)}
                          disabled={togglingVehicle === v.id}
                          className={`text-xs px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-40 ${
                            v.is_temporary
                              ? "border-emerald-800 text-emerald-500 hover:bg-emerald-900/30"
                              : "border-amber-800 text-amber-500 hover:bg-amber-900/30"
                          }`}
                          title={v.is_temporary ? "Kalıcıya çevir" : "Geçiciye çevir"}
                        >
                          {togglingVehicle === v.id ? "..." : v.is_temporary ? "→Kalıcı" : "→Geçici"}
                        </button>
                        <button
                          onClick={() => removeVehicle(v.id)}
                          disabled={removingVehicle === v.id}
                          className="text-zinc-600 hover:text-red-400 text-xs px-2.5 py-1 rounded-lg border border-zinc-700 hover:border-red-800 transition-colors disabled:opacity-40"
                        >
                          {removingVehicle === v.id ? "..." : "Sil"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-between gap-3">
              <button
                onClick={clearAllVehicles}
                disabled={clearingAll || vehicles.length === 0}
                className="text-xs text-red-500 hover:text-red-400 border border-red-900 hover:border-red-700 px-3 py-2 rounded-lg transition-colors disabled:opacity-40"
              >
                {clearingAll ? "Siliniyor..." : `Tüm Araçları Sil (${vehicles.length})`}
              </button>
              <button onClick={() => setVehicleCompany(null)} className="bg-zinc-800 text-zinc-300 text-sm font-medium px-4 py-2 rounded-lg hover:bg-zinc-700 transition-colors">
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
