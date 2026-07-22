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

const EMPTY_FORM = { guzergah_adi: "", yon: "tek_yon", fiyat: "", arac_sinifi: "", gecerlilik_tarihi: new Date().toISOString().slice(0, 10) };

export default function OtoyolFiyatlariPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

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

  useEffect(() => { load(); }, [search]);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("guzergah_adi", search);
      const r = await fetch(`/api/admin/otoyol-fiyatlari?${params}`);
      const d = await r.json();
      if (d.ok) setRows(d.data);
    } finally { setLoading(false); }
  }

  async function save() {
    if (!form.guzergah_adi.trim()) { setSaveError("Güzergah adı zorunludur"); return; }
    if (!form.fiyat || Number(form.fiyat) <= 0) { setSaveError("Geçerli bir fiyat girin"); return; }
    setSaving(true); setSaveError(null);
    try {
      const res = await fetch("/api/admin/otoyol-fiyatlari", {
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
    const res = await fetch(`/api/admin/otoyol-fiyatlari?id=${id}`, { method: "DELETE" });
    const d = await res.json();
    if (!d.ok) { toast.error(d.error || "Hata"); return; }
    toast.success("Fiyat silindi");
    load();
  }

  const canCreate = hasPermission(user, "otoyol_fiyatlari:create");

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Otoyol / Köprü Fiyatları</h1>
              <p className="text-zinc-500 text-sm mt-0.5">{rows.length} kayıt</p>
            </div>
            {canCreate && (
              <button onClick={() => { setShowForm(true); setSaveError(null); }}
                className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors whitespace-nowrap">
                + Yeni Fiyat
              </button>
            )}
          </div>

          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Güzergah ara..."
            className="w-full bg-zinc-900 border border-zinc-800 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-zinc-600 mb-6" />

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-14 animate-pulse" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-zinc-600">Henüz otoyol/köprü fiyatı girilmedi</div>
          ) : (
            <div className="space-y-2">
              {rows.map(row => (
                <div key={row.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
                  <span className="text-white font-semibold text-sm">{row.guzergah_adi}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded border bg-zinc-800 border-zinc-700 text-zinc-400">
                    {row.yon === "gidis_donus" ? "Gidiş-Dönüş" : "Tek Yön"}
                  </span>
                  {row.arac_sinifi && <span className="text-zinc-500 text-xs">{row.arac_sinifi}</span>}
                  <span className="text-white font-semibold text-sm ml-auto">{Number(row.fiyat).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺</span>
                  <span className="text-zinc-500 text-xs">Geçerlilik: {formatDate(row.gecerlilik_tarihi)}</span>
                  {canCreate && (
                    <button onClick={() => remove(row.id)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-red-800 bg-red-950 text-red-300 hover:bg-red-900 transition-colors shrink-0">
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
            <h3 className="text-white font-semibold">Yeni Otoyol/Köprü Fiyatı</h3>
            {saveError && <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">{saveError}</div>}
            <label className="block">
              <span className="text-zinc-400 text-xs font-medium mb-1 block">Güzergah Adı *</span>
              <input value={form.guzergah_adi} onChange={e => setForm(f => ({ ...f, guzergah_adi: e.target.value }))}
                placeholder="örn. Osmangazi Köprüsü"
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Yön</span>
                <select value={form.yon} onChange={e => setForm(f => ({ ...f, yon: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                  <option value="tek_yon">Tek Yön</option>
                  <option value="gidis_donus">Gidiş-Dönüş</option>
                </select>
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Araç Sınıfı</span>
                <input value={form.arac_sinifi} onChange={e => setForm(f => ({ ...f, arac_sinifi: e.target.value }))}
                  placeholder="örn. Otobüs"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
              </label>
            </div>
            <label className="block">
              <span className="text-zinc-400 text-xs font-medium mb-1 block">Fiyat (₺) *</span>
              <input type="number" min="0" step="0.01" value={form.fiyat} onChange={e => setForm(f => ({ ...f, fiyat: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
            </label>
            <label className="block">
              <span className="text-zinc-400 text-xs font-medium mb-1 block">Geçerlilik Tarihi</span>
              <input type="date" value={form.gecerlilik_tarihi} onChange={e => setForm(f => ({ ...f, gecerlilik_tarihi: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
            </label>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm py-2.5 rounded-xl">İptal</button>
              <button onClick={save} disabled={saving || !form.guzergah_adi.trim() || !form.fiyat}
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
