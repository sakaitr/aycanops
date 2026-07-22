"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { toast } from "@/lib/toast";
import { hasPermission } from "@/lib/permissions";

const EMPTY_FORM = { banka_adi: "", banka_kodu: "", swift_kodu: "" };

export default function BankaTanimlariPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [durumFilter, setDurumFilter] = useState("");

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
      const r = await fetch(`/api/admin/banka-tanimlari?${params}`);
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
    setForm({ banka_adi: row.banka_adi || "", banka_kodu: row.banka_kodu || "", swift_kodu: row.swift_kodu || "" });
    setSaveError(null);
    setShowForm(true);
  }

  async function save() {
    if (!form.banka_adi.trim()) { setSaveError("Banka adı zorunludur"); return; }
    setSaving(true); setSaveError(null);
    try {
      const url = editing ? `/api/admin/banka-tanimlari/${editing.id}` : "/api/admin/banka-tanimlari";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await res.json();
      if (!d.ok) { setSaveError(d.error || "Kayıt hatası"); return; }
      toast.success(editing ? "Banka güncellendi" : "Banka eklendi");
      setShowForm(false);
      load();
    } finally { setSaving(false); }
  }

  async function toggleActive(row: any) {
    const res = await fetch(`/api/admin/banka-tanimlari/${row.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "durum-degistir", is_active: !row.is_active }),
    });
    const d = await res.json();
    if (!d.ok) { toast.error(d.error || "Hata"); return; }
    toast.success(row.is_active ? "Banka pasife alındı" : "Banka aktifleştirildi");
    load();
  }

  const canCreate = hasPermission(user, "banka_tanimlari:create");

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Banka Tanımları</h1>
              <p className="text-zinc-500 text-sm mt-0.5">{rows.length} banka</p>
            </div>
            {canCreate && (
              <button onClick={openCreate}
                className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors whitespace-nowrap">
                + Yeni Banka
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
            <div className="text-center py-16 text-zinc-600">Henüz banka tanımlanmadı</div>
          ) : (
            <div className="space-y-2">
              {rows.map(row => (
                <div key={row.id} onClick={() => openEdit(row)} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 cursor-pointer hover:border-zinc-700 transition-colors">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-semibold text-sm">{row.banka_adi}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ml-auto ${
                      row.is_active ? "bg-emerald-950 border-emerald-800 text-emerald-300" : "bg-zinc-800 border-zinc-700 text-zinc-500"
                    }`}>
                      {row.is_active ? "Aktif" : "Pasif"}
                    </span>
                  </div>
                  <p className="text-zinc-600 text-xs mt-1 font-mono">
                    {row.banka_kodu || "—"}{row.swift_kodu ? ` · SWIFT: ${row.swift_kodu}` : ""}
                  </p>
                  {canCreate && (
                    <button onClick={e => { e.stopPropagation(); toggleActive(row); }}
                      className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors mt-2">
                      {row.is_active ? "Pasife Al" : "Aktifleştir"}
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
              <h2 className="text-white font-semibold">{editing ? "Bankayı Düzenle" : "Yeni Banka"}</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {saveError && <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">{saveError}</div>}
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Banka Adı *</span>
                <input value={form.banka_adi} onChange={e => setForm(f => ({ ...f, banka_adi: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Banka Kodu</span>
                  <input value={form.banka_kodu} onChange={e => setForm(f => ({ ...f, banka_kodu: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">SWIFT Kodu</span>
                  <input value={form.swift_kodu} onChange={e => setForm(f => ({ ...f, swift_kodu: e.target.value.toUpperCase() }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 uppercase" />
                </label>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving || !form.banka_adi.trim()}
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
