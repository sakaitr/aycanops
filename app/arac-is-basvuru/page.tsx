"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { toast } from "@/lib/toast";
import { hasPermission } from "@/lib/permissions";

const DURUMLAR = ["yeni", "gorusuldu", "olumlu", "olumsuz", "ise_alindi"];
const DURUM_LABELS: Record<string, string> = {
  yeni: "Yeni", gorusuldu: "Görüşüldü", olumlu: "Olumlu", olumsuz: "Olumsuz", ise_alindi: "İşe Alındı",
};
const DURUM_COLORS: Record<string, string> = {
  yeni: "bg-zinc-800 border-zinc-700 text-zinc-400",
  gorusuldu: "bg-sky-950 border-sky-800 text-sky-300",
  olumlu: "bg-emerald-950 border-emerald-800 text-emerald-300",
  olumsuz: "bg-red-950 border-red-800 text-red-300",
  ise_alindi: "bg-violet-950 border-violet-800 text-violet-300",
};

const EMPTY_FORM = {
  plaka: "", sofor_adi: "", telefon: "", semt: "", bos_saat: "", uygun_guzergahlar: "", notlar: "", durum: "yeni",
};

export default function AracIsBasvuruPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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
  }, []);

  useEffect(() => { load(); }, [durumFilter]);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (durumFilter) params.set("durum", durumFilter);
      const r = await fetch(`/api/arac-is-basvuru?${params}`);
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
      plaka: row.plaka || "", sofor_adi: row.sofor_adi || "", telefon: row.telefon || "",
      semt: row.semt || "", bos_saat: row.bos_saat || "", uygun_guzergahlar: row.uygun_guzergahlar || "",
      notlar: row.notlar || "", durum: row.durum || "yeni",
    });
    setSaveError(null);
    setShowForm(true);
  }

  async function save() {
    if (!form.plaka.trim() && !form.sofor_adi.trim()) { setSaveError("Plaka veya şoför adı girilmeli"); return; }
    setSaving(true); setSaveError(null);
    try {
      const url = editing ? `/api/arac-is-basvuru/${editing.id}` : "/api/arac-is-basvuru";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await res.json();
      if (!d.ok) { setSaveError(typeof d.error === "string" ? d.error : "Kayıt hatası"); return; }
      toast.success(editing ? "Başvuru güncellendi" : "Başvuru eklendi");
      setShowForm(false);
      load();
    } finally { setSaving(false); }
  }

  async function remove(row: any) {
    if (!confirm(`${row.plaka || row.sofor_adi} başvurusu silinsin mi?`)) return;
    const res = await fetch(`/api/arac-is-basvuru/${row.id}`, { method: "DELETE" });
    const d = await res.json();
    if (!d.ok) { toast.error(typeof d.error === "string" ? d.error : "Hata"); return; }
    toast.success("Başvuru silindi");
    load();
  }

  const canWrite = hasPermission(user, "arac_is_basvuru:create");

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Araç / Şoför İş Başvuruları</h1>
              <p className="text-zinc-500 text-sm mt-0.5">{rows.length} başvuru</p>
            </div>
            {canWrite && (
              <button onClick={openCreate}
                className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors whitespace-nowrap">
                + Yeni Başvuru
              </button>
            )}
          </div>

          <div className="flex gap-2 mb-6 flex-wrap">
            <button onClick={() => setDurumFilter("")}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                durumFilter === "" ? "bg-zinc-700 border-zinc-600 text-white" : "border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-600"
              }`}>
              Tümü
            </button>
            {DURUMLAR.map(d => (
              <button key={d} onClick={() => setDurumFilter(d)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  durumFilter === d ? "bg-zinc-700 border-zinc-600 text-white" : "border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-600"
                }`}>
                {DURUM_LABELS[d]}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-20 animate-pulse" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-zinc-600">Henüz başvuru yok</div>
          ) : (
            <div className="space-y-2">
              {rows.map(row => (
                <div key={row.id} onClick={() => openEdit(row)} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 cursor-pointer hover:border-zinc-700 transition-colors">
                  <div className="flex items-center gap-2 flex-wrap">
                    {row.plaka && <span className="text-white font-semibold text-sm font-mono">{row.plaka}</span>}
                    {row.sofor_adi && <span className="text-white font-semibold text-sm">{row.sofor_adi}</span>}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ml-auto ${DURUM_COLORS[row.durum] || DURUM_COLORS.yeni}`}>
                      {DURUM_LABELS[row.durum] || row.durum}
                    </span>
                  </div>
                  <p className="text-zinc-500 text-xs mt-1.5">
                    {row.telefon && <span>{row.telefon}</span>}
                    {row.semt && <span>{row.telefon ? " · " : ""}{row.semt}</span>}
                    {row.bos_saat && <span> · Boş saat: {row.bos_saat}</span>}
                  </p>
                  {row.uygun_guzergahlar && <p className="text-zinc-600 text-xs mt-1">Uygun güzergah: {row.uygun_guzergahlar}</p>}
                  {canWrite && (
                    <button onClick={e => { e.stopPropagation(); remove(row); }}
                      className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-red-300 hover:border-red-800 transition-colors mt-2">
                      Sil
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
              <h2 className="text-white font-semibold">{editing ? "Başvuruyu Düzenle" : "Yeni Başvuru"}</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {saveError && <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">{saveError}</div>}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Plaka</span>
                  <input value={form.plaka} onChange={e => setForm(f => ({ ...f, plaka: e.target.value.toUpperCase() }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 uppercase font-mono" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Şoför Adı</span>
                  <input value={form.sofor_adi} onChange={e => setForm(f => ({ ...f, sofor_adi: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
              </div>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Telefon</span>
                <input value={form.telefon} onChange={e => setForm(f => ({ ...f, telefon: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Olduğu Semt</span>
                <input value={form.semt} onChange={e => setForm(f => ({ ...f, semt: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Boş Saat</span>
                <input value={form.bos_saat} onChange={e => setForm(f => ({ ...f, bos_saat: e.target.value }))} placeholder="Örn: 07:00-09:00, 16:00-18:00"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Uygun Güzergahlar</span>
                <textarea value={form.uygun_guzergahlar} onChange={e => setForm(f => ({ ...f, uygun_guzergahlar: e.target.value }))} rows={2}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Durum</span>
                <select value={form.durum} onChange={e => setForm(f => ({ ...f, durum: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                  {DURUMLAR.map(d => <option key={d} value={d}>{DURUM_LABELS[d]}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Notlar</span>
                <textarea value={form.notlar} onChange={e => setForm(f => ({ ...f, notlar: e.target.value }))} rows={2}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </label>
            </div>
            <div className="px-5 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving}
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
