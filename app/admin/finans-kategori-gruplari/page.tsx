"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";

export default function FinansKategoriGruplariPage() {
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  const [gruplar, setGruplar] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [kategoriler, setKategoriler] = useState<any[]>([]);
  const [kullanicilar, setKullanicilar] = useState<any[]>([]);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedKategoriler, setSelectedKategoriler] = useState<Set<string>>(new Set());
  const [selectedKullanicilar, setSelectedKullanicilar] = useState<Set<string>>(new Set());
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [newAd, setNewAd] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (!d.ok) { router.replace("/login"); return; }
      setUser(d.data);
    }).catch(() => router.replace("/login"));
    fetch("/api/finans/kategori?tip=gider").then(r => r.json()).then(d => { if (d.ok) setKategoriler(d.data); });
    fetch("/api/users").then(r => r.json()).then(d => { if (d.ok) setKullanicilar(d.data); });
  }, [router]);

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/finans-kategori-gruplari");
      const d = await r.json();
      if (d.ok) setGruplar(d.data);
    } finally { setLoading(false); }
  }

  async function toggleExpand(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    setDetailLoading(true);
    try {
      const [kr, ur] = await Promise.all([
        fetch(`/api/admin/finans-kategori-gruplari/${id}/kategoriler`).then(r => r.json()),
        fetch(`/api/admin/finans-kategori-gruplari/${id}/kullanicilar`).then(r => r.json()),
      ]);
      setSelectedKategoriler(new Set(kr.ok ? kr.data : []));
      setSelectedKullanicilar(new Set(ur.ok ? ur.data : []));
    } finally { setDetailLoading(false); }
  }

  function toggleKategori(id: string) {
    setSelectedKategoriler(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleKullanici(id: string) {
    setSelectedKullanicilar(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function saveDetail(grupId: string) {
    setSaving(true);
    try {
      await Promise.all([
        fetch(`/api/admin/finans-kategori-gruplari/${grupId}/kategoriler`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kategori_ids: Array.from(selectedKategoriler) }),
        }),
        fetch(`/api/admin/finans-kategori-gruplari/${grupId}/kullanicilar`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_ids: Array.from(selectedKullanicilar) }),
        }),
      ]);
      setExpanded(null);
      load();
    } finally { setSaving(false); }
  }

  async function addGrup() {
    if (!newAd.trim()) return;
    setAdding(true);
    try {
      const r = await fetch("/api/admin/finans-kategori-gruplari", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ad: newAd.trim() }),
      });
      const d = await r.json();
      if (d.ok) { setShowAdd(false); setNewAd(""); load(); } else alert(d.error);
    } finally { setAdding(false); }
  }

  async function deleteGrup(id: string) {
    if (!confirm("Bu grup silinsin mi?")) return;
    const r = await fetch(`/api/admin/finans-kategori-gruplari/${id}`, { method: "DELETE" });
    const d = await r.json();
    if (d.ok) { if (expanded === id) setExpanded(null); load(); } else alert(d.error);
  }

  if (!user) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-500">Yükleniyor...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <a href="/admin" className="text-zinc-500 hover:text-white text-sm transition-colors">Yönetim</a>
              <span className="text-zinc-700">/</span>
              <span className="text-white text-sm">Gider Kategori Grupları</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Gider Kategori Grupları</h1>
            <p className="text-zinc-500 text-sm mt-0.5">Kullanıcıyı bir gruba atarsanız, Gider Ekle formunda sadece o grubun kategorilerini görür. Hiçbir gruba atanmayan kullanıcılar (ör. admin) tüm kategorileri görür.</p>
          </div>
          <button onClick={() => setShowAdd(true)}
            className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors whitespace-nowrap">
            + Grup Ekle
          </button>
        </div>

        {loading ? (
          <div className="py-16 text-center text-zinc-600 text-sm">Yükleniyor...</div>
        ) : gruplar.length === 0 ? (
          <div className="py-16 text-center text-zinc-600 text-sm">Henüz grup yok</div>
        ) : (
          <div className="space-y-2">
            {gruplar.map(g => (
              <div key={g.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4">
                  <button onClick={() => toggleExpand(g.id)} className="flex-1 flex items-center gap-3 text-left">
                    <span className="text-white font-semibold">{g.ad}</span>
                    <span className="text-xs text-zinc-500">{g.kategori_sayisi} kategori · {g.kullanici_sayisi} kullanıcı</span>
                    <span className="ml-auto text-zinc-600 text-xs">{expanded === g.id ? "▲" : "▼"}</span>
                  </button>
                  <button onClick={() => deleteGrup(g.id)}
                    className="text-xs text-zinc-600 hover:text-red-400 border border-zinc-700 hover:border-red-800 px-2.5 py-1 rounded-lg transition-colors">
                    Sil
                  </button>
                </div>

                {expanded === g.id && (
                  <div className="border-t border-zinc-800 px-5 py-4">
                    {detailLoading ? (
                      <p className="text-zinc-600 text-xs py-2">Yükleniyor...</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div>
                          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Kategoriler</p>
                          <div className="max-h-64 overflow-y-auto space-y-1 pr-2">
                            {kategoriler.map((k: any) => (
                              <label key={k.id} className="flex items-center gap-2 cursor-pointer text-sm">
                                <input type="checkbox" checked={selectedKategoriler.has(k.id)} onChange={() => toggleKategori(k.id)} className="accent-white" />
                                <span className="text-zinc-300">{k.parent_id ? "  " + k.ad : k.ad}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Kullanıcılar</p>
                          <div className="max-h-64 overflow-y-auto space-y-1 pr-2">
                            {kullanicilar.map((u: any) => (
                              <label key={u.id} className="flex items-center gap-2 cursor-pointer text-sm">
                                <input type="checkbox" checked={selectedKullanicilar.has(u.id)} onChange={() => toggleKullanici(u.id)} className="accent-white" />
                                <span className="text-zinc-300">{u.full_name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="flex gap-3 mt-4">
                      <button onClick={() => setExpanded(null)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
                      <button onClick={() => saveDetail(g.id)} disabled={saving}
                        className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                        {saving ? "Kaydediliyor..." : "Kaydet"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {showAdd && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Grup Ekle</h2>
              <button onClick={() => setShowAdd(false)} className="text-zinc-600 hover:text-white text-xl">×</button>
            </div>
            <input value={newAd} onChange={e => setNewAd(e.target.value)} placeholder="Grup adı" autoFocus
              onKeyDown={e => { if (e.key === "Enter") addGrup(); }}
              className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAdd(false)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={addGrup} disabled={adding || !newAd.trim()}
                className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                {adding ? "Kaydediliyor..." : "Ekle"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
