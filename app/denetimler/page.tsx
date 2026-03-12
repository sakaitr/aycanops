"use client";
import { useState, useEffect, useMemo } from "react";
import Nav from "@/components/Nav";
import Badge from "@/components/Badge";

const TYPE_OPTS = [{ value: "routine", label: "Rutin" }, { value: "pre_trip", label: "Sefer Öncesi" }, { value: "complaint", label: "Şikayet" }, { value: "periodic", label: "Periyodik" }];
const TYPE_LABELS: Record<string, string> = { routine: "Rutin", pre_trip: "Sefer Öncesi", complaint: "Şikayet", periodic: "Periyodik" };
const DEFAULT_CHECKLIST = [
  { label: "Lastikler", ok: null as boolean | null, note: "" },
  { label: "Frenler", ok: null as boolean | null, note: "" },
  { label: "Lambalar", ok: null as boolean | null, note: "" },
  { label: "Cam silecekleri", ok: null as boolean | null, note: "" },
  { label: "Evrak / ruhsat", ok: null as boolean | null, note: "" },
  { label: "İlk yardım kiti", ok: null as boolean | null, note: "" },
  { label: "Yangın tüpü", ok: null as boolean | null, note: "" },
  { label: "Temizlik", ok: null as boolean | null, note: "" },
];

function computeResult(checklist: { ok: boolean | null }[]): "pending" | "pass" | "fail" {
  if (!checklist.length) return "pending";
  const allEvaluated = checklist.every(c => c.ok !== null);
  if (!allEvaluated) return "pending";
  return checklist.every(c => c.ok === true) ? "pass" : "fail";
}

const RESULT_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: "Bekliyor", cls: "bg-zinc-800 text-zinc-400" },
  pass: { label: "Geçti ✓", cls: "bg-emerald-950 text-emerald-400 border border-emerald-800" },
  fail: { label: "Başarısız ✗", cls: "bg-red-950 text-red-400 border border-red-800" },
  conditional: { label: "Koşullu ⚠", cls: "bg-yellow-950 text-yellow-400 border border-yellow-800" },
};

