"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { toast } from "@/lib/toast";
import { hasPermission } from "@/lib/permissions";

const TIP_LABELS: Record<string, string> = { gelir: "Gelir", gider: "Gider" };
const EMPTY_FORM = { ad: "", tip: "gider", hesap_id: "" };

export default function KategoriPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data); else router.replace("/login");
    });
    load();
    fetch("/api/finans/hesap-plani").then(r => r.json()).then(d => { if (d.ok) setAccounts(d.data); });
  }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/finans/kategori");
      const d = await r.json();
      if (d.ok) setRows(d.data);
    } finally { setLoading(false); }
  }

  function openCreate() { setEditing(null); setForm({ ...EMPTY_FORM }); setSaveError(null); setShowForm(true); }
  function openEdit(row: any) {
    setEditing(row);
    setForm({ ad: row.ad, tip: row.tip, hesap_id: row.hesap_id || "" });
    setSaveError(null); setShowForm(true);
  }

  async function save() {
    if (!form.ad.trim()) { setSaveError("Ad zorunludur"); return; }
    setSaving(true); setSaveError(null);
    try {
      const url = editing ? `/api/finans/kategori/${editing.id}` : "/api/finans/kategori";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await res.json();
      if (!d.ok) { setSaveError(typeof d.error === "string" ? d.error : "Kayıt hatası"); return; }
      toast.success(editing ? "Kategori güncellendi" : "Kategori eklendi");
      setShowForm(false);
      load();
    } finally { setSaving(false); }
  }

  const canCreate = hasPermission(user, "finans_kategori:create");

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Gelir/Gider Kategorileri</h1>
              <p className="text-zinc-500 text-sm mt-0.5">{rows.length} kategori</p>
            </div>
            {canCreate && (
              <button onClick={openCreate} className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors whitespace-nowrap">
                + Yeni Kategori
              </button>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-16 animate-pulse" />)}</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-zinc-600">Henüz kategori tanımlanmadı</div>
          ) : (
            <div className="space-y-2">
              {rows.map(row => {
                const account = accounts.find(a => a.id === row.hesap_id);
                return (
                  <div key={row.id} onClick={() => openEdit(row)} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 cursor-pointer hover:border-zinc-700 transition-colors">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-semibold text-sm">{row.ad}</span>
                      <span className="text-zinc-500 text-xs ml-auto">{TIP_LABELS[row.tip]}</span>
                    </div>
                    {account && <p className="text-zinc-600 text-xs mt-1">{account.kod} — {account.ad}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/60" onClick={() => setShowForm(false)} />
          <div className="w-full max-w-md bg-zinc-900 border-l border-zinc-800 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
              <h2 className="text-white font-semibold">{editing ? "Kategoriyi Düzenle" : "Yeni Kategori"}</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {saveError && <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">{saveError}</div>}
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Kategori Adı *</span>
                <input value={form.ad} onChange={e => setForm(f => ({ ...f, ad: e.target.value }))}
                  placeholder="örn. Yakıt Gideri"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Tip *</span>
                <select value={form.tip} onChange={e => setForm(f => ({ ...f, tip: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none">
                  {Object.entries(TIP_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Hesap</span>
                <select value={form.hesap_id} onChange={e => setForm(f => ({ ...f, hesap_id: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none">
                  <option value="">— Seçilmedi —</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.kod} — {a.ad}</option>)}
                </select>
              </label>
            </div>
            <div className="px-5 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving || !form.ad.trim()}
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
