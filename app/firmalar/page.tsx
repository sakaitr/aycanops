"use client";
import { useState, useEffect, useRef } from "react";
import Nav from "@/components/Nav";

export default function FirmalarPage() {
  const [user, setUser] = useState<any>(null);
  useEffect(() => { fetch("/api/auth/me").then(r => r.json()).then(d => { if (d.ok) setUser(d.data); }).catch(() => {}); }, []);
  const [companies, setCompanies] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);

  // Add company
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [companyForm, setCompanyForm] = useState({ name: "", notes: "" });
  const [savingCompany, setSavingCompany] = useState(false);

  // Routes for dropdown
  const [routes, setRoutes] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/routes").then(r => r.json()).then(d => { if (d.ok) setRoutes(d.data.filter((r: any) => r.is_active)); }).catch(() => {});
  }, []);

  // Add vehicle
  const [addVehicleFor, setAddVehicleFor] = useState<string | null>(null);
  const [plateInput, setPlateInput] = useState("");
  const [driverNameInput, setDriverNameInput] = useState("");
  const [routeIdInput, setRouteIdInput] = useState("");
  const [savingVehicle, setSavingVehicle] = useState(false);

  // Excel upload
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ inserted: number; skipped: number } | null>(null);

  // Edit company
  const [editCompany, setEditCompany] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ name: "", notes: "" });
  const [savingEdit, setSavingEdit] = useState(false);

  // Edit vehicle
  const [editVehicle, setEditVehicle] = useState<{ companyId: string; vehicle: any } | null>(null);
  const [editVehicleForm, setEditVehicleForm] = useState({ plate: "", driver_name: "", route_id: "", notes: "" });
  const [savingEditVehicle, setSavingEditVehicle] = useState(false);

  // Vehicle history
  const [historyVehicle, setHistoryVehicle] = useState<any | null>(null);
  const [historyData, setHistoryData] = useState<any | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  async function loadHistory(vehicle: any) {
    setHistoryVehicle(vehicle);
    setHistoryData(null);
    setHistoryLoading(true);
    try {
      const r = await fetch(`/api/vehicles/history?vehicle_id=${vehicle.id}&limit=20`);
      const d = await r.json();
      if (d.ok) setHistoryData(d.data);
      else setHistoryData({ error: d.error });
    } catch { setHistoryData({ error: "Sunucuya bağlanılamadı" }); }
    finally { setHistoryLoading(false); }
  }

  // Remove vehicle
  const [removingVehicle, setRemovingVehicle] = useState<string | null>(null);

  useEffect(() => { loadCompanies(); }, []);

  async function loadCompanies() {
    setLoading(true);
    try {
      const r = await fetch("/api/companies");
      const d = await r.json();
      if (d.ok) setCompanies(d.data);
    } finally { setLoading(false); }
  }

  async function loadVehicles(companyId: string) {
    const r = await fetch(`/api/companies/${companyId}/vehicles`);
    const d = await r.json();
    if (d.ok) setVehicles(v => ({ ...v, [companyId]: d.data }));
  }

  function toggleExpand(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    loadVehicles(id);
  }

  async function saveCompany() {
    if (!companyForm.name.trim()) return;
    setSavingCompany(true);
    try {
      const r = await fetch("/api/companies", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(companyForm),
      });
      const d = await r.json();
      if (d.ok) { setShowAddCompany(false); setCompanyForm({ name: "", notes: "" }); loadCompanies(); }
      else alert(d.error);
    } finally { setSavingCompany(false); }
  }

  async function saveVehicle(companyId: string) {
    if (!plateInput.trim()) return;
    setSavingVehicle(true);
    try {
      const r = await fetch(`/api/companies/${companyId}/vehicles`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plate: plateInput, driver_name: driverNameInput.trim() || undefined, route_id: routeIdInput || undefined }),
      });
      const d = await r.json();
      if (d.ok) { setAddVehicleFor(null); setPlateInput(""); setDriverNameInput(""); setRouteIdInput(""); loadVehicles(companyId); loadCompanies(); }
      else alert(d.error);
    } finally { setSavingVehicle(false); }
  }

  async function saveEditCompany() {
    if (!editCompany || !editForm.name.trim()) return;
    setSavingEdit(true);
    try {
      const r = await fetch(`/api/companies/${editCompany.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editForm.name, notes: editForm.notes }),
      });
      const d = await r.json();
      if (d.ok) { setEditCompany(null); loadCompanies(); }
      else alert(d.error);
    } finally { setSavingEdit(false); }
  }

  async function saveEditVehicle() {
    if (!editVehicle || !editVehicleForm.plate.trim()) return;
    setSavingEditVehicle(true);
    try {
      const payload = { plate: editVehicleForm.plate, driver_name: editVehicleForm.driver_name, route_id: editVehicleForm.route_id || null, notes: editVehicleForm.notes };
      const r = await fetch(
        `/api/companies/${editVehicle.companyId}/vehicles?vehicleId=${editVehicle.vehicle.id}`,
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
      );
      const d = await r.json();
      if (d.ok) { setEditVehicle(null); loadVehicles(editVehicle.companyId); }
      else alert(d.error);
    } finally { setSavingEditVehicle(false); }
  }

  async function removeVehicle(companyId: string, vehicleId: string) {
    if (!confirm("Bu aracı firmadan kaldırmak istediğinize emin misiniz?")) return;
    setRemovingVehicle(vehicleId);
    try {
      const r = await fetch(`/api/companies/${companyId}/vehicles?vehicleId=${vehicleId}`, { method: "DELETE" });
      const d = await r.json();
      if (d.ok) { loadVehicles(companyId); loadCompanies(); }
      else alert(d.error);
    } finally { setRemovingVehicle(null); }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/companies/upload", { method: "POST", body: fd });
      const d = await r.json();
      if (d.ok) { setUploadResult(d.data); loadCompanies(); }
      else alert(d.error);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Firmalar</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{companies.length} firma kayıtlı</p>
          </div>
          <div className="flex gap-2">
            {/* Excel Upload */}
            <label className={`cursor-pointer bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm font-medium px-4 py-2 rounded-lg hover:bg-zinc-700 transition-colors ${uploading ? "opacity-50 cursor-not-allowed" : ""}`}>
              {uploading ? "Yükleniyor..." : "Excel Yükle"}
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
            <button onClick={() => setShowAddCompany(true)} className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors">
              + Firma Ekle
            </button>
          </div>
        </div>

        {/* Upload result */}
        {uploadResult && (
          <div className="mb-4 px-4 py-3 bg-emerald-950 border border-emerald-800 rounded-xl text-emerald-300 text-sm flex items-center justify-between">
            <span>✓ {uploadResult.inserted} araç eklendi, {uploadResult.skipped} atlandı</span>
            <button onClick={() => setUploadResult(null)} className="text-emerald-500 hover:text-white ml-4">×</button>
          </div>
        )}

        {/* Excel format hint */}
        <div className="mb-5 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl">
          <p className="text-zinc-500 text-xs">
            <span className="text-zinc-400 font-medium">Excel formatı:</span> A = Firma Adı, B = Plaka, C = Güzergah (güzergah adı, opsiyonel), D = Şöför (opsiyonel). İlk satır başlık (atlanır). Plaka boş ise satır eklenmez. Firma yoksa otomatik oluşturulur.
          </p>
        </div>

        {/* Companies list */}
        {loading ? (
          <div className="py-16 text-center text-zinc-600 text-sm">Yükleniyor...</div>
        ) : companies.length === 0 ? (
          <div className="py-16 text-center text-zinc-600 text-sm">Henüz firma eklenmedi</div>
        ) : (
          <div className="space-y-3">
            {companies.map(c => (
              <div key={c.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                {/* Company header */}
                <div
                  className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-zinc-800/50 transition-colors"
                  onClick={() => toggleExpand(c.id)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-white font-semibold">{c.name}</span>
                    <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">{c.vehicle_count} araç</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {(user?.role === "yonetici" || user?.role === "admin") && (
                      <button onClick={e => { e.stopPropagation(); setEditForm({ name: c.name, notes: c.notes || "" }); setEditCompany(c); }}
                        className="text-zinc-600 hover:text-white text-xs transition-colors">
                        Düzenle
                      </button>
                    )}
                    <span className="text-zinc-600 text-sm">{expanded === c.id ? "▲" : "▼"}</span>
                  </div>
                </div>

                {/* Expanded: vehicle list */}
                {expanded === c.id && (
                  <div className="border-t border-zinc-800 px-5 py-4">
                    {(vehicles[c.id] || []).length === 0 ? (
                      <p className="text-zinc-600 text-sm mb-3">Bu firmaya ait araç yok</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-4">
                        {(vehicles[c.id] || []).map((v: any) => (
                          <div key={v.id} className="flex items-center justify-between bg-zinc-800 rounded-lg px-3 py-2 gap-2">
                            <div className="min-w-0 flex-1">
                              <span className="text-white text-sm font-mono font-medium">{v.plate}</span>
                              {v.route_name && <div className="text-emerald-500 text-xs mt-0.5 truncate">{v.route_name}</div>}
                              {v.driver_name && <div className="text-zinc-500 text-xs mt-0.5 truncate">{v.driver_name}</div>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {(user?.role === "yonetici" || user?.role === "admin") && (
                                <button
                                  onClick={() => { setEditVehicle({ companyId: c.id, vehicle: v }); setEditVehicleForm({ plate: v.plate, driver_name: v.driver_name || "", route_id: v.route_id || "", notes: v.notes || "" }); }}
                                  className="text-zinc-500 hover:text-white text-xs transition-colors"
                                  title="Düzenle"
                                >Düzenle</button>
                              )}
                              <button
                                onClick={() => loadHistory(v)}
                                className="text-zinc-500 hover:text-blue-400 text-xs transition-colors"
                                title="Geçmiş"
                              >Geçmiş</button>
                              <button
                                onClick={() => removeVehicle(c.id, v.id)}
                                disabled={removingVehicle === v.id}
                                className="text-zinc-600 hover:text-red-400 text-xs transition-colors disabled:opacity-40"
                                title="Kaldır"
                              >{removingVehicle === v.id ? "..." : "✕"}</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add vehicle inline */}
                    {addVehicleFor === c.id ? (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <input
                            value={plateInput}
                            onChange={e => setPlateInput(e.target.value.toUpperCase())}
                            onKeyDown={e => { if (e.key === "Escape") setAddVehicleFor(null); }}
                            placeholder="Plaka (34 AB 1234)"
                            className="flex-1 bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 font-mono"
                            autoFocus
                          />
                        </div>
                        <input
                          value={driverNameInput}
                          onChange={e => setDriverNameInput(e.target.value)}
                          placeholder="Şöför adı (opsiyonel)"
                          className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500"
                        />
                        <select
                          value={routeIdInput}
                          onChange={e => setRouteIdInput(e.target.value)}
                          className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500"
                        >
                          <option value="">Güzergah seç (opsiyonel)</option>
                          {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                        <div className="flex gap-2">
                          <button onClick={() => saveVehicle(c.id)} disabled={savingVehicle || !plateInput.trim()}
                            className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                            {savingVehicle ? "Ekleniyor..." : "Ekle"}
                          </button>
                          <button onClick={() => { setAddVehicleFor(null); setPlateInput(""); setDriverNameInput(""); setRouteIdInput(""); }} className="text-zinc-500 hover:text-white px-3 py-2 rounded-lg border border-zinc-700 text-sm transition-colors">İptal</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAddVehicleFor(c.id); setPlateInput(""); setDriverNameInput(""); }}
                        className="text-xs text-zinc-500 hover:text-white border border-zinc-700 hover:border-zinc-500 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        + Araç Ekle
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Add Company Modal */}
      {showAddCompany && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Firma Ekle</h2>
              <button onClick={() => setShowAddCompany(false)} className="text-zinc-600 hover:text-white text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Firma Adı *</label>
                <input value={companyForm.name} onChange={e => setCompanyForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && saveCompany()}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500"
                  placeholder="ABC Taşımacılık" autoFocus />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Not</label>
                <input value={companyForm.notes} onChange={e => setCompanyForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAddCompany(false)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={saveCompany} disabled={savingCompany || !companyForm.name.trim()}
                className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                {savingCompany ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Vehicle History Modal */}
      {historyVehicle && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white font-mono">{historyVehicle.plate}</h2>
                {historyVehicle.driver_name && <p className="text-zinc-500 text-xs mt-0.5">{historyVehicle.driver_name}</p>}
              </div>
              <button onClick={() => { setHistoryVehicle(null); setHistoryData(null); }} className="text-zinc-600 hover:text-white text-xl">×</button>
            </div>

            {historyLoading ? (
              <p className="text-zinc-600 text-sm text-center py-8">Yükleniyor...</p>
            ) : historyData?.error ? (
              <p className="text-red-400 text-sm text-center py-8">{historyData.error}</p>
            ) : historyData ? (
              <div className="overflow-y-auto flex-1">
                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-zinc-800 rounded-xl p-3 text-center">
                    <p className="text-white font-bold text-lg">{historyData.stats?.total_arrivals || 0}</p>
                    <p className="text-zinc-500 text-xs mt-0.5">Toplam Giriş</p>
                  </div>
                  <div className="bg-zinc-800 rounded-xl p-3 text-center">
                    <p className="text-white font-bold text-lg">{historyData.stats?.last_30_days || 0}</p>
                    <p className="text-zinc-500 text-xs mt-0.5">Son 30 Gün</p>
                  </div>
                  <div className="bg-zinc-800 rounded-xl p-3 text-center">
                    <p className="text-white font-bold text-xs">{historyData.last_inspection?.inspection_date || "Hiç"}</p>
                    <p className="text-zinc-500 text-xs mt-0.5">Son Denetim</p>
                  </div>
                </div>

                {/* Last inspection detail */}
                {historyData.last_inspection && (
                  <div className="mb-4 px-3 py-2.5 bg-zinc-800 rounded-xl flex items-center gap-2">
                    <span className="text-xs text-zinc-400">Son denetim:</span>
                    <span className="text-xs text-white">{historyData.last_inspection.inspection_date}</span>
                    <span className={"text-xs font-medium px-1.5 py-0.5 rounded " + (historyData.last_inspection.result === "pass" ? "bg-emerald-900 text-emerald-300" : "bg-amber-900 text-amber-300")}>
                      {historyData.last_inspection.result === "pass" ? "Geçti" : historyData.last_inspection.result === "fail" ? "Başarısız" : historyData.last_inspection.result}
                    </span>
                    {historyData.last_inspection.inspector_name && <span className="text-zinc-600 text-xs">/ {historyData.last_inspection.inspector_name}</span>}
                  </div>
                )}

                {/* Arrival list */}
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Giriş Geçmişi (Son 20)</p>
                {historyData.arrivals.length === 0 ? (
                  <p className="text-zinc-600 text-sm py-4 text-center">Giriş kaydı yok</p>
                ) : (
                  <div className="space-y-1">
                    {historyData.arrivals.map((a: any) => (
                      <div key={a.id} className="flex items-center justify-between bg-zinc-800 rounded-lg px-3 py-2">
                        <span className="text-white text-sm">{a.arrival_date}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-zinc-400 text-xs tabular-nums">
                            {a.arrived_at ? new Date(a.arrived_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "—"}
                          </span>
                          {a.latitude !== 0 && (
                            <span className="text-zinc-600 text-xs" title={`${a.latitude}, ${a.longitude}`}>📍</span>
                          )}
                          {a.recorded_by_name && <span className="text-zinc-600 text-xs">{a.recorded_by_name}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Edit Vehicle Modal */}
      {editVehicle && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Araç Düzenle</h2>
              <button onClick={() => setEditVehicle(null)} className="text-zinc-600 hover:text-white text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Plaka *</label>
                <input
                  value={editVehicleForm.plate}
                  onChange={e => setEditVehicleForm(f => ({ ...f, plate: e.target.value.toUpperCase() }))}
                  onKeyDown={e => e.key === "Enter" && saveEditVehicle()}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 font-mono uppercase"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Şöför</label>
                <input
                  value={editVehicleForm.driver_name}
                  onChange={e => setEditVehicleForm(f => ({ ...f, driver_name: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && saveEditVehicle()}
                  placeholder="Opsiyonel"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Güzergah</label>
                <select
                  value={editVehicleForm.route_id}
                  onChange={e => setEditVehicleForm(f => ({ ...f, route_id: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500"
                >
                  <option value="">Seçilmedi</option>
                  {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Not</label>
                <input
                  value={editVehicleForm.notes}
                  onChange={e => setEditVehicleForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setEditVehicle(null)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={saveEditVehicle} disabled={savingEditVehicle || !editVehicleForm.plate.trim()}
                className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                {savingEditVehicle ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Company Modal */}
      {editCompany && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Firmayı Düzenle</h2>
              <button onClick={() => setEditCompany(null)} className="text-zinc-600 hover:text-white text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Firma Adı *</label>
                <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && saveEditCompany()}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500"
                  autoFocus />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Not</label>
                <input value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setEditCompany(null)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={saveEditCompany} disabled={savingEdit || !editForm.name.trim()}
                className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                {savingEdit ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
