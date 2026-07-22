"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { toast } from "@/lib/toast";
import { hasPermission } from "@/lib/permissions";

function formatDateTime(d: string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(d));
}
function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("tr-TR").format(new Date(d));
}

const HEDEF_ROL_LABELS: Record<string, string> = {
  hepsi: "Herkes", personel: "Personel", yetkili: "Yetkili", yonetici: "Yönetici", admin: "Admin",
};

const EMPTY_FORM = { baslik: "", icerik: "", hedef_rol: "hepsi", bitis_tarihi: "" };

export default function DuyurularPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data);
      else router.replace("/login");
    });
  }, []);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/duyurular");
      const d = await r.json();
      if (d.ok) setRows(d.data);
    } finally { setLoading(false); }
  }

  async function save() {
    if (!form.baslik.trim()) { setSaveError("Başlık zorunludur"); return; }
    setSaving(true); setSaveError(null);
    try {
      const res = await fetch("/api/admin/duyurular", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!d.ok) { setSaveError(d.error || "Kayıt hatası"); return; }
      toast.success("Duyuru yayınlandı");
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      load();
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm("Bu duyuru silinsin mi?")) return;
    const res = await fetch(`/api/admin/duyurular/${id}`, { method: "DELETE" });
    const d = await res.json();
    if (!d.ok) { toast.error(d.error || "Hata"); return; }
    toast.success("Duyuru silindi");
    load();
  }

  const canCreate = hasPermission(user, "duyurular:create");

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Duyurular</h1>
              <p className="text-zinc-500 text-sm mt-0.5">{rows.length} duyuru</p>
            </div>
            {canCreate && (
              <button onClick={() => { setShowForm(true); setSaveError(null); }}
                className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors whitespace-nowrap">
                + Yeni Duyuru
              </button>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-24 animate-pulse" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-zinc-600">Henüz duyuru yok</div>
          ) : (
            <div className="space-y-3">
              {rows.map(row => (
                <div key={row.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-white font-semibold text-sm">{row.baslik}</span>
                    {row.hedef_rol !== "hepsi" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border bg-zinc-800 border-zinc-700 text-zinc-400">
                        {HEDEF_ROL_LABELS[row.hedef_rol]}
                      </span>
                    )}
                    <span className="text-zinc-600 text-xs ml-auto">{formatDateTime(row.yayinlanma_tarihi)}</span>
                  </div>
                  {row.icerik && <p className="text-zinc-400 text-sm whitespace-pre-wrap">{row.icerik}</p>}
                  <p className="text-zinc-600 text-xs mt-2">
                    {row.creator_name}{row.bitis_tarihi ? ` · ${formatDate(row.bitis_tarihi)} tarihine kadar geçerli` : ""}
                  </p>
                  {canCreate && (
                    <button onClick={() => remove(row.id)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-red-800 bg-red-950 text-red-300 hover:bg-red-900 transition-colors mt-2">
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
              <h2 className="text-white font-semibold">Yeni Duyuru</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {saveError && <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">{saveError}</div>}
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Başlık *</span>
                <input value={form.baslik} onChange={e => setForm(f => ({ ...f, baslik: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">İçerik</span>
                <textarea value={form.icerik} onChange={e => setForm(f => ({ ...f, icerik: e.target.value }))} rows={5}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Hedef Kitle</span>
                <select value={form.hedef_rol} onChange={e => setForm(f => ({ ...f, hedef_rol: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                  {Object.entries(HEDEF_ROL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Bitiş Tarihi (opsiyonel)</span>
                <input type="date" value={form.bitis_tarihi} onChange={e => setForm(f => ({ ...f, bitis_tarihi: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
              </label>
            </div>
            <div className="px-5 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving || !form.baslik.trim()}
                className="flex-1 bg-white text-zinc-950 font-semibold text-sm py-2.5 rounded-xl hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                {saving ? "Yayınlanıyor..." : "Yayınla"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
