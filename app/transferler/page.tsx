"use client";
import { toast } from "@/lib/toast";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { hasPermission } from "@/lib/permissions";

const STAGES = [
  { key: "istek",       label: "Talep",       color: "text-zinc-400",   border: "border-zinc-700",   bg: "bg-zinc-800/40" },
  { key: "planlandı", label: "Planlandı", color: "text-blue-400",    border: "border-blue-800",   bg: "bg-blue-950/30" },
  { key: "yapılıyor",  label: "Yapılıyor",  color: "text-amber-400",  border: "border-amber-800",  bg: "bg-amber-950/30" },
  { key: "tamamlandı", label: "Tamamlandı", color: "text-emerald-400", border: "border-emerald-800", bg: "bg-emerald-950/30" },
] as const;

type Stage = typeof STAGES[number]["key"];

const EMPTY_FORM = {
  title: "", company_name: "", driver_name: "", driver_phone: "",
  pickup_location: "", dropoff_location: "", transfer_date: "", transfer_time: "",
  passenger_count: "", notes: "",
};

const todayStr = new Date().toISOString().split("T")[0];

export default function TransferlerPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data);
      else router.replace("/login");
    }).catch(() => { router.replace("/login"); });
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/transfers");
      const d = await res.json();
      if (d.ok) setTransfers(d.data);
    } finally { setLoading(false); }
  }

  function openCreate() { setForm({ ...EMPTY_FORM }); setShowForm(true); }

  async function save() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          driver_name: form.driver_name || null,
          driver_phone: form.driver_phone || null,
          pickup_location: form.pickup_location || null,
          dropoff_location: form.dropoff_location || null,
          transfer_date: form.transfer_date || null,
          transfer_time: form.transfer_time || null,
          passenger_count: form.passenger_count || null,
          notes: form.notes ? `${form.company_name ? `Firma: ${form.company_name}\n` : ""}${form.notes}` : (form.company_name ? `Firma: ${form.company_name}` : null),
        }),
      });
      const d = await res.json();
      if (d.ok) { setShowForm(false); load(); }
      else toast.error(d.error);
    } finally { setSaving(false); }
  }

  const canEdit = hasPermission(user, "transfers:update");

  const grouped = STAGES.reduce((acc, s) => {
    acc[s.key] = transfers.filter(t => t.status === s.key);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Transfer</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{transfers.length} transfer</p>
          </div>
          {canEdit && (
            <button onClick={openCreate} className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors">+ Transfer Ekle</button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-zinc-600 text-sm">Yükleniyor...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STAGES.map(stage => (
              <div key={stage.key} className="flex flex-col gap-3">
                <div className={`flex items-center justify-between px-3 py-2 rounded-lg border ${stage.border} ${stage.bg}`}>
                  <span className={`text-sm font-semibold ${stage.color}`}>{stage.label}</span>
                  <span className="text-xs text-zinc-600 bg-zinc-900 px-2 py-0.5 rounded-full">{grouped[stage.key]?.length ?? 0}</span>
                </div>
                <div className="flex flex-col gap-2 min-h-[120px]">
                  {(grouped[stage.key] ?? []).map((t: any) => (
                    <div key={t.id}
                      className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 cursor-pointer hover:border-zinc-700 transition-colors"
                      onClick={() => router.push(`/transferler/${t.id}`)}>  
                      <p className="text-white font-semibold text-sm mb-1 leading-snug">{t.title}</p>
                      {t.company_name && <p className="text-zinc-500 text-xs mb-1">{t.company_name}</p>}
                      {t.transfer_date && (
                        <p className="text-zinc-600 text-xs">{new Date(t.transfer_date + "T00:00:00").toLocaleDateString("tr-TR")}{t.transfer_time ? ` · ${t.transfer_time}` : ""}</p>
                      )}
                      {t.vehicle_plate && <p className="text-zinc-600 text-xs font-mono mt-0.5">{t.vehicle_plate}</p>}
                      {t.driver_name && <p className="text-zinc-600 text-xs mt-0.5">Sürücü: {t.driver_name}</p>}
                    </div>
                  ))}
                  {(grouped[stage.key] ?? []).length === 0 && (
                    <div className="border border-dashed border-zinc-800 rounded-xl py-8 text-center text-zinc-700 text-xs">Boş</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-start justify-center z-50 px-4 overflow-y-auto py-8">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-lg my-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Transfer Ekle</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-600 hover:text-white text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Başlık *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" placeholder="Havalimanı transferi" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Firma</label>
                <input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" placeholder="Firma adı" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Tarih</label>
                  <input type="date" value={form.transfer_date} min={todayStr} onChange={e => setForm(f => ({ ...f, transfer_date: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Saat</label>
                  <input type="time" value={form.transfer_time} onChange={e => setForm(f => ({ ...f, transfer_time: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Kalkış Noktası</label>
                  <input value={form.pickup_location} onChange={e => setForm(f => ({ ...f, pickup_location: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" placeholder="Adres veya yer" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Varış Noktası</label>
                  <input value={form.dropoff_location} onChange={e => setForm(f => ({ ...f, dropoff_location: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" placeholder="Adres veya yer" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Sürücü Adı</label>
                  <input value={form.driver_name} onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" placeholder="Ad Soyad" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Sürücü Telefonu</label>
                  <input value={form.driver_phone} onChange={e => setForm(f => ({ ...f, driver_phone: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" placeholder="05xx xxx xx xx" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Yolcu Sayısı</label>
                <input type="number" min="1" value={form.passenger_count} onChange={e => setForm(f => ({ ...f, passenger_count: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" placeholder="0" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Notlar</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving || !form.title.trim()}
                className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors">
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
