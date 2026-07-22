"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { toast } from "@/lib/toast";

const TUR_OPTS = [
  { value: "surucu", label: "Sürücü" },
  { value: "yolcu", label: "Yolcu" },
  { value: "isleten", label: "İşleten" },
  { value: "diger", label: "Diğer" },
];

const EMPTY_FORM = { isim: "", tur: "surucu", tc_no: "", telefon: "", ekleme_nedeni: "", aciklama: "" };

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("tr-TR").format(new Date(d));
}

export default function KaraListePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [turFilter, setTurFilter] = useState("");
  const [durumFilter, setDurumFilter] = useState("aktif");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (!d.ok || d.data?.role !== "admin") { router.replace("/"); return; }
      setUser(d.data);
    }).catch(() => router.replace("/"));
  }, []);

  useEffect(() => { if (user) load(); }, [user, search, turFilter, durumFilter]);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (turFilter) params.set("tur", turFilter);
      params.set("durum", durumFilter);
      const r = await fetch(`/api/kara-liste?${params}`);
      const d = await r.json();
      if (d.ok) setRows(d.data);
    } finally { setLoading(false); }
  }

  async function save() {
    if (!form.isim.trim()) { setSaveError("İsim zorunludur"); return; }
    setSaving(true); setSaveError(null);
    try {
      const res = await fetch("/api/kara-liste", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!d.ok) { setSaveError(d.error || "Kayıt hatası"); return; }
      toast.success("Kara listeye eklendi");
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      load();
    } finally { setSaving(false); }
  }

  async function kaldir(id: string) {
    const reason = prompt("Kaldırma nedeni (opsiyonel):");
    if (reason === null) return;
    const res = await fetch(`/api/kara-liste/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "kaldir", kaldirma_nedeni: reason || null }),
    });
    const d = await res.json();
    if (!d.ok) { toast.error(d.error || "Hata"); return; }
    toast.success("Kaldırıldı");
    load();
  }

  async function tekrarAktif(id: string) {
    const res = await fetch(`/api/kara-liste/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "tekrar-aktif" }),
    });
    const d = await res.json();
    if (!d.ok) { toast.error(d.error || "Hata"); return; }
    toast.success("Tekrar aktif edildi");
    load();
  }

  if (!user) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center"><p className="text-zinc-500">Yükleniyor...</p></div>;

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-4xl mx-auto px-4 py-6">

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Kara Liste</h1>
              <p className="text-zinc-500 text-sm mt-0.5">{rows.length} kayıt</p>
            </div>
            <button onClick={() => { setShowForm(true); setForm({ ...EMPTY_FORM }); setSaveError(null); }}
              className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors whitespace-nowrap">
              + Kara Listeye Ekle
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="İsim, TC, telefon ara..."
              className="flex-1 bg-zinc-900 border border-zinc-800 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-zinc-600 placeholder-zinc-600" />
            <select value={turFilter} onChange={e => setTurFilter(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-zinc-600">
              <option value="">Tüm Türler</option>
              {TUR_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="flex gap-2 mb-6">
            {[["aktif", "Aktif"], ["kaldirildi", "Kaldırılmış"]].map(([v, l]) => (
              <button key={v} onClick={() => setDurumFilter(v)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  durumFilter === v ? "bg-zinc-700 border-zinc-600 text-white" : "border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-600"
                }`}>
                {l}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-16 animate-pulse" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-zinc-600">Kayıt yok</div>
          ) : (
            <div className="space-y-2">
              {rows.map(row => (
                <div key={row.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-medium text-sm">{row.isim}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded border bg-zinc-800 border-zinc-700 text-zinc-400">
                      {TUR_OPTS.find(o => o.value === row.tur)?.label || row.tur}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ml-auto ${
                      row.durum === "aktif" ? "bg-red-950 border-red-800 text-red-300" : "bg-zinc-800 border-zinc-700 text-zinc-500"
                    }`}>
                      {row.durum === "aktif" ? "Kara Listede" : "Kaldırıldı"}
                    </span>
                  </div>
                  {row.ekleme_nedeni && <p className="text-zinc-400 text-xs mt-1">{row.ekleme_nedeni}</p>}
                  <p className="text-zinc-600 text-xs mt-0.5">
                    {formatDate(row.created_at)}
                    {row.kaldirma_nedeni ? ` · Kaldırma nedeni: ${row.kaldirma_nedeni}` : ""}
                  </p>
                  {row.durum === "aktif" ? (
                    <button onClick={() => kaldir(row.id)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors mt-2">
                      Listeden Kaldır
                    </button>
                  ) : (
                    <button onClick={() => tekrarAktif(row.id)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-red-800 text-red-300 hover:bg-red-950 transition-colors mt-2">
                      Tekrar Ekle
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
              <h2 className="text-white font-semibold">Kara Listeye Ekle</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {saveError && <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">{saveError}</div>}
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">İsim *</span>
                <input value={form.isim} onChange={e => setForm(f => ({ ...f, isim: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Tür *</span>
                <select value={form.tur} onChange={e => setForm(f => ({ ...f, tur: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                  {TUR_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">TC Kimlik No</span>
                  <input value={form.tc_no} onChange={e => setForm(f => ({ ...f, tc_no: e.target.value }))} maxLength={11}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Telefon</span>
                  <input value={form.telefon} onChange={e => setForm(f => ({ ...f, telefon: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
              </div>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Ekleme Nedeni</span>
                <textarea value={form.ekleme_nedeni} onChange={e => setForm(f => ({ ...f, ekleme_nedeni: e.target.value }))} rows={2}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Açıklama</span>
                <textarea value={form.aciklama} onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))} rows={2}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </label>
            </div>
            <div className="px-5 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving || !form.isim.trim()}
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
