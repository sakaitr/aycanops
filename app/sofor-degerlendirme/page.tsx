"use client";
import { useState, useEffect } from "react";
import Nav from "@/components/Nav";
import AppSelect from "@/components/AppSelect";

const CRITERIA = [
  { key: "score_punctuality", label: "Dakiklik", desc: "Planlı saate uyum" },
  { key: "score_driving", label: "Sürüş Davranışı", desc: "Güvenli ve kurallara uygun sürüş" },
  { key: "score_communication", label: "Yolcu İletişimi", desc: "Kibarlık ve sürücü davranışı" },
  { key: "score_cleanliness", label: "Araç Temizliği", desc: "İç ve dış temizlik" },
  { key: "score_route_compliance", label: "Güzergah Uyumu", desc: "Rota ve durakların takibi" },
  { key: "score_appearance", label: "Kıyafet & Görünüm", desc: "Kurumsal görünüm" },
] as const;

type CriteriaKey = typeof CRITERIA[number]["key"];

const EMPTY_FORM = {
  evaluation_date: new Date().toISOString().slice(0, 10),
  driver_name: "",
  plate: "",
  vehicle_info: "",
  route_text: "",
  company_id: "",
  score_punctuality: 3,
  score_driving: 3,
  score_communication: 3,
  score_cleanliness: 3,
  score_route_compliance: 3,
  score_appearance: 3,
  notes: "",
};

function avgScore(ev: any) {
  const total =
    ev.score_punctuality +
    ev.score_driving +
    ev.score_communication +
    ev.score_cleanliness +
    ev.score_route_compliance +
    ev.score_appearance;
  return total / 6;
}

