"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import ComboboxSearch from "@/components/ComboboxSearch";
import { toast } from "@/lib/toast";
import { hasPermission } from "@/lib/permissions";

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("tr-TR").format(new Date(d));
}

const EMPTY_FORM = {
  cinsi: "HGS", musteri_no: "", vehicle_id: "", isleten_id: "", etiket_no: "",
  banka: "", bakiye: "", hesap_acilis_tarihi: "", notlar: "",
};

export default function HgsOgsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [isletenler, setIsletenler] = useState<any[]>([]);
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
    fetch("/api/vehicles?limit=500").then(r => r.json()).then(d => { if (d.ok) setVehicles(d.data); });
    fetch("/api/isletenler?limit=500").then(r => r.json()).then(d => { if (d.ok) setIsletenler(d.data); });
  }, []);

  useEffect(() => { load(); }, [durumFilter]);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (durumFilter) params.set("is_active", durumFilter);
      const r = await fetch(`/api/hgs-ogs?${params}`);
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
      cinsi: row.cinsi || "HGS", musteri_no: row.musteri_no || "", vehicle_id: row.vehicle_id || "",
      isleten_id: row.isleten_id || "", etiket_no: row.etiket_no || "", banka: row.banka || "",
      bakiye: row.bakiye != null ? String(row.bakiye) : "", hesap_acilis_tarihi: row.hesap_acilis_tarihi || "",
      notlar: row.notlar || "",
    });
    setSaveError(null);
    setShowForm(true);
  }

  async function save() {
    if (!form.etiket_no.trim()) { setSaveError("Etiket no zorunludur"); return; }
    setSaving(true); setSaveError(null);
    try {
      const url = editing ? `/api/hgs-ogs/${editing.id}` : "/api/hgs-ogs";
      const method = editing ? "PUT" : "POST";
      const body = { ...form, bakiye: form.bakiye ? Number(form.bakiye) : 0 };
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!d.ok) { setSaveError(d.error || "Kayıt hatası"); return; }
      toast.success(editing ? "Etiket güncellendi" : "Etiket eklendi");
      setShowForm(false);
      load();
    } finally { setSaving(false); }
  }

  async function toggleActive(row: any) {
    const res = await fetch(`/api/hgs-ogs/${row.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "durum-degistir", is_active: !row.is_active }),
    });
    const d = await res.json();
    if (!d.ok) { toast.error(d.error || "Hata"); return; }
    toast.success(row.is_active ? "Etiket pasife alındı" : "Etiket aktifleştirildi");
    load();
  }

  const canCreate = hasPermission(user, "hgs_ogs:create");

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-4xl mx-auto px-4 py-6">

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">HGS / OGS</h1>
              <p className="text-zinc-500 text-sm mt-0.5">{rows.length} etiket</p>
            </div>
            {canCreate && (
              <button onClick={openCreate}
                className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors whitespace-nowrap">
                + Yeni Etiket
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
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-16 animate-pulse" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-zinc-600">
              <p>Henüz HGS/OGS kaydı yok</p>
              <p className="text-xs mt-1">Araçların geçiş etiketlerini ve bakiyelerini burada takip edebilirsiniz</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map(row => (
                <div key={row.id} onClick={() => openEdit(row)} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 cursor-pointer hover:border-zinc-700 transition-colors">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      row.cinsi === "HGS" ? "bg-indigo-950 border-indigo-800 text-indigo-300" : "bg-blue-950 border-blue-800 text-blue-300"
                    }`}>
                      {row.cinsi}
                    </span>
                    <span className="text-white font-mono font-semibold text-sm">{row.etiket_no}</span>
                    {row.plate && <span className="text-zinc-400 font-mono text-xs">{row.plate}</span>}
                    {row.isleten_unvan && <span className="text-zinc-500 text-xs">· {row.isleten_unvan}</span>}
                    <span className="text-zinc-300 text-xs ml-auto font-semibold">₺{Number(row.bakiye || 0).toLocaleString("tr-TR")}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      row.is_active ? "bg-emerald-950 border-emerald-800 text-emerald-300" : "bg-zinc-800 border-zinc-700 text-zinc-500"
                    }`}>
                      {row.is_active ? "Aktif" : "Pasif"}
                    </span>
                  </div>
                  <p className="text-zinc-600 text-xs mt-1">
                    {row.banka ? `${row.banka} · ` : ""}{row.hesap_acilis_tarihi ? `Açılış: ${formatDate(row.hesap_acilis_tarihi)}` : ""}
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
              <h2 className="text-white font-semibold">{editing ? "Etiketi Düzenle" : "Yeni HGS/OGS"}</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {saveError && <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">{saveError}</div>}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Cinsi</span>
                  <select value={form.cinsi} onChange={e => setForm(f => ({ ...f, cinsi: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                    <option value="HGS">HGS</option>
                    <option value="OGS">OGS</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Etiket No *</span>
                  <input value={form.etiket_no} onChange={e => setForm(f => ({ ...f, etiket_no: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
              </div>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Müşteri No</span>
                <input value={form.musteri_no} onChange={e => setForm(f => ({ ...f, musteri_no: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Araç</span>
                <ComboboxSearch options={vehicles.map((v: any) => ({ value: v.id, label: v.plate }))}
                  value={form.vehicle_id} onChange={v => setForm(f => ({ ...f, vehicle_id: v }))}
                  placeholder="Araç seç..." emptyLabel="— Araç Yok —" />
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">İşleten</span>
                <ComboboxSearch options={isletenler.map((i: any) => ({ value: i.id, label: i.unvan }))}
                  value={form.isleten_id} onChange={v => setForm(f => ({ ...f, isleten_id: v }))}
                  placeholder="İşleten seç..." emptyLabel="— İşleten Yok —" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Banka</span>
                  <input value={form.banka} onChange={e => setForm(f => ({ ...f, banka: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Bakiye (₺)</span>
                  <input type="number" step="0.01" value={form.bakiye} onChange={e => setForm(f => ({ ...f, bakiye: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
              </div>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Hesap Açılış Tarihi</span>
                <input type="date" value={form.hesap_acilis_tarihi} onChange={e => setForm(f => ({ ...f, hesap_acilis_tarihi: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Not</span>
                <textarea value={form.notlar} onChange={e => setForm(f => ({ ...f, notlar: e.target.value }))} rows={2}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </label>
            </div>
            <div className="px-5 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving || !form.etiket_no.trim()}
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
