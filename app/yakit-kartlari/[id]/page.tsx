"use client";
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import Nav from "@/components/Nav";
import { toast } from "@/lib/toast";
import { hasPermission } from "@/lib/permissions";

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("tr-TR").format(new Date(d));
}

const EMPTY_FORM = { dolum_tarihi: "", dolum_yeri: "", miktar_litre: "", onceki_km: "", son_km: "", birim_fiyat: "", tutar: "", notlar: "" };

export default function YakitKartiDetayPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [user, setUser] = useState<any>(null);
  const [kart, setKart] = useState<any>(null);
  const [dolumlar, setDolumlar] = useState<any[]>([]);
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
    load();
  }, [id]);

  async function load() {
    setLoading(true);
    try {
      const [kartRes, dolumRes] = await Promise.all([
        fetch(`/api/yakit-kartlari?limit=500`).then(r => r.json()),
        fetch(`/api/yakit-kartlari/${id}/dolumlar`).then(r => r.json()),
      ]);
      if (kartRes.ok) setKart(kartRes.data.find((k: any) => k.id === id) || null);
      if (dolumRes.ok) setDolumlar(dolumRes.data);
    } finally { setLoading(false); }
  }

  async function save() {
    if (!form.dolum_tarihi) { setSaveError("Dolum tarihi zorunludur"); return; }
    setSaving(true); setSaveError(null);
    try {
      const body = {
        ...form,
        miktar_litre: form.miktar_litre || null, onceki_km: form.onceki_km || null, son_km: form.son_km || null,
        birim_fiyat: form.birim_fiyat || null, tutar: form.tutar || null,
      };
      const res = await fetch(`/api/yakit-kartlari/${id}/dolumlar`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!d.ok) { setSaveError(d.error || "Kayıt hatası"); return; }
      toast.success("Dolum eklendi");
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      load();
    } finally { setSaving(false); }
  }

  const canCreate = hasPermission(user, "fuel_cards:create");
  const toplamTutar = dolumlar.reduce((sum, d) => sum + (Number(d.tutar) || 0), 0);
  const toplamLitre = dolumlar.reduce((sum, d) => sum + (Number(d.miktar_litre) || 0), 0);

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <Link href="/yakit-kartlari" className="text-zinc-500 hover:text-white text-sm mb-4 inline-block">← Yakıt Kartları</Link>

          {loading ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl h-24 animate-pulse" />
          ) : !kart ? (
            <div className="text-center py-16 text-zinc-600">Kart bulunamadı</div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h1 className="text-2xl font-bold text-white font-mono">{kart.kart_no}</h1>
                  <p className="text-zinc-500 text-sm mt-0.5">
                    {kart.firma} {kart.plate ? `· ${kart.plate}` : ""} {kart.isleten_unvan ? `· ${kart.isleten_unvan}` : ""}
                  </p>
                </div>
                {canCreate && (
                  <button onClick={() => { setShowForm(true); setForm({ ...EMPTY_FORM }); setSaveError(null); }}
                    className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors whitespace-nowrap">
                    + Dolum Ekle
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                  <p className="text-zinc-500 text-xs">Toplam Dolum</p>
                  <p className="text-white font-semibold">{dolumlar.length} kayıt</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                  <p className="text-zinc-500 text-xs">Toplam Litre / Tutar</p>
                  <p className="text-white font-semibold">{toplamLitre.toFixed(1)} L · ₺{toplamTutar.toLocaleString("tr-TR")}</p>
                </div>
              </div>

              {dolumlar.length === 0 ? (
                <div className="text-center py-16 text-zinc-600">Henüz dolum kaydı yok</div>
              ) : (
                <div className="space-y-2">
                  {dolumlar.map(row => (
                    <div key={row.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-semibold text-sm">{formatDate(row.dolum_tarihi)}</span>
                        {row.dolum_yeri && <span className="text-zinc-500 text-xs">{row.dolum_yeri}</span>}
                        <span className="text-zinc-400 text-xs ml-auto">
                          {row.miktar_litre ? `${row.miktar_litre} L` : ""}{row.tutar ? ` · ₺${Number(row.tutar).toLocaleString("tr-TR")}` : ""}
                        </span>
                      </div>
                      {row.son_km && <p className="text-zinc-600 text-xs mt-1">KM: {row.son_km}</p>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/60" onClick={() => setShowForm(false)} />
          <div className="w-full max-w-md bg-zinc-900 border-l border-zinc-800 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
              <h2 className="text-white font-semibold">Yeni Dolum</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {saveError && <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">{saveError}</div>}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Dolum Tarihi *</span>
                  <input type="date" value={form.dolum_tarihi} onChange={e => setForm(f => ({ ...f, dolum_tarihi: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Dolum Yeri</span>
                  <input value={form.dolum_yeri} onChange={e => setForm(f => ({ ...f, dolum_yeri: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Miktar (Litre)</span>
                  <input type="number" step="0.01" value={form.miktar_litre} onChange={e => setForm(f => ({ ...f, miktar_litre: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Birim Fiyat</span>
                  <input type="number" step="0.001" value={form.birim_fiyat} onChange={e => setForm(f => ({ ...f, birim_fiyat: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
              </div>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Tutar (boş bırakılırsa miktar × birim fiyat hesaplanır)</span>
                <input type="number" step="0.01" value={form.tutar} onChange={e => setForm(f => ({ ...f, tutar: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Önceki KM</span>
                  <input type="number" value={form.onceki_km} onChange={e => setForm(f => ({ ...f, onceki_km: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Son KM</span>
                  <input type="number" value={form.son_km} onChange={e => setForm(f => ({ ...f, son_km: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
              </div>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Not</span>
                <textarea value={form.notlar} onChange={e => setForm(f => ({ ...f, notlar: e.target.value }))} rows={2}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </label>
            </div>
            <div className="px-5 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving || !form.dolum_tarihi}
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
