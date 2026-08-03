"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { hasPermission } from "@/lib/permissions";

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: "kaza",      label: "Trafik Kazası",       icon: "💥" },
  { value: "sikayet",   label: "Yolcu Şikayeti",      icon: "😠" },
  { value: "gecikme",   label: "Sefere Gecikme",       icon: "⏰" },
  { value: "ihlal",     label: "Trafik İhlali",        icon: "🚫" },
  { value: "davranis",  label: "Uygunsuz Davranış",    icon: "⚠️" },
  { value: "hasar",     label: "Araç Hasarı",          icon: "🔧" },
  { value: "diger",     label: "Diğer",                icon: "📝" },
];
const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.value, c]));

const SEVERITIES = [
  { value: 1, label: "Küçük",   deduction: 5,  cls: "bg-zinc-800 text-zinc-300 border-zinc-700" },
  { value: 2, label: "Orta",    deduction: 15, cls: "bg-amber-950 text-amber-300 border-amber-800" },
  { value: 3, label: "Büyük",   deduction: 25, cls: "bg-orange-950 text-orange-300 border-orange-800" },
  { value: 4, label: "Kritik",  deduction: 40, cls: "bg-red-950 text-red-300 border-red-800" },
];
const SEV_MAP = Object.fromEntries(SEVERITIES.map(s => [s.value, s]));

function scoreColor(score: number) {
  if (score >= 85) return { text: "text-emerald-400", badge: "bg-emerald-950 text-emerald-300 border-emerald-800", label: "İyi" };
  if (score >= 70) return { text: "text-yellow-400",  badge: "bg-yellow-950 text-yellow-300 border-yellow-800",   label: "Dikkat" };
  if (score >= 50) return { text: "text-orange-400",  badge: "bg-orange-950 text-orange-300 border-orange-800",   label: "Sorunlu" };
  return           { text: "text-red-400",    badge: "bg-red-950 text-red-300 border-red-800",         label: "Kritik" };
}

function calcScore(deduction: number) {
  return Math.max(0, 100 - deduction);
}

