"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { toast } from "@/lib/toast";
import { hasPermission } from "@/lib/permissions";

const KAN_GRUPLARI = ["A Rh+", "A Rh-", "B Rh+", "B Rh-", "AB Rh+", "AB Rh-", "0 Rh+", "0 Rh-"];

const EMPTY_FORM = { ad: "", soyad: "", tc_no: "", cep_tel: "", kan_grubu: "", aciklama: "" };

export default function RehberlerPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showActive, setShowActive] = useState(true);

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

  useEffect(() => { load(); }, [search, showActive]);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      params.set("active", showActive ? "1" : "0");
      const r = await fetch(`/api/rehberler?${params}`);
      const d = await r.json();
      if (d.ok) setRows(d.data);
    } finally { setLoading(false); }
  }

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setSaveError(null);
    setShowForm(true);
  }

  function openEdit(r: any) {
    setEditing(r);
    setForm({
      ad: r.ad, soyad: r.soyad, tc_no: r.tc_no || "", cep_tel: r.cep_tel || "",
      kan_grubu: r.kan_grubu || "", aciklama: r.aciklama || "",
    });
    setSaveError(null);
    setShowForm(true);
  }

  async function save() {
    if (!form.ad.trim() || !form.soyad.trim()) { setSaveError("Ad ve soyad zorunludur"); return; }
    setSaving(true); setSaveError(null);
    try {
      const url = editing ? `/api/rehberler/${editing.id}` : "/api/rehberler";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!d.ok) { setSaveError(d.error || "Kayıt hatası"); return; }
      toast.success(editing ? "Güncellendi" : "Rehber eklendi");
      setShowForm(false);
      load();
    } finally { setSaving(false); }
  }

  async function deactivate(id: string) {
    if (!confirm("Bu rehber pasife alınsın mı?")) return;
    const res = await fetch(`/api/rehberler/${id}`, { method: "DELETE" });
    const d = await res.json();
    if (!d.ok) { toast.error(d.error || "Hata"); return; }
    toast.success("Pasife alındı");
    load();
  }

  const canEdit = hasPermission(user, "rehberler:update");
  const canDeactivate = hasPermission(user, "rehberler:deactivate");

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-4xl mx-auto px-4 py-6">

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Rehberler</h1>
              <p className="text-zinc-500 text-sm mt-0.5">{rows.length} rehber</p>
            </div>
            {canEdit && (
              <button onClick={openNew}
                className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors whitespace-nowrap">
                + Yeni Rehber
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 mb-6">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ad, soyad, telefon ara..."
              className="flex-1 bg-zinc-900 border border-zinc-800 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-zinc-600 placeholder-zinc-600" />
            <button onClick={() => setShowActive(v => !v)}
              className={`text-sm px-3 py-2 rounded-xl border transition-colors whitespace-nowrap ${
                showActive ? "bg-emerald-950 border-emerald-800 text-emerald-300" : "bg-zinc-900 border-zinc-800 text-zinc-500"
              }`}>
              {showActive ? "Aktif" : "Pasif"}
            </button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-16 animate-pulse" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-zinc-600">Rehber bulunamadı</div>
          ) : (
            <div className="space-y-2">
              {rows.map(r => (
                <div key={r.id} onClick={() => canEdit && openEdit(r)}
                  className={`bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-4 ${canEdit ? "cursor-pointer hover:border-zinc-700" : ""} transition-colors`}>
                  <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {r.ad.charAt(0)}{r.soyad.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm">{r.ad} {r.soyad}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {r.cep_tel && <p className="text-zinc-500 text-xs">{r.cep_tel}</p>}
                      {r.kan_grubu && <p className="text-zinc-600 text-xs">{r.kan_grubu}</p>}
                    </div>
                  </div>
                  {canDeactivate && r.is_active === 1 && (
                    <button onClick={e => { e.stopPropagation(); deactivate(r.id); }}
                      className="text-xs text-red-400 border border-zinc-800 px-3 py-1.5 rounded-lg hover:border-red-800 transition-colors shrink-0">
                      Pasife Al
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
              <h2 className="text-white font-semibold">{editing ? "Rehberi Düzenle" : "Yeni Rehber"}</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {saveError && <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">{saveError}</div>}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Ad *</span>
                  <input value={form.ad} onChange={e => setForm(f => ({ ...f, ad: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Soyad *</span>
                  <input value={form.soyad} onChange={e => setForm(f => ({ ...f, soyad: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">TC Kimlik No</span>
                  <input value={form.tc_no} onChange={e => setForm(f => ({ ...f, tc_no: e.target.value }))} maxLength={11}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Cep Telefon</span>
                  <input value={form.cep_tel} onChange={e => setForm(f => ({ ...f, cep_tel: e.target.value }))} placeholder="05xx xxx xx xx"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
              </div>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Kan Grubu</span>
                <select value={form.kan_grubu} onChange={e => setForm(f => ({ ...f, kan_grubu: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                  <option value="">— Seçilmedi —</option>
                  {KAN_GRUPLARI.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Açıklama</span>
                <textarea value={form.aciklama} onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))} rows={2}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </label>
            </div>
            <div className="px-5 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving || !form.ad.trim() || !form.soyad.trim()}
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
