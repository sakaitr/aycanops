"use client";
import { useState, useEffect, useRef } from "react";
import Nav from "@/components/Nav";

interface Notes {
  firma: string;
  arac: string;
  tarih_saat: string;  // datetime-local value, e.g. "2026-02-23T14:00"
  guzergah: string;
  aciklama: string;
}

function parseNotes(raw: string | null): Notes {
  try {
    const p = JSON.parse(raw || "{}");
    return {
      firma: p.firma || "",
      arac: p.arac || "",
      tarih_saat: p.tarih_saat || "",
      guzergah: p.guzergah || "",
      aciklama: p.aciklama || "",
    };
  } catch {
    return { firma: "", arac: "", tarih_saat: "", guzergah: "", aciklama: raw || "" };
  }
}

function fmtDt(val: string) {
  if (!val) return "";
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" })
    + " " + d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function todayStr() { return new Date().toISOString().split("T")[0]; }
function nowDtLocal() {
  const d = new Date();
  d.setSeconds(0, 0);
  return d.toISOString().slice(0, 16);
}

const EMPTY_FORM: Notes = { firma: "", arac: "", tarih_saat: "", guzergah: "", aciklama: "" };

export default function EkMesaiPage() {
  const [user, setUser] = useState<any>({ full_name: "", role: "personel" });
  const [entries, setEntries] = useState<any[]>([]);
  const [filterDate, setFilterDate] = useState(todayStr());
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Notes>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const firmaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => { if (d.ok) setUser(d.data); });
    loadEntries();
  }, []);

  async function loadEntries() {
    setLoading(true);
    try {
      const r = await fetch("/api/trips");
      const d = await r.json();
      if (d.ok) setEntries(d.data);
    } finally { setLoading(false); }
  }

  function openForm() {
    setForm({ ...EMPTY_FORM, tarih_saat: nowDtLocal() });
    setShowForm(true);
    setTimeout(() => firmaRef.current?.focus(), 50);
  }

  const filtered = entries.filter(e => (e.trip_date || "").startsWith(filterDate));

  async function addEntry() {
    if (!form.firma.trim() && !form.arac.trim()) return;
    setSaving(true);
    try {
      const tripDate = form.tarih_saat ? form.tarih_saat.split("T")[0] : new Date().toISOString().split("T")[0];
      const departure = form.tarih_saat ? form.tarih_saat.split("T")[1] : null;
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_date: tripDate,
          planned_departure: departure || null,
          notes: JSON.stringify(form),
        }),
      });
      const d = await res.json();
      if (d.ok) {
        setShowForm(false);
        loadEntries();
      }
    } finally { setSaving(false); }
  }

  async function deleteEntry(id: string) {
    await fetch(`/api/trips/${id}`, { method: "DELETE" });
    setEntries(e => e.filter(x => x.id !== id));
  }

  const fld = (k: keyof Notes) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(v => ({ ...v, [k]: e.target.value }));

  const canSave = form.firma.trim() || form.arac.trim();

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Ek Mesai</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{loading ? "..." : `${filtered.length} kayıt`}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-600 [color-scheme:dark]" />
            <button onClick={openForm}
              className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors">
              + Ekle
            </button>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="text-zinc-600 text-sm text-center py-16">Yükleniyor...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-zinc-600 text-sm mb-3">Bu gün için kayıt yok</p>
            <button onClick={openForm} className="text-zinc-400 hover:text-white text-sm underline transition-colors">
              Kayıt ekle
            </button>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Planlama Saati</th>
                  <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Firma</th>
                  <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Araç</th>
                  <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Tarih / Saat</th>
                  <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3 hidden sm:table-cell">Güzergah</th>
                  <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Açıklama</th>
                  <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3 hidden xl:table-cell">Ekleyen</th>
                  <th className="px-4 py-3 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => {
                  const n = parseNotes(entry.notes);
                  const dash = <span className="text-zinc-700">—</span>;
                  const planSaat = entry.created_at
                    ? new Date(entry.created_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
                    : "";
                  return (
                    <tr key={entry.id} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20 transition-colors group">
                      <td className="px-4 py-3 text-zinc-500 text-xs tabular-nums whitespace-nowrap">
                        {planSaat || <span className="text-zinc-700">—</span>}
                      </td>
                      <td className="px-4 py-3 text-white text-sm font-medium">{n.firma || dash}</td>
                      <td className="px-4 py-3 text-zinc-300 text-sm font-mono">{n.arac || dash}</td>
                      <td className="px-4 py-3 text-zinc-300 text-sm tabular-nums whitespace-nowrap">
                        {fmtDt(n.tarih_saat) || dash}
                      </td>
                      <td className="px-4 py-3 text-zinc-400 text-sm hidden sm:table-cell">{n.guzergah || dash}</td>
                      <td className="px-4 py-3 text-zinc-500 text-sm hidden lg:table-cell max-w-[180px] truncate">{n.aciklama || dash}</td>
                      <td className="px-4 py-3 text-zinc-600 text-xs hidden xl:table-cell whitespace-nowrap">{entry.creator_name || dash}</td>
                      <td className="px-4 py-3 text-right">
                        {user && (entry.created_by === user.id || ["yetkili","yonetici","admin"].includes(user.role)) && (
                          <button onClick={() => deleteEntry(entry.id)}
                            className="text-zinc-800 group-hover:text-zinc-600 hover:!text-red-400 transition-colors text-lg leading-none">×</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Add Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full sm:max-w-lg">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Yeni Kayıt</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-600 hover:text-white text-2xl leading-none">×</button>
            </div>

            <div className="space-y-3">
              {/* Firma + Araç */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Firma</label>
                  <input ref={firmaRef} type="text" value={form.firma} onChange={fld("firma")} placeholder="Firma adı"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 placeholder-zinc-600" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Araç</label>
                  <input type="text" value={form.arac} onChange={fld("arac")} placeholder="34 ABC 00"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 placeholder-zinc-600" />
                </div>
              </div>

              {/* Tarih/Saat + Güzergah */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Tarih / Saat</label>
                  <input type="datetime-local" value={form.tarih_saat} onChange={fld("tarih_saat")}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Güzergah</label>
                  <input type="text" value={form.guzergah} onChange={fld("guzergah")} placeholder="A → B"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 placeholder-zinc-600" />
                </div>
              </div>

              {/* Açıklama */}
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Açıklama</label>
                <input type="text" value={form.aciklama} onChange={fld("aciklama")} placeholder="Notlar..."
                  onKeyDown={e => e.key === "Enter" && canSave && addEntry()}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 placeholder-zinc-600" />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowForm(false)}
                className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">
                İptal
              </button>
              <button onClick={addEntry} disabled={saving || !canSave}
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