function Stars({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  const display = hover || value;
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange && onChange(s)}
          onMouseEnter={() => onChange && setHover(s)}
          onMouseLeave={() => onChange && setHover(0)}
          className={`text-xl transition-colors ${
            onChange ? "cursor-pointer hover:scale-110" : "cursor-default"
          } ${s <= display ? "text-amber-400" : "text-zinc-700"}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function ScoreBadge({ value }: { value: number }) {
  const color =
    value >= 4.5 ? "text-emerald-400" : value >= 3.5 ? "text-amber-400" : value >= 2.5 ? "text-orange-400" : "text-red-400";
  return <span className={`font-bold tabular-nums ${color}`}>{value.toFixed(1)}</span>;
}

export default function SoforDegerlendirmePage() {
  const [user, setUser] = useState<any>(null);
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCompany, setFilterCompany] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "summary">("list");

  // Modal state
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => { if (d.ok) setUser(d.data); }).catch(() => {});
    fetch("/api/companies").then(r => r.json()).then(d => { if (d.ok) setCompanies(d.data); }).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [filterCompany]);

  async function load() {
    setLoading(true);
    try {
      const url = filterCompany
        ? `/api/driver-evaluations?company_id=${filterCompany}`
        : "/api/driver-evaluations";
      const r = await fetch(url);
      const d = await r.json();
      if (d.ok) setEvaluations(d.data);
    } finally {
      setLoading(false);
    }
  }

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
  }

  function openEdit(ev: any) {
    setEditing(ev);
    setForm({
      evaluation_date: ev.evaluation_date,
      driver_name: ev.driver_name,
      plate: ev.plate,
      vehicle_info: ev.vehicle_info || "",
      route_text: ev.route_text || "",
      company_id: ev.company_id || "",
      score_punctuality: ev.score_punctuality,
      score_driving: ev.score_driving,
      score_communication: ev.score_communication,
      score_cleanliness: ev.score_cleanliness,
      score_route_compliance: ev.score_route_compliance,
      score_appearance: ev.score_appearance,
      notes: ev.notes || "",
    });
    setShowForm(true);
  }

  async function saveForm() {
    if (!form.driver_name.trim() || !form.plate.trim() || !form.evaluation_date) return;
    setSaving(true);
    try {
      const body = {
        ...form,
        company_id: form.company_id || null,
      };
      const url = editing ? `/api/driver-evaluations/${editing.id}` : "/api/driver-evaluations";
      const method = editing ? "PUT" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.ok) {
        setShowForm(false);
        load();
      } else {
        alert(d.error);
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteEval(id: string) {
    if (!confirm("Bu değerlendirmeyi silmek istediğinize emin misiniz?")) return;
    setDeletingId(id);
    try {
      const r = await fetch(`/api/driver-evaluations/${id}`, { method: "DELETE" });
      const d = await r.json();
      if (d.ok) load();
      else alert(d.error);
    } finally {
      setDeletingId(null);
    }
  }

  // Group by driver for summary view
  const driverSummary = (() => {
    const map = new Map<string, { name: string; plate: string; company: string; count: number; totals: Record<string, number> }>();
    for (const ev of evaluations) {
      const key = ev.driver_name + "|" + ev.plate;
      if (!map.has(key)) {
        map.set(key, {
          name: ev.driver_name,
          plate: ev.plate,
          company: ev.company_name || "—",
          count: 0,
          totals: { score_punctuality: 0, score_driving: 0, score_communication: 0, score_cleanliness: 0, score_route_compliance: 0, score_appearance: 0 },
        });
      }
      const entry = map.get(key)!;
      entry.count++;
      for (const c of CRITERIA) entry.totals[c.key] += ev[c.key];
    }
    return Array.from(map.values()).map(e => ({
      ...e,
      avgs: Object.fromEntries(CRITERIA.map(c => [c.key, e.totals[c.key] / e.count])),
      overall: CRITERIA.reduce((sum, c) => sum + e.totals[c.key], 0) / (CRITERIA.length * e.count),
    })).sort((a, b) => b.overall - a.overall);
  })();

  const filteredByCompanyDrivers = filterCompany
    ? driverSummary.filter(d => evaluations.some(e => e.driver_name === d.name && e.plate === d.plate && e.company_id === filterCompany))
    : driverSummary;

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Şöför Değerlendirme</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{evaluations.length} değerlendirme kaydı</p>
          </div>
          <button
            onClick={openNew}
            className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors whitespace-nowrap"
          >
            + Yeni Değerlendirme
          </button>
        </div>

        {/* Filters & view toggle */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <AppSelect
            value={filterCompany}
            onChange={setFilterCompany}
            options={[
              { value: "", label: "Tüm Firmalar" },
              ...companies.map(c => ({ value: c.id, label: c.name })),
            ]}
            triggerClass="bg-zinc-800 border-zinc-700"
            className="min-w-[200px]"
          />

          <div className="flex bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden ml-auto">
            <button
              onClick={() => setViewMode("list")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${viewMode === "list" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"}`}
            >
              Liste
            </button>
            <button
              onClick={() => setViewMode("summary")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${viewMode === "summary" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"}`}
            >
              Özet
            </button>
            <button
              onClick={() => setViewMode("trend" as any)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${viewMode === ("trend" as any) ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"}`}
            >
              Trend
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-zinc-600 text-sm">Yükleniyor...</div>
        ) : evaluations.length === 0 ? (
          <div className="py-16 text-center text-zinc-600 text-sm">
            Henüz değerlendirme kaydı yok
          </div>
        ) : viewMode === "list" ? (
          /* LIST VIEW */
          <div className="space-y-3">
            {evaluations.map(ev => {
              const avg = avgScore(ev);
              return (
                <div key={ev.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: driver info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-white font-semibold">{ev.driver_name}</span>
                        <span className="text-xs font-mono bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">{ev.plate}</span>
                        {ev.vehicle_info && <span className="text-xs text-zinc-500">{ev.vehicle_info}</span>}
                        {ev.company_name && (
                          <span className="text-xs bg-blue-950 text-blue-300 border border-blue-800 px-2 py-0.5 rounded-full">{ev.company_name}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-zinc-500 mb-3">
                        <span>📅 {ev.evaluation_date}</span>
                        {ev.route_text && <span>🗺 {ev.route_text}</span>}
                        {ev.created_by_name && <span>👤 {ev.created_by_name}</span>}
                      </div>
                      {/* Criteria scores */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {CRITERIA.map(c => (
                          <div key={c.key} className="flex items-center justify-between bg-zinc-800/60 rounded-lg px-3 py-1.5">
                            <span className="text-xs text-zinc-400">{c.label}</span>
                            <Stars value={ev[c.key]} />
                          </div>
                        ))}
                      </div>
                      {ev.notes && (
                        <p className="text-xs text-zinc-500 mt-2 italic">"{ev.notes}"</p>
                      )}
                    </div>

                    {/* Right: avg + actions */}
                    <div className="flex flex-col items-end gap-3 shrink-0">
                      <div className="text-center">
                        <div className="text-2xl font-bold"><ScoreBadge value={avg} /></div>
                        <div className="text-xs text-zinc-600 mt-0.5">ort. puan</div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEdit(ev)}
                          className="text-xs text-zinc-500 hover:text-white border border-zinc-700 hover:border-zinc-500 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Düzenle
                        </button>
                        <button
                          onClick={() => deleteEval(ev.id)}
                          disabled={deletingId === ev.id}
                          className="text-xs text-zinc-600 hover:text-red-400 border border-zinc-700 hover:border-red-800 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                        >
                          {deletingId === ev.id ? "..." : "Sil"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (viewMode as any) === "trend" ? (
          /* TREND VIEW — monthly average scores */
          (() => {
            // Group by YYYY-MM
            const monthMap = new Map<string, { sum: number; count: number }>();
            for (const ev of evaluations) {
              const month = (ev.evaluation_date || "").slice(0, 7);
              if (!month) continue;
              const avg = avgScore(ev);
              const entry = monthMap.get(month) || { sum: 0, count: 0 };
              entry.sum += avg;
              entry.count++;
              monthMap.set(month, entry);
            }
            const months = Array.from(monthMap.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .slice(-12)
              .map(([month, v]) => ({ month, avg: v.sum / v.count }));

            if (months.length === 0) return (
              <div className="py-16 text-center text-zinc-600 text-sm">Trend için yeterli veri yok</div>
            );

            const maxVal = 5;
            const W = 600, H = 200, padL = 40, padB = 36, padT = 16, padR = 16;
            const chartW = W - padL - padR;
            const chartH = H - padT - padB;
            const barW = Math.min(40, chartW / months.length - 6);

            return (
              <div className="space-y-6">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 overflow-x-auto">
                  <h3 className="text-sm font-semibold text-zinc-400 mb-4">Aylık Ortalama Değerlendirme Puanı</h3>
                  <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 320, maxHeight: 220 }}>
                    {/* Y axis labels & grid */}
                    {[0,1,2,3,4,5].map(v => {
                      const y = padT + chartH - (v / maxVal) * chartH;
                      return (
                        <g key={v}>
                          <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="#27272a" strokeWidth="1" />
                          <text x={padL - 6} y={y + 4} textAnchor="end" fill="#52525b" fontSize="10">{v}</text>
                        </g>
                      );
                    })}
                    {/* Bars */}
                    {months.map(({ month, avg }, i) => {
                      const x = padL + (i + 0.5) * (chartW / months.length) - barW / 2;
                      const barH = (avg / maxVal) * chartH;
                      const y = padT + chartH - barH;
                      const color = avg >= 4.5 ? "#34d399" : avg >= 3.5 ? "#fbbf24" : avg >= 2.5 ? "#f97316" : "#f87171";
                      const label = month.slice(5); // MM
                      return (
                        <g key={month}>
                          <rect x={x} y={y} width={barW} height={barH} rx="4" fill={color} opacity="0.85" />
                          <text x={x + barW/2} y={y - 5} textAnchor="middle" fill={color} fontSize="9" fontWeight="bold">{avg.toFixed(1)}</text>
                          <text x={x + barW/2} y={H - padB + 14} textAnchor="middle" fill="#71717a" fontSize="9">{label}</text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
                {/* Criteria breakdown for last month */}
                {months.length > 0 && (() => {
                  const lastMonth = months[months.length - 1].month;
                  const lastMonthEvs = evaluations.filter(e => (e.evaluation_date || "").startsWith(lastMonth));
                  if (lastMonthEvs.length === 0) return null;
                  const criteriaAvgs = CRITERIA.map(c => ({
                    label: c.label,
                    avg: lastMonthEvs.reduce((s, e) => s + e[c.key], 0) / lastMonthEvs.length,
                  }));
                  return (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-zinc-400 mb-3">
                        Son Ay Kriter Dağılımı <span className="text-zinc-600 font-normal">({lastMonth})</span>
                      </h3>
                      <div className="space-y-2.5">
                        {criteriaAvgs.map(({ label, avg }) => (
                          <div key={label} className="flex items-center gap-3">
                            <span className="text-xs text-zinc-500 w-36 shrink-0">{label}</span>
                            <div className="flex-1 bg-zinc-800 rounded-full h-2">
                              <div
                                className="h-2 rounded-full transition-all"
                                style={{
                                  width: `${(avg / 5) * 100}%`,
                                  backgroundColor: avg >= 4 ? "#34d399" : avg >= 3 ? "#fbbf24" : "#f87171",
                                }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-zinc-300 w-8 text-right">{avg.toFixed(1)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()
        ) : (
          <div>
            {/* Criteria legend */}
            <div className="mb-4 flex flex-wrap gap-2">
              {CRITERIA.map((c, i) => (
                <span key={c.key} className="text-xs text-zinc-500 bg-zinc-800 border border-zinc-700 px-2 py-1 rounded">
                  <span className="text-zinc-300 font-medium">K{i + 1}</span> {c.label}
                </span>
              ))}
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-5 py-3">Şöför</th>
                    <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-3 py-3 hidden sm:table-cell">Plaka</th>
                    <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-3 py-3 hidden lg:table-cell">Firma</th>
                    {CRITERIA.map((c, i) => (
                      <th key={c.key} className="text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider px-2 py-3 hidden md:table-cell">K{i + 1}</th>
                    ))}
                    <th className="text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider px-3 py-3">Ort.</th>
                    <th className="text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider px-3 py-3 hidden sm:table-cell">Kayıt</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredByCompanyDrivers.map((d, i) => (
                    <tr key={d.name + d.plate} className={`border-b border-zinc-800/50 ${i % 2 === 0 ? "" : "bg-zinc-800/20"}`}>
                      <td className="px-5 py-3 text-white font-medium">{d.name}</td>
                      <td className="px-3 py-3 font-mono text-zinc-300 text-xs hidden sm:table-cell">{d.plate}</td>
                      <td className="px-3 py-3 text-zinc-400 text-xs hidden lg:table-cell">{d.company}</td>
                      {CRITERIA.map(c => (
                        <td key={c.key} className="px-2 py-3 text-center hidden md:table-cell">
                          <ScoreBadge value={d.avgs[c.key]} />
                        </td>
                      ))}
                      <td className="px-3 py-3 text-center">
                        <span className="text-lg font-bold"><ScoreBadge value={d.overall} /></span>
                      </td>
                      <td className="px-3 py-3 text-center text-zinc-500 text-xs hidden sm:table-cell">{d.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Modal: Add / Edit */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-start justify-center z-50 px-4 py-8 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-2xl my-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">
                {editing ? "Değerlendirmeyi Düzenle" : "Yeni Değerlendirme"}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-600 hover:text-white text-xl">×</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              {/* Zorunlu alanlar */}
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Tarih *</label>
                <input
                  type="date"
                  value={form.evaluation_date}
                  onChange={e => setForm(f => ({ ...f, evaluation_date: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Firma (Opsiyonel)</label>
                <AppSelect
                  value={form.company_id}
                  onChange={v => setForm(f => ({ ...f, company_id: v }))}
                  options={[
                    { value: "", label: "— Firma Seçin —" },
                    ...companies.map(c => ({ value: c.id, label: c.name })),
                  ]}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Şöför Adı Soyadı *</label>
                <input
                  value={form.driver_name}
                  onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))}
                  placeholder="Ahmet Yılmaz"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Plaka *</label>
                <input
                  value={form.plate}
                  onChange={e => setForm(f => ({ ...f, plate: e.target.value.toUpperCase() }))}
                  placeholder="34 AB 1234"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Araç Bilgisi</label>
                <input
                  value={form.vehicle_info}
                  onChange={e => setForm(f => ({ ...f, vehicle_info: e.target.value }))}
                  placeholder="Örn: Mercedes Sprinter Minibüs"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Güzergah</label>
                <input
                  value={form.route_text}
                  onChange={e => setForm(f => ({ ...f, route_text: e.target.value }))}
                  placeholder="Örn: Kadıköy – Levent"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500"
                />
              </div>
            </div>

            {/* Criteria scoring */}
            <div className="mb-5">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Değerlendirme Kriterleri</p>
              <div className="space-y-2">
                {CRITERIA.map(c => (
                  <div key={c.key} className="flex items-center justify-between bg-zinc-800 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-sm text-white font-medium">{c.label}</p>
                      <p className="text-xs text-zinc-500">{c.desc}</p>
                    </div>
                    <Stars
                      value={form[c.key as CriteriaKey] as number}
                      onChange={v => setForm(f => ({ ...f, [c.key]: v }))}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="mb-5">
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Genel Notlar</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="Varsa ek notlar..."
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors"
              >
                İptal
              </button>
              <button
                onClick={saveForm}
                disabled={saving || !form.driver_name.trim() || !form.plate.trim() || !form.evaluation_date}
                className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors"
              >
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
