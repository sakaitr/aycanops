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

const EMPTY_FORM = { donem_adi: "", baslangic_tarihi: "", bitis_tarihi: "" };

export default function DonemTanimlariPage() {
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
      const r = await fetch(`/api/admin/donem-tanimlari?${params}`);
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
      donem_adi: row.donem_adi || "",
      baslangic_tarihi: row.baslangic_tarihi ? String(row.baslangic_tarihi).slice(0, 10) : "",
      bitis_tarihi: row.bitis_tarihi ? String(row.bitis_tarihi).slice(0, 10) : "",
    });
    setSaveError(null);
    setShowForm(true);
  }

  async function save() {
    if (!form.donem_adi.trim()) { setSaveError("Dönem adı zorunludur"); return; }
    if (!form.baslangic_tarihi || !form.bitis_tarihi) { setSaveError("Başlangıç/bitiş tarihi zorunludur"); return; }
    if (form.bitis_tarihi < form.baslangic_tarihi) { setSaveError("Bitiş tarihi başlangıçtan önce olamaz"); return; }
    setSaving(true); setSaveError(null);
    try {
      const url = editing ? `/api/admin/donem-tanimlari/${editing.id}` : "/api/admin/donem-tanimlari";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await res.json();
      if (!d.ok) { setSaveError(d.error || "Kayıt hatası"); return; }
      toast.success(editing ? "Dönem güncellendi" : "Dönem eklendi");
      setShowForm(false);
      load();
    } finally { setSaving(false); }
  }

  async function toggleActive(row: any) {
    const res = await fetch(`/api/admin/donem-tanimlari/${row.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "durum-degistir", is_active: !row.is_active }),
    });
    const d = await res.json();
    if (!d.ok) { toast.error(d.error || "Hata"); return; }
    toast.success(row.is_active ? "Dönem pasife alındı" : "Dönem aktifleştirildi");
    load();
  }

  const canCreate = hasPermission(user, "donem_tanimlari:create");

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Dönem Tanımları</h1>
              <p className="text-zinc-500 text-sm mt-0.5">{rows.length} dönem</p>
            </div>
            {canCreate && (
              <button onClick={openCreate}
                className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors whitespace-nowrap">
                + Yeni Dönem
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
            <div className="text-center py-16 text-zinc-600">Henüz dönem tanımlanmadı</div>
          ) : (
            <div className="space-y-2">
              {rows.map(row => (
                <div key={row.id} onClick={() => openEdit(row)} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 cursor-pointer hover:border-zinc-700 transition-colors">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-semibold text-sm">{row.donem_adi}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ml-auto ${
                      row.is_active ? "bg-emerald-950 border-emerald-800 text-emerald-300" : "bg-zinc-800 border-zinc-700 text-zinc-500"
                    }`}>
                      {row.is_active ? "Aktif" : "Pasif"}
                    </span>
                  </div>
                  <p className="text-zinc-600 text-xs mt-1">
                    {formatDate(row.baslangic_tarihi)} — {formatDate(row.bitis_tarihi)}
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
              <h2 className="text-white font-semibold">{editing ? "Dönemi Düzenle" : "Yeni Dönem"}</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {saveError && <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">{saveError}</div>}
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Dönem Adı *</span>
                <input value={form.donem_adi} onChange={e => setForm(f => ({ ...f, donem_adi: e.target.value }))}
                  placeholder="örn. 2026 Temmuz"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Başlangıç *</span>
                  <input type="date" value={form.baslangic_tarihi} onChange={e => setForm(f => ({ ...f, baslangic_tarihi: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Bitiş *</span>
                  <input type="date" value={form.bitis_tarihi} onChange={e => setForm(f => ({ ...f, bitis_tarihi: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
                </label>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving || !form.donem_adi.trim() || !form.baslangic_tarihi || !form.bitis_tarihi}
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
