"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { toast } from "@/lib/toast";
import { hasPermission } from "@/lib/permissions";

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("tr-TR").format(new Date(d));
}

const YAKIT_LABELS: Record<string, string> = { benzin: "Benzin", motorin: "Motorin", lpg: "LPG", elektrik: "Elektrik" };

const EMPTY_FORM = { yakit_turu: "motorin", fiyat: "", gecerlilik_tarihi: new Date().toISOString().slice(0, 10) };

export default function YakitFiyatlariPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [turFilter, setTurFilter] = useState("");

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

  useEffect(() => { load(); }, [turFilter]);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (turFilter) params.set("yakit_turu", turFilter);
      const r = await fetch(`/api/admin/yakit-fiyatlari?${params}`);
      const d = await r.json();
      if (d.ok) setRows(d.data);
    } finally { setLoading(false); }
  }

  async function save() {
    if (!form.fiyat || Number(form.fiyat) <= 0) { setSaveError("Geçerli bir fiyat girin"); return; }
    setSaving(true); setSaveError(null);
    try {
      const res = await fetch("/api/admin/yakit-fiyatlari", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!d.ok) { setSaveError(d.error || "Kayıt hatası"); return; }
      toast.success("Fiyat eklendi");
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      load();
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm("Bu fiyat kaydı silinsin mi?")) return;
    const res = await fetch(`/api/admin/yakit-fiyatlari?id=${id}`, { method: "DELETE" });
    const d = await res.json();
    if (!d.ok) { toast.error(d.error || "Hata"); return; }
    toast.success("Fiyat silindi");
    load();
  }

  const canCreate = hasPermission(user, "yakit_fiyatlari:create");

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Yakıt Fiyatları</h1>
              <p className="text-zinc-500 text-sm mt-0.5">{rows.length} kayıt · maliyet hesaplarında referans olarak kullanılır</p>
            </div>
            {canCreate && (
              <button onClick={() => { setShowForm(true); setSaveError(null); }}
                className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors whitespace-nowrap">
                + Yeni Fiyat
              </button>
            )}
          </div>

          <div className="flex gap-2 mb-6 flex-wrap">
            {[["", "Tümü"], ["motorin", "Motorin"], ["benzin", "Benzin"], ["lpg", "LPG"], ["elektrik", "Elektrik"]].map(([v, l]) => (
              <button key={v} onClick={() => setTurFilter(v)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  turFilter === v ? "bg-zinc-700 border-zinc-600 text-white" : "border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-600"
                }`}>
                {l}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-14 animate-pulse" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-zinc-600">Henüz yakıt fiyatı girilmedi</div>
          ) : (
            <div className="space-y-2">
              {rows.map(row => (
                <div key={row.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-3">
                  <span className="text-[10px] px-1.5 py-0.5 rounded border bg-zinc-800 border-zinc-700 text-zinc-300 shrink-0">
                    {YAKIT_LABELS[row.yakit_turu] || row.yakit_turu}
                  </span>
                  <span className="text-white font-semibold text-sm">{Number(row.fiyat).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺/lt</span>
                  <span className="text-zinc-500 text-xs">Geçerlilik: {formatDate(row.gecerlilik_tarihi)}</span>
                  {row.creator_name && <span className="text-zinc-600 text-xs">· {row.creator_name}</span>}
                  {canCreate && (
                    <button onClick={() => remove(row.id)}
                      className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-red-800 bg-red-950 text-red-300 hover:bg-red-900 transition-colors shrink-0">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowForm(false)} />
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm mx-4 space-y-4">
            <h3 className="text-white font-semibold">Yeni Yakıt Fiyatı</h3>
            {saveError && <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">{saveError}</div>}
            <label className="block">
              <span className="text-zinc-400 text-xs font-medium mb-1 block">Yakıt Türü</span>
              <select value={form.yakit_turu} onChange={e => setForm(f => ({ ...f, yakit_turu: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                {Object.entries(YAKIT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-zinc-400 text-xs font-medium mb-1 block">Fiyat (₺/lt) *</span>
              <input type="number" min="0" step="0.001" value={form.fiyat} onChange={e => setForm(f => ({ ...f, fiyat: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
            </label>
            <label className="block">
              <span className="text-zinc-400 text-xs font-medium mb-1 block">Geçerlilik Tarihi</span>
              <input type="date" value={form.gecerlilik_tarihi} onChange={e => setForm(f => ({ ...f, gecerlilik_tarihi: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
            </label>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm py-2.5 rounded-xl">İptal</button>
              <button onClick={save} disabled={saving || !form.fiyat}
                className="flex-1 bg-white text-zinc-950 font-semibold text-sm py-2.5 rounded-xl disabled:opacity-50">
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
