"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { toast } from "@/lib/toast";
import { hasPermission } from "@/lib/permissions";

const KATEGORILER = ["arac_tedarikci", "yakit", "sigorta", "ofis", "diger"];
const KATEGORI_LABELS: Record<string, string> = {
  arac_tedarikci: "Araç Tedarikçisi", yakit: "Yakıt", sigorta: "Sigorta", ofis: "Ofis", diger: "Diğer",
};

const EMPTY_FORM = {
  unvan: "", kategori: "diger", vergi_no: "", vergi_dairesi: "", telefon: "", email: "",
  adres: "", banka_adi: "", banka_iban: "", notlar: "",
};

export default function CariTedarikciPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [durumFilter, setDurumFilter] = useState("1");

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

  useEffect(() => { load(); }, [durumFilter]);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (durumFilter) params.set("is_active", durumFilter);
      const r = await fetch(`/api/cari-tedarikci?${params}`);
      const d = await r.json();
      if (d.ok) setRows(d.data);
    } finally { setLoading(false); }
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setSaveError(null);
    setShowForm(true);
  }

  function openEdit(row: any) {
    setEditing(row);
    setForm({
      unvan: row.unvan || "", kategori: row.kategori || "diger", vergi_no: row.vergi_no || "", vergi_dairesi: row.vergi_dairesi || "",
      telefon: row.telefon || "", email: row.email || "", adres: row.adres || "",
      banka_adi: row.banka_adi || "", banka_iban: row.banka_iban || "", notlar: row.notlar || "",
    });
    setSaveError(null);
    setShowForm(true);
  }

  async function save() {
    if (!form.unvan.trim()) { setSaveError("Ünvan zorunludur"); return; }
    setSaving(true); setSaveError(null);
    try {
      const url = editing ? `/api/cari-tedarikci/${editing.id}` : "/api/cari-tedarikci";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await res.json();
      if (!d.ok) { setSaveError(typeof d.error === "string" ? d.error : "Kayıt hatası"); return; }
      toast.success(editing ? "Cari güncellendi" : "Cari eklendi");
      setShowForm(false);
      load();
    } finally { setSaving(false); }
  }

  async function deactivate(row: any) {
    if (!confirm(`${row.unvan} pasife alınsın mı?`)) return;
    const res = await fetch(`/api/cari-tedarikci/${row.id}`, { method: "DELETE" });
    const d = await res.json();
    if (!d.ok) { toast.error(typeof d.error === "string" ? d.error : "Hata"); return; }
    toast.success("Cari pasife alındı");
    load();
  }

  const canCreate = hasPermission(user, "cari_tedarikci:create");

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Cari / Tedarikçi</h1>
              <p className="text-zinc-500 text-sm mt-0.5">{rows.length} cari — alış faturası carisi (bize fatura kesenler)</p>
            </div>
            {canCreate && (
              <button onClick={openCreate}
                className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors whitespace-nowrap">
                + Yeni Cari
              </button>
            )}
          </div>

          <div className="flex gap-2 mb-6">
            {[["", "Tümü"], ["1", "Aktif"], ["0", "Pasif"]].map(([v, l]) => (
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
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-16 animate-pulse" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-zinc-600">Henüz cari yok</div>
          ) : (
            <div className="space-y-2">
              {rows.map(row => (
                <div key={row.id} onClick={() => openEdit(row)} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 cursor-pointer hover:border-zinc-700 transition-colors">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-semibold text-sm">{row.unvan}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-400">
                      {KATEGORI_LABELS[row.kategori] || row.kategori || "Diğer"}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ml-auto ${
                      row.is_active ? "bg-emerald-950 border-emerald-800 text-emerald-300" : "bg-zinc-800 border-zinc-700 text-zinc-500"
                    }`}>
                      {row.is_active ? "Aktif" : "Pasif"}
                    </span>
                  </div>
                  <p className="text-zinc-600 text-xs mt-1">
                    {row.telefon || "—"}{row.banka_iban ? ` · ${row.banka_iban}` : ""}
                  </p>
                  {canCreate && row.is_active === 1 && (
                    <button onClick={e => { e.stopPropagation(); deactivate(row); }}
                      className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors mt-2">
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
              <h2 className="text-white font-semibold">{editing ? "Cariyi Düzenle" : "Yeni Cari"}</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {saveError && <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">{saveError}</div>}
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Ünvan *</span>
                <input value={form.unvan} onChange={e => setForm(f => ({ ...f, unvan: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Kategori</span>
                <select value={form.kategori} onChange={e => setForm(f => ({ ...f, kategori: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                  {KATEGORILER.map(k => <option key={k} value={k}>{KATEGORI_LABELS[k]}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Vergi No</span>
                  <input value={form.vergi_no} onChange={e => setForm(f => ({ ...f, vergi_no: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Vergi Dairesi</span>
                  <input value={form.vergi_dairesi} onChange={e => setForm(f => ({ ...f, vergi_dairesi: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Telefon</span>
                  <input value={form.telefon} onChange={e => setForm(f => ({ ...f, telefon: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">E-posta</span>
                  <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
              </div>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Adres</span>
                <textarea value={form.adres} onChange={e => setForm(f => ({ ...f, adres: e.target.value }))} rows={2}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Banka Adı</span>
                  <input value={form.banka_adi} onChange={e => setForm(f => ({ ...f, banka_adi: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">IBAN</span>
                  <input value={form.banka_iban} onChange={e => setForm(f => ({ ...f, banka_iban: e.target.value.toUpperCase() }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 uppercase font-mono" />
                </label>
              </div>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Notlar</span>
                <textarea value={form.notlar} onChange={e => setForm(f => ({ ...f, notlar: e.target.value }))} rows={2}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </label>
            </div>
            <div className="px-5 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving || !form.unvan.trim()}
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
