"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { todayIstanbul } from "@/lib/time";

function thisMonth() { return todayIstanbul().slice(0, 7); }

export default function FinansKisiselButcePage() {
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  const [kayitlar, setKayitlar] = useState<any[]>([]);
  const [kullanicilar, setKullanicilar] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ayFilter, setAyFilter] = useState(thisMonth());

  const [form, setForm] = useState({ user_id: "", ay: thisMonth(), tutar: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (!d.ok) { router.replace("/login"); return; }
      setUser(d.data);
    }).catch(() => router.replace("/login"));
    fetch("/api/users").then(r => r.json()).then(d => { if (d.ok) setKullanicilar(d.data); });
  }, [router]);

  useEffect(() => { if (user) load(); }, [user, ayFilter]);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/finans-kisisel-butce?ay=${ayFilter}`);
      const d = await r.json();
      if (d.ok) setKayitlar(d.data);
    } finally { setLoading(false); }
  }

  async function save() {
    if (!form.user_id || !form.tutar) return;
    setSaving(true);
    try {
      const r = await fetch("/api/admin/finans-kisisel-butce", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: form.user_id, ay: form.ay, tutar: Number(form.tutar) }),
      });
      const d = await r.json();
      if (d.ok) { setForm({ user_id: "", ay: ayFilter, tutar: "" }); load(); } else alert(d.error);
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm("Bu bütçe kaydı silinsin mi?")) return;
    const r = await fetch(`/api/admin/finans-kisisel-butce/${id}`, { method: "DELETE" });
    const d = await r.json();
    if (d.ok) load(); else alert(d.error);
  }

  if (!user) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-500">Yükleniyor...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-2 mb-1">
          <a href="/admin" className="text-zinc-500 hover:text-white text-sm transition-colors">Yönetim</a>
          <span className="text-zinc-700">/</span>
          <span className="text-white text-sm">Kişisel Bütçeler</span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-1">Kişisel Aylık Bütçeler</h1>
        <p className="text-zinc-500 text-sm mb-6">Sadece uyarı amaçlı — bütçe aşılınca gider girişinde sarı uyarı çıkar, kayıt engellenmez.</p>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <select value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))}
              className="bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
              <option value="">— Kişi seç —</option>
              {kullanicilar.map((u: any) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
            <input type="month" value={form.ay} onChange={e => setForm(f => ({ ...f, ay: e.target.value }))}
              className="bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
            <input type="number" placeholder="Bütçe (TL)" value={form.tutar} onChange={e => setForm(f => ({ ...f, tutar: e.target.value }))}
              className="bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
            <button onClick={save} disabled={saving || !form.user_id || !form.tutar}
              className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors">
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <label className="text-xs text-zinc-500">Ay:</label>
          <input type="month" value={ayFilter} onChange={e => setAyFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 text-white text-sm px-3 py-1.5 rounded-lg focus:outline-none focus:border-zinc-600" />
        </div>

        {loading ? (
          <div className="py-16 text-center text-zinc-600 text-sm">Yükleniyor...</div>
        ) : kayitlar.length === 0 ? (
          <div className="py-16 text-center text-zinc-600 text-sm">Bu ay için bütçe tanımlanmadı</div>
        ) : (
          <div className="space-y-2">
            {kayitlar.map((k: any) => {
              const asildi = Number(k.harcanan) > Number(k.tutar);
              const pct = Math.min(100, (Number(k.harcanan) / Number(k.tutar)) * 100);
              return (
                <div key={k.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-white font-semibold text-sm">{k.user_ad}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs tabular-nums ${asildi ? "text-red-400" : "text-zinc-400"}`}>
                        {Number(k.harcanan).toLocaleString("tr-TR")} / {Number(k.tutar).toLocaleString("tr-TR")} TL
                      </span>
                      <button onClick={() => remove(k.id)} className="text-zinc-600 hover:text-red-400 text-xs transition-colors">Sil</button>
                    </div>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${asildi ? "bg-red-500" : "bg-zinc-500"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
