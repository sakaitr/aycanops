"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { toast } from "@/lib/toast";
import { hasPermission } from "@/lib/permissions";

function formatDate(d: string | null | undefined) {
  if (!d) return "";
  return new Intl.DateTimeFormat("tr-TR").format(new Date(d));
}

const EMPTY_FORM = { ad: "", oran: "", gecerlilik_baslangic: "", gecerlilik_bitis: "" };

function toDateInputValue(v: unknown): string {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v as string);
  if (Number.isNaN(d.getTime())) return typeof v === "string" ? v.slice(0, 10) : "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function VergiKoduPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
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
  }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/finans/vergi-kodu");
      const d = await r.json();
      if (d.ok) setRows(d.data);
    } finally { setLoading(false); }
  }

  function openCreate() { setEditing(null); setForm({ ...EMPTY_FORM }); setSaveError(null); setShowForm(true); }
  function openEdit(row: any) {
    setEditing(row);
    setForm({
      ad: row.ad,
      oran: String(row.oran),
      gecerlilik_baslangic: toDateInputValue(row.gecerlilik_baslangic),
      gecerlilik_bitis: toDateInputValue(row.gecerlilik_bitis),
    });
    setSaveError(null); setShowForm(true);
  }

  async function save() {
    if (!form.ad.trim() || !form.oran.trim() || !form.gecerlilik_baslangic) {
      setSaveError("Ad, oran ve geçerlilik başlangıcı zorunludur");
      return;
    }
    const oranNum = Number(form.oran);
    if (Number.isNaN(oranNum) || oranNum < 0 || oranNum > 100) {
      setSaveError("Oran 0-100 arasında bir sayı olmalıdır");
      return;
    }
    setSaving(true); setSaveError(null);
    try {
      const url = editing ? `/api/finans/vergi-kodu/${editing.id}` : "/api/finans/vergi-kodu";
      const method = editing ? "PUT" : "POST";
      const body = {
        ad: form.ad,
        oran: oranNum,
        gecerlilik_baslangic: form.gecerlilik_baslangic,
        gecerlilik_bitis: form.gecerlilik_bitis || null,
      };
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!d.ok) { setSaveError(typeof d.error === "string" ? d.error : "Kayıt hatası"); return; }
      toast.success(editing ? "Vergi kodu güncellendi" : "Vergi kodu eklendi");
      setShowForm(false);
      load();
    } finally { setSaving(false); }
  }

  const canCreate = hasPermission(user, "finans_vergi_kodu:create");

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Vergi Kodları</h1>
              <p className="text-zinc-500 text-sm mt-0.5">{rows.length} vergi kodu</p>
            </div>
            {canCreate && (
              <button onClick={openCreate} className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors whitespace-nowrap">
                + Yeni Vergi Kodu
              </button>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-16 animate-pulse" />)}</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-zinc-600">Henüz vergi kodu tanımlanmadı</div>
          ) : (
            <div className="space-y-2">
              {rows.map(row => (
                <div key={row.id} onClick={() => openEdit(row)} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 cursor-pointer hover:border-zinc-700 transition-colors">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-semibold text-sm">{row.ad}</span>
                    <span className="text-zinc-400 text-xs">%{row.oran}</span>
                  </div>
                  <p className="text-zinc-600 text-xs mt-1">
                    {formatDate(row.gecerlilik_baslangic)} - {row.gecerlilik_bitis ? formatDate(row.gecerlilik_bitis) : "açık uçlu"}
                  </p>
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
              <h2 className="text-white font-semibold">{editing ? "Vergi Kodunu Düzenle" : "Yeni Vergi Kodu"}</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {saveError && <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">{saveError}</div>}
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Ad *</span>
                <input value={form.ad} onChange={e => setForm(f => ({ ...f, ad: e.target.value }))}
                  placeholder="örn. KDV %20"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Oran (%) *</span>
                <div className="relative">
                  <input type="number" min={0} max={100} step="0.01" value={form.oran}
                    onChange={e => setForm(f => ({ ...f, oran: e.target.value }))}
                    placeholder="örn. 20"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 pr-8 rounded-lg focus:outline-none focus:border-zinc-500" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">%</span>
                </div>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Geçerlilik Başlangıcı *</span>
                  <input type="date" value={form.gecerlilik_baslangic}
                    onChange={e => setForm(f => ({ ...f, gecerlilik_baslangic: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Geçerlilik Bitişi</span>
                  <input type="date" value={form.gecerlilik_bitis}
                    onChange={e => setForm(f => ({ ...f, gecerlilik_bitis: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving || !form.ad.trim() || !form.oran.trim() || !form.gecerlilik_baslangic}
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
