"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";

const EMPTY_FORM = { plate: "", driver_name: "", reason: "", deadline: "" };

function fmtDate(s: string) {
  if (!s) return "—";
  const d = new Date(s + "T00:00:00");
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function deadlineStatus(deadline: string | null, is_done: number) {
  if (is_done) return null;
  if (!deadline) return null;
  const today = new Date().toISOString().split("T")[0];
  if (deadline < today) return "overdue";
  const diff = (new Date(deadline).getTime() - Date.now()) / 86400000;
  if (diff <= 3) return "soon";
  return null;
}

export default function UyarilarPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  const [warnings, setWarnings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDone, setFilterDone] = useState("0"); // "0"=açık, "1"=tamam, ""=hepsi
  const [filterPlate, setFilterPlate] = useState("");
  const [filterDriver, setFilterDriver] = useState("");

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Duplicate alert popup
  const [dupAlert, setDupAlert] = useState<{ plate: number; driver: number; warningNo: string } | null>(null);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Toggle done
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (!d.ok || d.data?.role !== "admin") { router.replace("/"); return; }
      setUser(d.data);
    }).catch(() => router.replace("/"));
  }, [router]);

  useEffect(() => { if (user) load(); }, [user, filterDone, filterPlate, filterDriver]);

  async function load() {
    setLoading(true);
    try {
      const p = new URLSearchParams({ limit: "9999" });
      if (filterDone !== "") p.set("is_done", filterDone);
      if (filterPlate.trim()) p.set("plate", filterPlate.trim());
      if (filterDriver.trim()) p.set("driver", filterDriver.trim());
      const r = await fetch(`/api/warnings?${p}`);
      const d = await r.json();
      if (d.ok) setWarnings(d.data);
    } finally { setLoading(false); }
  }

  async function create() {
    if (!form.plate.trim() || !form.driver_name.trim() || !form.reason.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const r = await fetch("/api/warnings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate: form.plate,
          driver_name: form.driver_name,
          reason: form.reason,
          deadline: form.deadline || null,
        }),
      });
      const d = await r.json();
      if (d.ok) {
        setShowCreate(false);
        setForm(EMPTY_FORM);
        load();
        if (d.duplicateAlert) {
          setDupAlert({ ...d.duplicateAlert, warningNo: d.data.warning_no });
        }
      } else {
        setSaveError(typeof d.error === "string" ? d.error : "Kayıt başarısız");
      }
    } finally { setSaving(false); }
  }

  async function toggleDone(w: any) {
    setTogglingId(w.id);
    try {
      const r = await fetch(`/api/warnings/${w.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_done: !w.is_done }),
      });
      const d = await r.json();
      if (d.ok) load();
      else alert(d.error);
    } finally { setTogglingId(null); }
  }

  async function deleteWarning(id: string) {
    if (!confirm("Bu uyarıyı kalıcı olarak silmek istiyor musunuz?")) return;
    setDeletingId(id);
    try {
      const r = await fetch(`/api/warnings/${id}`, { method: "DELETE" });
      const d = await r.json();
      if (d.ok) load();
      else alert(d.error);
    } finally { setDeletingId(null); }
  }

  if (!user) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-500">Yükleniyor...</p>
    </div>
  );

  const openCount = warnings.filter(w => !w.is_done).length;

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <a href="/admin" className="text-zinc-500 hover:text-white text-sm transition-colors">Yönetim</a>
              <span className="text-zinc-700">/</span>
              <span className="text-white text-sm">Uyarılar</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Uyarılar</h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              {warnings.length} kayıt
              {openCount > 0 && <span className="ml-2 text-amber-400 font-medium">{openCount} açık</span>}
            </p>
          </div>
          <button
            onClick={() => { setShowCreate(true); setForm(EMPTY_FORM); setSaveError(null); }}
            className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors whitespace-nowrap"
          >
            + Uyarı Ekle
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          {/* Durum */}
          <div className="flex gap-1">
            {[["0", "Açık"], ["1", "Tamamlandı"], ["", "Tümü"]].map(([val, lbl]) => (
              <button
                key={val}
                onClick={() => setFilterDone(val)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  filterDone === val
                    ? "bg-zinc-700 border-zinc-500 text-zinc-100"
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
          <input
            value={filterPlate}
            onChange={e => setFilterPlate(e.target.value)}
            placeholder="Plaka ara..."
            className="bg-zinc-900 border border-zinc-800 text-white text-xs px-3 py-1.5 rounded-lg focus:outline-none focus:border-zinc-600 w-36"
          />
          <input
            value={filterDriver}
            onChange={e => setFilterDriver(e.target.value)}
            placeholder="Şöför ara..."
            className="bg-zinc-900 border border-zinc-800 text-white text-xs px-3 py-1.5 rounded-lg focus:outline-none focus:border-zinc-600 w-40"
          />
          {(filterPlate || filterDriver) && (
            <button onClick={() => { setFilterPlate(""); setFilterDriver(""); }}
              className="text-xs text-zinc-500 underline hover:text-white">Temizle</button>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="py-16 text-center text-zinc-600 text-sm">Yükleniyor...</div>
        ) : warnings.length === 0 ? (
          <div className="py-16 text-center text-zinc-600 text-sm">Kayıt bulunamadı.</div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3 w-28">No</th>
                  <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Plaka</th>
                  <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Şöför</th>
                  <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Uyarı Nedeni</th>
                  <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3 w-28">Termin</th>
                  <th className="text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3 w-28">Durum</th>
                  <th className="px-4 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {warnings.map(w => {
                  const ds = deadlineStatus(w.deadline, w.is_done);
                  return (
                    <tr key={w.id} className={`border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20 ${w.is_done ? "opacity-50" : ""}`}>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-zinc-400">{w.warning_no}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-semibold text-white text-sm">{w.plate}</span>
                      </td>
                      <td className="px-4 py-3 text-zinc-300">{w.driver_name}</td>
                      <td className="px-4 py-3 max-w-xs">
                        <p className="text-zinc-300 text-sm line-clamp-2">{w.reason}</p>
                      </td>
                      <td className="px-4 py-3">
                        {w.deadline ? (
                          <span className={`text-xs font-medium ${
                            ds === "overdue" ? "text-red-400" :
                            ds === "soon"    ? "text-amber-400" :
                            "text-zinc-400"
                          }`}>
                            {fmtDate(w.deadline)}
                            {ds === "overdue" && <span className="ml-1 text-red-500">!</span>}
                          </span>
                        ) : (
                          <span className="text-zinc-600 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleDone(w)}
                          disabled={togglingId === w.id}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                            w.is_done
                              ? "bg-emerald-950 border-emerald-800 text-emerald-400 hover:bg-emerald-900"
                              : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700"
                          }`}
                        >
                          {togglingId === w.id ? "..." : w.is_done ? "✓ Tamam" : "Açık"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => deleteWarning(w.id)}
                          disabled={deletingId === w.id}
                          className="text-zinc-600 hover:text-red-400 transition-colors text-lg leading-none disabled:opacity-40"
                          title="Sil"
                        >
                          {deletingId === w.id ? "..." : "×"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-800">
              <h2 className="text-lg font-bold text-white">Uyarı Ekle</h2>
              <button onClick={() => setShowCreate(false)} className="text-zinc-600 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Plaka *</label>
                  <input
                    value={form.plate}
                    onChange={e => setForm(f => ({ ...f, plate: e.target.value.toUpperCase() }))}
                    placeholder="34 ABC 123"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Şöför Adı *</label>
                  <input
                    value={form.driver_name}
                    onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))}
                    placeholder="Ad Soyad"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Uyarı Nedeni *</label>
                <textarea
                  value={form.reason}
                  onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="Uyarı nedeni ve detayları..."
                  rows={4}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Termin Tarihi</label>
                <input
                  type="date"
                  value={form.deadline}
                  onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500"
                />
              </div>
              {saveError && (
                <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-3 py-2">{saveError}</p>
              )}
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setShowCreate(false)}
                className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">
                İptal
              </button>
              <button
                onClick={create}
                disabled={saving || !form.plate.trim() || !form.driver_name.trim() || !form.reason.trim()}
                className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors"
              >
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Alert Popup */}
      {dupAlert && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
          <div className="bg-zinc-900 border border-amber-700 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="px-6 pt-5 pb-3">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">⚠️</span>
                <div>
                  <h3 className="text-white font-bold">Tekrarlı Uyarı Tespit Edildi</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">{dupAlert.warningNo} kaydedildi</p>
                </div>
              </div>
              <div className="bg-amber-950/50 border border-amber-800/60 rounded-xl p-4 space-y-2">
                {dupAlert.plate > 0 && (
                  <p className="text-sm text-amber-300">
                    Bu <span className="font-semibold">plakaya</span> son 7 gün içinde{" "}
                    <span className="font-bold text-amber-200">{dupAlert.plate}</span> uyarı daha yazılmış.
                  </p>
                )}
                {dupAlert.driver > 0 && (
                  <p className="text-sm text-amber-300">
                    Bu <span className="font-semibold">şöföre</span> son 7 gün içinde{" "}
                    <span className="font-bold text-amber-200">{dupAlert.driver}</span> uyarı daha yazılmış.
                  </p>
                )}
              </div>
            </div>
            <div className="px-6 pb-5 pt-2">
              <button
                onClick={() => setDupAlert(null)}
                className="w-full bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
              >
                Anladım
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