export default function DenetimlerPage() {
  const [user, setUser] = useState<any>(null);
  useEffect(() => { fetch("/api/auth/me").then(r => r.json()).then(d => { if (d.ok) setUser(d.data); }).catch(() => {}); }, []);

  const [inspections, setInspections] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);           // standalone vehicles
  const [compVehicles, setCompVehicles] = useState<any[]>([]);   // company_vehicles
  const [loading, setLoading] = useState(true);
  const [filterVehicleId, setFilterVehicleId] = useState("");
  const [filterCompanyId, setFilterCompanyId] = useState("");
  const [showForm, setShowForm] = useState(false);
  // Step 1: selected company in form ("other" = standalone vehicles)
  const [formCompanyId, setFormCompanyId] = useState<string>("");
  const [form, setForm] = useState({
    vehicle_id: "", company_vehicle_id: "",
    inspection_date: new Date().toISOString().split("T")[0],
    type: "routine", notes: "",
    checklist: DEFAULT_CHECKLIST.map(c => ({ ...c })),
  });
  const [resultOverride, setResultOverride] = useState<"conditional" | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { load(); }, [filterVehicleId, filterCompanyId]);
  useEffect(() => {
    fetch("/api/vehicles").then(r => r.json()).then(d => { if (d.ok) setVehicles(d.data); });
    fetch("/api/companies/all-vehicles").then(r => r.json()).then(d => { if (d.ok) setCompVehicles(d.data); });
  }, []);

  // Group company vehicles by company for filter dropdown
  const uniqueCompanies = useMemo(() => {
    const seen = new Set<string>();
    return compVehicles.filter(cv => { if (seen.has(cv.company_id)) return false; seen.add(cv.company_id); return true; });
  }, [compVehicles]);

  const autoResult = useMemo(() => computeResult(form.checklist), [form.checklist]);
  const finalResult: string = autoResult === "fail" && resultOverride === "conditional" ? "conditional" : autoResult;

  const hasVehicleSelected = form.vehicle_id || form.company_vehicle_id;

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterVehicleId) params.set("vehicle_id", filterVehicleId);
      if (filterCompanyId) params.set("company_id", filterCompanyId);
      const r = await fetch(`/api/inspections?${params.toString()}`);
      const d = await r.json();
      if (d.ok) setInspections(d.data);
    } finally { setLoading(false); }
  }

  function resetForm() {
    setFormCompanyId("");
    setForm({ vehicle_id: "", company_vehicle_id: "", inspection_date: new Date().toISOString().split("T")[0], type: "routine", notes: "", checklist: DEFAULT_CHECKLIST.map(c => ({ ...c })) });
    setResultOverride(null);
    setSaveError(null);
  }

  function setCheckItem(idx: number, field: "ok" | "note", value: any) {
    setForm(f => ({ ...f, checklist: f.checklist.map((c, i) => i === idx ? { ...c, [field]: value } : c) }));
    if (field === "ok") setResultOverride(null); // reset override when checklist changes
  }

  async function save() {
    if (!hasVehicleSelected) return;
    setSaving(true);
    try {
      const payload: any = {
        inspection_date: form.inspection_date,
        type: form.type,
        notes: form.notes,
        checklist: form.checklist,
        result: finalResult,
      };
      if (form.company_vehicle_id) payload.company_vehicle_id = form.company_vehicle_id;
      else payload.vehicle_id = form.vehicle_id;

      const res = await fetch("/api/inspections", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (d.ok) { setShowForm(false); load(); }
      else setSaveError(d.error || "Kaydetme başarısız");
    } finally { setSaving(false); }
  }

  const rb = RESULT_BADGE[finalResult] ?? RESULT_BADGE.pending;

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Araç Denetimleri</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{inspections.length} kayıt</p>
          </div>
          <button onClick={() => { resetForm(); setShowForm(true); }}
            className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors">+ Denetim Ekle</button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-5">
          <select value={filterVehicleId} onChange={e => { setFilterVehicleId(e.target.value); setFilterCompanyId(""); }}
            className="bg-zinc-900 border border-zinc-800 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-600">
            <option value="">Tüm Araçlar</option>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate}{v.driver_name ? ` · ${v.driver_name}` : ""}</option>)}
          </select>
          <select value={filterCompanyId} onChange={e => { setFilterCompanyId(e.target.value); setFilterVehicleId(""); }}
            className="bg-zinc-900 border border-zinc-800 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-600">
            <option value="">Tüm Firmalar</option>
            {uniqueCompanies.map(cv => <option key={cv.company_id} value={cv.company_id}>{cv.company_name}</option>)}
          </select>
          {(filterVehicleId || filterCompanyId) && (
            <button onClick={() => { setFilterVehicleId(""); setFilterCompanyId(""); }} className="text-xs text-zinc-500 underline hover:text-white">Filtreyi temizle</button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-zinc-600 text-sm">Yükleniyor...</div>
        ) : inspections.length === 0 ? (
          <div className="py-24 text-center text-zinc-600 text-sm">Denetim kaydı bulunamadı</div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            {inspections.map((ins, i) => {
              const checklist = ins.checklist_json ? JSON.parse(ins.checklist_json) : [];
              const isExpanded = expanded === ins.id;
              const passCount = checklist.filter((c: any) => c.ok === true).length;
              const plateDisplay = ins.company_vehicle_plate || ins.vehicle_plate || "—";
              return (
                <div key={ins.id} className={`${i < inspections.length - 1 ? "border-b border-zinc-800/50" : ""}`}>
                  <div className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-zinc-800/30" onClick={() => setExpanded(isExpanded ? null : ins.id)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-white font-semibold text-sm font-mono">{plateDisplay}</span>
                        {ins.company_name && <span className="bg-zinc-800 text-zinc-400 text-xs px-2 py-0.5 rounded-full">{ins.company_name}</span>}
                        {!ins.company_name && ins.brand && <span className="text-zinc-500 text-xs">{ins.brand} {ins.model}</span>}
                        <Badge status={ins.result} showLabel />
                        <span className="text-zinc-600 text-xs">{TYPE_LABELS[ins.type] || ins.type}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-zinc-500">
                        <span>{new Date(ins.inspection_date + "T00:00:00").toLocaleDateString("tr-TR")}</span>
                        <span>Denetçi: {ins.inspector_name}</span>
                        {checklist.length > 0 && (
                          <span className={passCount === checklist.length ? "text-emerald-500" : passCount < checklist.length ? "text-red-400" : ""}>
                            {passCount}/{checklist.length} geçti
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-zinc-600 text-xs">{isExpanded ? "▲" : "▼"}</span>
                  </div>
                  {isExpanded && (
                    <div className="px-5 pb-4 border-t border-zinc-800/40">
                      {checklist.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                          {checklist.map((c: any, idx: number) => (
                            <div key={idx} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${c.ok === true ? "bg-emerald-950/50 text-emerald-300" : c.ok === false ? "bg-red-950/50 text-red-300" : "bg-zinc-800/50 text-zinc-400"}`}>
                              <span className="text-base">{c.ok === true ? "✓" : c.ok === false ? "✗" : "—"}</span>
                              <span>{c.label}</span>
                              {c.note && <span className="text-xs opacity-60 ml-auto truncate max-w-24">{c.note}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      {ins.notes && <p className="text-zinc-500 text-xs mt-3 italic">{ins.notes}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-start justify-center z-50 px-4 overflow-y-auto py-8">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-lg my-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Denetim Ekle</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-600 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="space-y-3">

              {/* Step 1: Company selector */}
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Firma *</label>
                <select
                  value={formCompanyId}
                  onChange={e => {
                    setFormCompanyId(e.target.value);
                    setForm(f => ({ ...f, vehicle_id: "", company_vehicle_id: "" }));
                  }}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                  <option value="">— Firma seçin —</option>
                  {uniqueCompanies.map(cv => (
                    <option key={cv.company_id} value={cv.company_id}>{cv.company_name}</option>
                  ))}
                  {vehicles.length > 0 && <option value="__other__">Diğer Araçlar (Filo)</option>}
                </select>
              </div>

              {/* Step 2: Vehicle selector (shown after company selected) */}
              {formCompanyId && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Araç *</label>
                  <select
                    value={form.company_vehicle_id || form.vehicle_id}
                    onChange={e => {
                      const val = e.target.value;
                      if (formCompanyId === "__other__") {
                        setForm(f => ({ ...f, vehicle_id: val, company_vehicle_id: "" }));
                      } else {
                        setForm(f => ({ ...f, company_vehicle_id: val, vehicle_id: "" }));
                      }
                    }}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                    <option value="">— Araç seçin —</option>
                    {formCompanyId === "__other__"
                      ? vehicles.map(v => (
                          <option key={v.id} value={v.id}>
                            {v.plate}{v.driver_name ? ` · ${v.driver_name}` : ""}
                          </option>
                        ))
                      : compVehicles
                          .filter(cv => cv.company_id === formCompanyId)
                          .map(cv => (
                            <option key={cv.id} value={cv.id}>
                              {cv.plate}{cv.driver_name ? ` · ${cv.driver_name}` : ""}
                            </option>
                          ))
                    }
                  </select>
                </div>
              )}
              {/* Date & type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Tarih</label>
                  <input type="date" value={form.inspection_date} onChange={e => setForm(f => ({ ...f, inspection_date: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Denetim Tipi</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                    {TYPE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Live result badge */}
              <div className="flex items-center gap-3 pt-1">
                <span className="text-xs text-zinc-500">Sonuç:</span>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${rb.cls}`}>{rb.label}</span>
                {autoResult === "fail" && resultOverride !== "conditional" && (
                  <button onClick={() => setResultOverride("conditional")}
                    className="text-xs text-yellow-500 underline hover:text-yellow-300">Koşullu onayla</button>
                )}
                {resultOverride === "conditional" && (
                  <button onClick={() => setResultOverride(null)} className="text-xs text-zinc-500 underline hover:text-white">Geri al</button>
                )}
              </div>

              {/* Checklist */}
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider pt-1">Kontrol Listesi</p>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {form.checklist.map((c, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-zinc-400 text-xs w-36 flex-shrink-0">{c.label}</span>
                    <button onClick={() => setCheckItem(idx, "ok", c.ok === true ? null : true)}
                      className={`text-xs px-2 py-1 rounded transition-colors ${c.ok === true ? "bg-emerald-700 text-white" : "bg-zinc-800 text-zinc-500 hover:bg-emerald-900 hover:text-emerald-300"}`}>✓</button>
                    <button onClick={() => setCheckItem(idx, "ok", c.ok === false ? null : false)}
                      className={`text-xs px-2 py-1 rounded transition-colors ${c.ok === false ? "bg-red-700 text-white" : "bg-zinc-800 text-zinc-500 hover:bg-red-900 hover:text-red-300"}`}>✗</button>
                    <input value={c.note} onChange={e => setCheckItem(idx, "note", e.target.value)} placeholder="Not..."
                      className="flex-1 bg-zinc-800 border border-zinc-700/50 text-white text-xs px-2 py-1 rounded focus:outline-none focus:border-zinc-600" />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Genel Not</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </div>
            </div>
            {saveError && <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-3 py-2 mt-3">{saveError}</p>}
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving || !hasVehicleSelected}
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