const EMPTY_FORM = {
  driver_name: "", vehicle_id: "", incident_date: new Date().toISOString().split("T")[0],
  category: "diger", severity: 2, description: "", action_taken: "",
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SurucuSicilPage() {
  const router = useRouter();
  const [user, setUser]           = useState<any>(null);
  const [tab, setTab]             = useState<"puanlar" | "kayitlar" | "sikayetler">("puanlar");
  const [summary, setSummary]     = useState<any[]>([]);
  const [records, setRecords]     = useState<any[]>([]);
  const [vehicles, setVehicles]   = useState<any[]>([]);
  const [drivers, setDrivers]     = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState({ ...EMPTY_FORM });
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Complaints (şikayetler) tab
  const [complaints, setComplaints]         = useState<any[]>([]);
  const [complaintsLoading, setComplaintsLoading] = useState(false);
  const [evaluatingId, setEvaluatingId]     = useState<string | null>(null);
  const [evalSeverity, setEvalSeverity]     = useState<number>(2);
  const [evalNote, setEvalNote]             = useState("");
  const [evalSaving, setEvalSaving]         = useState(false);
  const canEvaluate = hasPermission(user, "driver_complaints:evaluate");

  // Filters (records tab)
  const [filterDriver, setFilterDriver]   = useState("");
  const [filterCat, setFilterCat]         = useState("");

  // Drill-down: click driver name on scores tab to open records for that driver
  const [drillDriver, setDrillDriver] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => { if (d.ok) setUser(d.data); else router.replace("/login"); }).catch(() => { router.replace("/login"); });
    fetch("/api/vehicles").then(r => r.json()).then(d => { if (d.ok) setVehicles(d.data); });
    fetch("/api/suruculer?limit=9999").then(r => r.json()).then(d => { if (d.ok) setDrivers(d.data); });
  }, []);

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    if (tab === "sikayetler" && canEvaluate) loadComplaints();
  }, [tab, canEvaluate]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadComplaints() {
    setComplaintsLoading(true);
    try {
      const r = await fetch("/api/musteri-destek?kategori=surucu_sikayeti");
      const d = await r.json();
      if (d.ok) setComplaints(d.data);
    } finally { setComplaintsLoading(false); }
  }

  function startEvaluate(id: string) {
    setEvaluatingId(id);
    setEvalSeverity(2);
    setEvalNote("");
  }

  async function submitEvaluate(id: string, decision: "kabul" | "reddet") {
    if (decision === "reddet" && !evalNote.trim()) return;
    setEvalSaving(true);
    try {
      const res = await fetch(`/api/musteri-destek/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "evaluate", decision, severity: evalSeverity, eval_note: evalNote }),
      });
      const d = await res.json();
      if (d.ok) {
        setEvaluatingId(null);
        loadComplaints();
        loadAll();
      } else {
        alert(d.error || "İşlem başarısız");
      }
    } finally { setEvalSaving(false); }
  }

  async function loadAll() {
    setLoading(true);
    try {
      const [sumRes, recRes] = await Promise.all([
        fetch("/api/driver-records?summary=1").then(r => r.json()),
        fetch("/api/driver-records").then(r => r.json()),
      ]);
      if (sumRes.ok) setSummary(sumRes.data);
      if (recRes.ok) setRecords(recRes.data);
    } finally { setLoading(false); }
  }

  // Unique driver names for filter dropdown
  const driverNames = useMemo(() => Array.from(new Set(records.map((r: any) => r.driver_name))).sort((a, b) => (a as string).localeCompare(b as string, "tr")), [records]);

  const filteredRecords = useMemo(() => {
    let list = records;
    const d = drillDriver || filterDriver;
    if (d) list = list.filter((r: any) => r.driver_name === d);
    if (filterCat) list = list.filter((r: any) => r.category === filterCat);
    return list;
  }, [records, filterDriver, filterCat, drillDriver]);

  function openForm(driverName?: string) {
    setForm({ ...EMPTY_FORM, driver_name: driverName || "" });
    setSaveError(null);
    setShowForm(true);
  }

  async function save() {
    if (!form.driver_name.trim() || !form.description.trim()) return;
    setSaving(true);
    try {
      // Resolve vehicle plate from selected vehicle_id
      const veh = vehicles.find((v: any) => v.id === form.vehicle_id);
      const payload = {
        ...form,
        driver_name: form.driver_name.trim(),
        vehicle_id: form.vehicle_id || null,
        vehicle_plate: veh?.plate || null,
        severity: Number(form.severity),
      };
      const res = await fetch("/api/driver-records", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (d.ok) { setShowForm(false); loadAll(); }
      else setSaveError(d.error || "Kaydetme başarısız");
    } finally { setSaving(false); }
  }

  async function deleteRecord(id: string) {
    if (!confirm("Bu sicil kaydı silinsin mi?")) return;
    await fetch(`/api/driver-records/${id}`, { method: "DELETE" });
    loadAll();
  }

  const canWrite  = hasPermission(user, "driver_records:create");
  const canDelete = hasPermission(user, "driver_records:delete");

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Sürücü Sicil</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{summary.length} sürücü · {records.length} kayıt</p>
          </div>
          {canWrite && (
            <button onClick={() => openForm()}
              className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors">
              + Sicil Kaydı Ekle
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-zinc-900 p-1 rounded-lg w-fit border border-zinc-800">
          {([["puanlar", "Şöför Puanları"], ["kayitlar", "Sicil Kayıtları"], ...(canEvaluate ? [["sikayetler", "Şikayetler"]] as const : [])] as const).map(([key, label]) => (
            <button key={key} onClick={() => { setTab(key); setDrillDriver(null); }}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === key ? "bg-white text-zinc-950" : "text-zinc-400 hover:text-white"}`}>
              {label}
              {key === "sikayetler" && complaints.filter((c: any) => c.eval_durum === "bekliyor").length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                  {complaints.filter((c: any) => c.eval_durum === "bekliyor").length}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-zinc-600 text-sm">Yükleniyor...</div>
        ) : tab === "puanlar" ? (
          // ════════════════ SCORES TAB ════════════════
          summary.length === 0 ? (
            <div className="py-24 text-center text-zinc-600 text-sm">Henüz sicil kaydı yok</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {summary.map((row: any) => {
                const score = calcScore(row.total_deduction);
                const sc = scoreColor(score);
                const plates = row.plates ? row.plates.split(",").filter(Boolean) : [];
                return (
                  <div key={row.driver_name}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-3 hover:border-zinc-700 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-white font-semibold text-base">{row.driver_name}</p>
                        {plates.length > 0 && (
                          <p className="text-zinc-500 text-xs mt-0.5 font-mono">{plates.slice(0, 3).join(" · ")}{plates.length > 3 ? " ..." : ""}</p>
                        )}
                      </div>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${sc.badge}`}>{sc.label}</span>
                    </div>

                    {/* Score arc */}
                    <div className="flex items-end gap-3">
                      <span className={`text-5xl font-black tabular-nums ${sc.text}`}>{score}</span>
                      <span className="text-zinc-600 text-lg mb-1">/100</span>
                    </div>

                    {/* Severity breakdown */}
                    <div className="flex gap-2 flex-wrap">
                      {[4, 3, 2, 1].map(s => {
                        const count = row[`s${s}`] || 0;
                        if (count === 0) return null;
                        const sev = SEV_MAP[s];
                        return (
                          <span key={s} className={`text-xs px-2 py-0.5 rounded border font-medium ${sev.cls}`}>
                            {sev.label}: {count}
                          </span>
                        );
                      })}
                      {row.s1 === 0 && row.s2 === 0 && row.s3 === 0 && row.s4 === 0 && (
                        <span className="text-xs text-zinc-600">Kayıt yok</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs text-zinc-600 pt-1 border-t border-zinc-800/50 mt-1">
                      <span>{row.total_incidents} toplam olay</span>
                      {row.last_incident && <span>{new Date(row.last_incident + "T00:00:00").toLocaleDateString("tr-TR")}</span>}
                    </div>

                    <div className="flex gap-2 mt-1">
                      <button onClick={() => { setDrillDriver(row.driver_name); setTab("kayitlar"); }}
                        className="flex-1 text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 py-1.5 rounded-lg transition-colors">
                        Kayıtları Gör
                      </button>
                      {canWrite && (
                        <button onClick={() => openForm(row.driver_name)}
                          className="flex-1 text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 py-1.5 rounded-lg transition-colors">
                          + Kayıt Ekle
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : tab === "kayitlar" ? (
          // ════════════════ RECORDS TAB ════════════════
          <div>
            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-5 items-center">
              {drillDriver && (
                <div className="flex items-center gap-2 bg-zinc-800 text-white text-sm px-3 py-2 rounded-lg border border-zinc-700">
                  <span className="text-zinc-400">Sürücü:</span> <strong>{drillDriver}</strong>
                  <button onClick={() => setDrillDriver(null)} className="text-zinc-500 hover:text-white ml-1">✕</button>
                </div>
              )}
              {!drillDriver && (
                <select value={filterDriver} onChange={e => setFilterDriver(e.target.value)}
                  className="max-w-[180px] min-w-0 bg-zinc-900 border border-zinc-800 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-600">
                  <option value="">Tüm Sürücüler</option>
                  {driverNames.map(n => <option key={n as string} value={n as string}>{n as string}</option>)}
                </select>
              )}
              <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
                className="max-w-[180px] min-w-0 bg-zinc-900 border border-zinc-800 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-600">
                <option value="">Tüm Kategoriler</option>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
              </select>
              {(filterDriver || filterCat || drillDriver) && (
                <button onClick={() => { setFilterDriver(""); setFilterCat(""); setDrillDriver(null); }}
                  className="text-xs text-zinc-500 underline hover:text-white">Temizle</button>
              )}
              <span className="text-zinc-600 text-xs ml-auto">{filteredRecords.length} kayıt</span>
            </div>

            {filteredRecords.length === 0 ? (
              <div className="py-24 text-center text-zinc-600 text-sm">Kayıt bulunamadı</div>
            ) : (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                {filteredRecords.map((rec: any, i: number) => {
                  const cat = CAT_MAP[rec.category] || { icon: "📝", label: rec.category };
                  const sev = SEV_MAP[rec.severity] || SEV_MAP[1];
                  return (
                    <div key={rec.id}
                      className={`px-5 py-4 flex items-start gap-4 ${i < filteredRecords.length - 1 ? "border-b border-zinc-800/50" : ""} hover:bg-zinc-800/20 transition-colors`}>
                      <div className="flex-shrink-0 w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-base mt-0.5">
                        {cat.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-white font-semibold text-sm">{rec.driver_name}</span>
                          {rec.vehicle_plate && (
                            <span className="text-zinc-500 text-xs font-mono bg-zinc-800 px-1.5 py-0.5 rounded">{rec.vehicle_plate}</span>
                          )}
                          <span className={`text-xs px-2 py-0.5 rounded border font-medium ${sev.cls}`}>-{sev.deduction}pt · {sev.label}</span>
                          <span className="text-zinc-500 text-xs">{cat.icon} {cat.label}</span>
                        </div>
                        <p className="text-zinc-300 text-sm leading-relaxed">{rec.description}</p>
                        {rec.action_taken && (
                          <p className="text-zinc-500 text-xs mt-1">↪ {rec.action_taken}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-600">
                          <span>{new Date(rec.incident_date + "T00:00:00").toLocaleDateString("tr-TR")}</span>
                          {rec.reporter_name && <span>Kaydeden: {rec.reporter_name}</span>}
                        </div>
                      </div>
                      {canDelete && (
                        <button onClick={() => deleteRecord(rec.id)}
                          className="text-zinc-700 hover:text-red-400 transition-colors flex-shrink-0 text-lg leading-none mt-0.5">×</button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          // ════════════════ COMPLAINTS TAB ════════════════
          <div>
            {complaintsLoading ? (
              <div className="py-24 text-center text-zinc-600 text-sm">Yükleniyor...</div>
            ) : complaints.length === 0 ? (
              <div className="py-24 text-center text-zinc-600 text-sm">Bekleyen şikayet yok</div>
            ) : (
              <div className="space-y-3">
                {complaints.map((c: any) => (
                  <div key={c.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <p className="text-white font-semibold text-sm">{c.driver_name}</p>
                        <p className="text-zinc-500 text-xs mt-0.5">{c.company_name} · {c.olusturan}</p>
                      </div>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                        c.eval_durum === "bekliyor" ? "bg-amber-950 text-amber-300 border-amber-800"
                        : c.eval_durum === "sicile_islendi" ? "bg-red-950 text-red-300 border-red-800"
                        : "bg-zinc-800 text-zinc-400 border-zinc-700"
                      }`}>
                        {c.eval_durum === "bekliyor" ? "Bekliyor" : c.eval_durum === "sicile_islendi" ? "Sicile İşlendi" : "Reddedildi"}
                      </span>
                    </div>
                    {c.vehicle_plate && <p className="text-zinc-500 text-xs font-mono mb-1">{c.vehicle_plate}</p>}
                    <p className="text-zinc-300 text-sm leading-relaxed mb-2">{c.icerik}</p>
                    <p className="text-zinc-600 text-xs">
                      {c.incident_date ? new Date(c.incident_date + "T00:00:00").toLocaleDateString("tr-TR") : new Date(c.created_at).toLocaleDateString("tr-TR")}
                    </p>

                    {c.eval_durum === "bekliyor" && evaluatingId !== c.id && (
                      <button onClick={() => startEvaluate(c.id)}
                        className="mt-3 bg-white text-zinc-950 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-zinc-200 transition-colors">
                        Değerlendir
                      </button>
                    )}

                    {evaluatingId === c.id && (
                      <div className="mt-4 pt-4 border-t border-zinc-800 space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Kabul edilirse ciddiyet</label>
                          <div className="flex gap-2">
                            {SEVERITIES.map(s => (
                              <button key={s.value} onClick={() => setEvalSeverity(s.value)}
                                className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                                  evalSeverity === s.value ? s.cls : "bg-zinc-800 text-zinc-500 border-zinc-700 hover:bg-zinc-700"
                                }`}>
                                {s.label}<br /><span className="font-normal opacity-70">-{s.deduction}pt</span>
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Not / Gerekçe {"(Reddet için zorunlu)"}</label>
                          <textarea value={evalNote} onChange={e => setEvalNote(e.target.value)} rows={2}
                            placeholder="Kabul için opsiyonel not, reddet için gerekçe yazın..."
                            className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setEvaluatingId(null)}
                            className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
                          <button onClick={() => submitEvaluate(c.id, "reddet")} disabled={evalSaving || !evalNote.trim()}
                            className="flex-1 bg-red-950 text-red-300 text-sm font-semibold py-2 rounded-lg hover:bg-red-900 disabled:opacity-50 transition-colors">Reddet</button>
                          <button onClick={() => submitEvaluate(c.id, "kabul")} disabled={evalSaving}
                            className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors">Kabul Et → Sicile İşle</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ─── Add Record Modal ─── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-start justify-center z-50 px-4 overflow-y-auto py-8">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-lg my-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Sicil Kaydı Ekle</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-600 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="space-y-4">

              {/* Driver name — yazılabilir + öneri listesi, yoksa otomatik oluşturulur */}
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Sürücü *</label>
                <input
                  type="text"
                  list="sicil-driver-names"
                  value={form.driver_name}
                  onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))}
                  placeholder="Sürücü adını yazın veya listeden seçin"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                <datalist id="sicil-driver-names">
                  {drivers.map((d: any) => <option key={d.id} value={d.name} />)}
                </datalist>
                <p className="text-zinc-600 text-xs mt-1">Listede yoksa yazdığınız isimle yeni sürücü otomatik oluşturulur.</p>
              </div>

              {/* Vehicle (optional) */}
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Araç (opsiyonel)</label>
                <select value={form.vehicle_id} onChange={e => {
                  const vid = e.target.value;
                  const v = vehicles.find((v: any) => v.id === vid);
                  setForm(f => ({
                    ...f,
                    vehicle_id: vid,
                    driver_name: vid && v?.driver_name ? v.driver_name : f.driver_name,
                  }));
                }}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                  <option value="">— Araç seç —</option>
                  {vehicles.map((v: any) => (
                    <option key={v.id} value={v.id}>{v.plate}{v.driver_name ? ` · ${v.driver_name}` : ""}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Date */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Tarih *</label>
                  <input type="date" value={form.incident_date} onChange={e => setForm(f => ({ ...f, incident_date: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                </div>
                {/* Category */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Kategori</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Severity */}
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Ciddiyet</label>
                <div className="flex gap-2">
                  {SEVERITIES.map(s => (
                    <button key={s.value} onClick={() => setForm(f => ({ ...f, severity: s.value }))}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                        form.severity === s.value ? s.cls : "bg-zinc-800 text-zinc-500 border-zinc-700 hover:bg-zinc-700"
                      }`}>
                      {s.label}<br />
                      <span className="font-normal opacity-70">-{s.deduction}pt</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Açıklama *</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3} placeholder="Olay detayını yazın..."
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </div>

              {/* Action taken */}
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Alınan Tedbir</label>
                <input value={form.action_taken} onChange={e => setForm(f => ({ ...f, action_taken: e.target.value }))}
                  placeholder="Uyarı verildi, tutanak tutuldu..."
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
              </div>
            </div>

            {saveError && <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-3 py-2 mt-3">{saveError}</p>}
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowForm(false)}
                className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving || !form.driver_name.trim() || !form.description.trim()}
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
