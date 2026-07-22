"use client";
import { toast } from "@/lib/toast";
import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Nav from "@/components/Nav";
import { hasPermission } from "@/lib/permissions";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(v: string | null | undefined) {
  if (!v) return "—";
  try {
    return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(v));
  } catch { return v; }
}

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  try { return new Intl.DateTimeFormat("tr-TR").format(new Date(v + "T00:00:00")); } catch { return v; }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Transfer = {
  id: string; status: string; title: string;
  company_id: string | null; company_name: string | null;
  vehicle_id: string | null; vehicle_plate: string | null;
  driver_id: string | null; driver_name: string | null; driver_phone: string | null;
  driver_full_name: string | null;
  pickup_location: string | null; dropoff_location: string | null;
  transfer_date: string | null; transfer_time: string | null;
  passenger_count: number | null;
  notes: string | null;
  planned_at: string | null; planned_by_name: string | null;
  started_at: string | null; started_by_name: string | null;
  completed_at: string | null; completed_by_name: string | null;
  cancelled_at: string | null; cancelled_by_name: string | null;
  actual_passenger_count: number | null;
  completion_notes: string | null;
  cancellation_reason: string | null;
  creator_name: string | null;
  created_at: string;
};

type Vehicle = { id: string; plate: string; driver_name: string | null };
type Driver = { id: string; name: string; phone: string | null };
type Company = { id: string; name: string };

// ─── Stepper ──────────────────────────────────────────────────────────────────

const STEPS = [
  { key: "istek",      label: "Talep",     icon: "📋" },
  { key: "planlandı",  label: "Planlandı", icon: "📅" },
  { key: "yapılıyor",  label: "Devam",     icon: "🚌" },
  { key: "tamamlandı", label: "Tamamlandı",icon: "✅" },
] as const;

const STEP_ORDER: Record<string, number> = {
  istek: 0, planlandı: 1, yapılıyor: 2, tamamlandı: 3, iptal: -1,
};

function Stepper({ status }: { status: string }) {
  const currentIdx = STEP_ORDER[status] ?? 0;
  const cancelled = status === "iptal";

  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((step, idx) => {
        const done = !cancelled && currentIdx > idx;
        const active = !cancelled && currentIdx === idx;
        return (
          <div key={step.key} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors ${
                done    ? "bg-emerald-600 border-emerald-500 text-white"
                : active  ? "bg-blue-600 border-blue-500 text-white"
                : cancelled ? "bg-zinc-800 border-zinc-700 text-zinc-600"
                : "bg-zinc-900 border-zinc-700 text-zinc-600"
              }`}>
                {done ? "✓" : (idx + 1)}
              </div>
              <span className={`text-xs mt-1 font-medium ${
                done ? "text-emerald-400" : active ? "text-blue-400" : "text-zinc-600"
              }`}>{step.label}</span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 rounded transition-colors ${
                done ? "bg-emerald-700" : "bg-zinc-800"
              }`} />
            )}
          </div>
        );
      })}
      {cancelled && (
        <div className="ml-4 flex flex-col items-center">
          <div className="w-9 h-9 rounded-full bg-red-900 border-2 border-red-700 flex items-center justify-center text-sm font-bold text-red-300">✕</div>
          <span className="text-xs mt-1 text-red-400 font-medium">İptal</span>
        </div>
      )}
    </div>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({ title, done, active, children }: {
  title: string; done?: boolean; active?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl border p-5 mb-4 transition-colors ${
      active ? "border-blue-800 bg-blue-950/20"
      : done  ? "border-zinc-800 bg-zinc-900/60"
      : "border-zinc-800 bg-zinc-900/40 opacity-60"
    }`}>
      <div className="flex items-center gap-2 mb-4">
        {done && <span className="text-emerald-500 text-xs font-semibold">✓</span>}
        <h3 className={`font-semibold text-sm uppercase tracking-wider ${active ? "text-blue-400" : done ? "text-zinc-400" : "text-zinc-600"}`}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-zinc-800/50 rounded-lg px-3 py-2.5">
      <p className="text-zinc-500 text-xs mb-0.5">{label}</p>
      <p className="text-white text-sm">{value || "—"}</p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TransferDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [user, setUser] = useState<any>(null);
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ── Edit (Talep) form ──
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "", company_id: "", transfer_date: "", transfer_time: "",
    pickup_location: "", dropoff_location: "", passenger_count: "", notes: "",
  });

  // ── Planla form ──
  const [planForm, setPlanForm] = useState({
    vehicle_id: "", driver_id: "", driver_name: "", driver_phone: "",
  });

  // ── Tamamla form ──
  const [tamamlaForm, setTamamlaForm] = useState({
    actual_passenger_count: "", completion_notes: "",
  });

  // ── İptal modal ──
  const [showIptal, setShowIptal] = useState(false);
  const [iptalReason, setIptalReason] = useState("");

  const canEdit = hasPermission(user, "transfers:update");

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [me, tr, veh, drv, comp] = await Promise.all([
        fetch("/api/auth/me").then(r => r.json()),
        fetch(`/api/transfers/${id}`).then(r => r.json()),
        fetch("/api/vehicles?limit=200").then(r => r.json()),
        fetch("/api/suruculer?status=aktif&limit=200").then(r => r.json()),
        fetch("/api/companies?limit=500").then(r => r.json()),
      ]);

      if (!me.ok) { router.replace("/login"); return; }
      if (!tr.ok) { setErr(tr.error || "Transfer bulunamadı"); return; }

      setUser(me.data ?? null);
      setTransfer(tr.data);
      setVehicles(veh.data ?? []);
      setDrivers(drv.data ?? []);
      setCompanies(comp.data ?? []);

      const t: Transfer = tr.data;
      setEditForm({
        title: t.title,
        company_id: t.company_id ?? "",
        transfer_date: t.transfer_date ?? "",
        transfer_time: t.transfer_time ?? "",
        pickup_location: t.pickup_location ?? "",
        dropoff_location: t.dropoff_location ?? "",
        passenger_count: t.passenger_count ? String(t.passenger_count) : "",
        notes: t.notes ?? "",
      });
      setPlanForm({
        vehicle_id: t.vehicle_id ?? "",
        driver_id: t.driver_id ?? "",
        driver_name: t.driver_name ?? "",
        driver_phone: t.driver_phone ?? "",
      });
    } catch {
      setErr("Bağlantı hatası");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function saveEdit() {
    if (!editForm.title.trim()) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/transfers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editForm.title.trim(),
          company_id: editForm.company_id || null,
          transfer_date: editForm.transfer_date || null,
          transfer_time: editForm.transfer_time || null,
          pickup_location: editForm.pickup_location || null,
          dropoff_location: editForm.dropoff_location || null,
          passenger_count: editForm.passenger_count ? Number(editForm.passenger_count) : null,
          notes: editForm.notes || null,
        }),
      });
      const j = await r.json();
      if (j.ok) { setEditMode(false); await load(); }
      else toast.error(j.error || "Hata");
    } finally { setSaving(false); }
  }

  async function doPlanla() {
    if (!planForm.vehicle_id) { toast.error("Araç seçiniz"); return; }
    setSaving(true);
    try {
      const r = await fetch(`/api/transfers/${id}/planla`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(planForm),
      });
      const j = await r.json();
      if (j.ok) { await load(); }
      else toast.error(j.error || "Hata");
    } finally { setSaving(false); }
  }

  async function doBaslat() {
    setSaving(true);
    try {
      const r = await fetch(`/api/transfers/${id}/baslat`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = await r.json();
      if (j.ok) { await load(); }
      else toast.error(j.error || "Hata");
    } finally { setSaving(false); }
  }

  async function doTamamla() {
    setSaving(true);
    try {
      const r = await fetch(`/api/transfers/${id}/tamamla`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actual_passenger_count: tamamlaForm.actual_passenger_count || null,
          completion_notes: tamamlaForm.completion_notes || null,
        }),
      });
      const j = await r.json();
      if (j.ok) { await load(); }
      else toast.error(j.error || "Hata");
    } finally { setSaving(false); }
  }

  async function doIptal() {
    if (!iptalReason.trim()) { toast.error("İptal sebebi giriniz"); return; }
    setSaving(true);
    try {
      const r = await fetch(`/api/transfers/${id}/iptal`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancellation_reason: iptalReason.trim() }),
      });
      const j = await r.json();
      if (j.ok) { setShowIptal(false); setIptalReason(""); await load(); }
      else toast.error(j.error || "Hata");
    } finally { setSaving(false); }
  }

  // Auto-fill driver from vehicle selection
  function onVehicleChange(vid: string) {
    const v = vehicles.find(x => x.id === vid);
    setPlanForm(f => ({
      ...f,
      vehicle_id: vid,
      driver_name: f.driver_id ? f.driver_name : (v?.driver_name ?? ""),
    }));
  }

  // Auto-fill driver phone/name from driver dropdown
  function onDriverChange(did: string) {
    const d = drivers.find(x => x.id === did);
    setPlanForm(f => ({
      ...f,
      driver_id: did,
      driver_name: d?.name ?? "",
      driver_phone: d?.phone ?? "",
    }));
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950">
        <Nav user={user} />
        <div className="flex items-center justify-center py-32 text-zinc-600 text-sm">Yükleniyor...</div>
      </div>
    );
  }

  if (err || !transfer) {
    return (
      <div className="min-h-screen bg-zinc-950">
        <Nav user={user} />
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <p className="text-red-400 mb-4">{err || "Transfer bulunamadı"}</p>
          <button onClick={() => router.push("/transferler")} className="text-sm text-zinc-400 hover:text-white">← Transferlere Dön</button>
        </div>
      </div>
    );
  }

  const t = transfer;
  const status = t.status;
  const idx = STEP_ORDER[status] ?? 0;
  const cancelled = status === "iptal";
  const canCancel = canEdit && !["tamamlandı", "iptal"].includes(status);

  const StatusBadge = () => {
    const map: Record<string, string> = {
      istek: "bg-zinc-700 text-zinc-200", planlandı: "bg-blue-900 text-blue-200",
      yapılıyor: "bg-amber-900 text-amber-200", tamamlandı: "bg-emerald-900 text-emerald-200",
      iptal: "bg-red-900 text-red-300",
    };
    const labels: Record<string, string> = {
      istek: "Talep", planlandı: "Planlandı", yapılıyor: "Yapılıyor",
      tamamlandı: "Tamamlandı", iptal: "İptal Edildi",
    };
    return (
      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${map[status] ?? "bg-zinc-800 text-zinc-300"}`}>
        {labels[status] ?? status}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div className="flex-1 min-w-0">
            <button onClick={() => router.push("/transferler")}
              className="text-zinc-500 hover:text-white text-sm mb-2 flex items-center gap-1">
              ← Transfer Listesi
            </button>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-white truncate">{t.title}</h1>
              <StatusBadge />
            </div>
            {t.company_name && <p className="text-zinc-500 text-sm mt-1">{t.company_name}</p>}
          </div>
          {canCancel && (
            <button onClick={() => setShowIptal(true)}
              className="shrink-0 px-3 py-2 bg-zinc-800 text-red-400 text-sm font-medium rounded-lg hover:bg-red-950 transition-colors">
              İptal Et
            </button>
          )}
        </div>

        {/* Stepper */}
        <Stepper status={status} />

        {/* ── STEP 1: Talep Bilgileri ────────────────────────────────────── */}
        <SectionCard title="Talep Bilgileri" done={idx > 0 || cancelled} active={idx === 0 && !cancelled}>
          {!editMode ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <InfoRow label="Başlık" value={t.title} />
              <InfoRow label="Firma" value={t.company_name} />
              <InfoRow label="Tarih" value={fmtDate(t.transfer_date)} />
              <InfoRow label="Saat" value={t.transfer_time} />
              <InfoRow label="Kalkış" value={t.pickup_location} />
              <InfoRow label="Varış" value={t.dropoff_location} />
              <InfoRow label="Yolcu Sayısı" value={t.passenger_count ? `${t.passenger_count} kişi` : null} />
              {t.notes && <div className="sm:col-span-2"><InfoRow label="Notlar" value={t.notes} /></div>}
              <div className="sm:col-span-2">
                <InfoRow label="Oluşturan" value={`${t.creator_name ?? "—"} · ${fmtDateTime(t.created_at)}`} />
              </div>
              {canEdit && status === "istek" && (
                <div className="sm:col-span-2 pt-1">
                  <button onClick={() => setEditMode(true)}
                    className="px-4 py-2 bg-zinc-800 text-zinc-200 text-sm rounded-lg hover:bg-zinc-700 transition-colors">
                    Düzenle
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Başlık *</label>
                <input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Firma</label>
                <select value={editForm.company_id} onChange={e => setEditForm(f => ({ ...f, company_id: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                  <option value="">— Seç —</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Tarih</label>
                  <input type="date" value={editForm.transfer_date} min={new Date().toISOString().split("T")[0]} onChange={e => setEditForm(f => ({ ...f, transfer_date: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Saat</label>
                  <input type="time" value={editForm.transfer_time} onChange={e => setEditForm(f => ({ ...f, transfer_time: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Kalkış</label>
                  <input value={editForm.pickup_location} onChange={e => setEditForm(f => ({ ...f, pickup_location: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Varış</label>
                  <input value={editForm.dropoff_location} onChange={e => setEditForm(f => ({ ...f, dropoff_location: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Yolcu Sayısı</label>
                <input type="number" min="1" value={editForm.passenger_count} onChange={e => setEditForm(f => ({ ...f, passenger_count: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Notlar</label>
                <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setEditMode(false)}
                  className="px-4 py-2 bg-zinc-800 text-zinc-300 text-sm rounded-lg hover:bg-zinc-700">İptal</button>
                <button onClick={saveEdit} disabled={saving || !editForm.title.trim()}
                  className="px-4 py-2 bg-white text-zinc-950 text-sm font-semibold rounded-lg hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500">
                  {saving ? "Kaydediliyor..." : "Kaydet"}
                </button>
              </div>
            </div>
          )}
        </SectionCard>

        {/* ── STEP 2: Planlama ──────────────────────────────────────────────── */}
        <SectionCard title="Planlama" done={idx > 1 || (cancelled && !!t.planned_at)} active={idx === 0 && !cancelled}>
          {t.planned_at ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <InfoRow label="Araç" value={t.vehicle_plate} />
              <InfoRow label="Sürücü" value={t.driver_full_name ?? t.driver_name} />
              {t.driver_phone && <InfoRow label="Sürücü Telefonu" value={t.driver_phone} />}
              <InfoRow label="Planlandı" value={`${t.planned_by_name ?? "—"} · ${fmtDateTime(t.planned_at)}`} />
            </div>
          ) : status === "istek" && canEdit ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Araç *</label>
                <select value={planForm.vehicle_id} onChange={e => onVehicleChange(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                  <option value="">— Seç —</option>
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.plate}{v.driver_name ? ` · ${v.driver_name}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Sürücü</label>
                <select value={planForm.driver_id} onChange={e => onDriverChange(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                  <option value="">— Seç —</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name}{d.phone ? ` · ${d.phone}` : ""}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Sürücü Adı (manuel)</label>
                  <input value={planForm.driver_name} onChange={e => setPlanForm(f => ({ ...f, driver_name: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" placeholder="Ad Soyad" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Sürücü Telefonu</label>
                  <input value={planForm.driver_phone} onChange={e => setPlanForm(f => ({ ...f, driver_phone: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" placeholder="05xx..." />
                </div>
              </div>
              <button onClick={doPlanla} disabled={saving || !planForm.vehicle_id}
                className="w-full bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors">
                {saving ? "Planlanıyor..." : "Planlamayı Onayla"}
              </button>
            </div>
          ) : (
            <p className="text-zinc-600 text-sm">Henüz planlanmadı.</p>
          )}
        </SectionCard>

        {/* ── STEP 3: Operasyon ─────────────────────────────────────────────── */}
        <SectionCard title="Operasyon" done={idx > 2 || (cancelled && !!t.started_at)} active={idx === 1 && !cancelled}>
          {t.started_at ? (
            <InfoRow label="Başlatıldı" value={`${t.started_by_name ?? "—"} · ${fmtDateTime(t.started_at)}`} />
          ) : status === "planlandı" && canEdit ? (
            <div>
              <p className="text-zinc-400 text-sm mb-4">Araç ve sürücü hazır. Operasyonu başlatmak için onaylayın.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                {t.vehicle_plate && <InfoRow label="Araç" value={t.vehicle_plate} />}
                {(t.driver_full_name ?? t.driver_name) && <InfoRow label="Sürücü" value={t.driver_full_name ?? t.driver_name} />}
                {t.transfer_date && <InfoRow label="Tarih" value={`${fmtDate(t.transfer_date)}${t.transfer_time ? ` · ${t.transfer_time}` : ""}`} />}
                {(t.pickup_location || t.dropoff_location) && (
                  <InfoRow label="Güzergah" value={`${t.pickup_location || "—"} → ${t.dropoff_location || "—"}`} />
                )}
              </div>
              <button onClick={doBaslat} disabled={saving}
                className="w-full bg-amber-600 text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-amber-500 disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors">
                {saving ? "Başlatılıyor..." : "Operasyon Başladı"}
              </button>
            </div>
          ) : (
            <p className="text-zinc-600 text-sm">Planlama tamamlandıktan sonra başlatılabilir.</p>
          )}
        </SectionCard>

        {/* ── STEP 4: Tamamlama ─────────────────────────────────────────────── */}
        <SectionCard title="Tamamlama" done={idx === 3} active={idx === 2 && !cancelled}>
          {t.completed_at ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <InfoRow label="Tamamlandı" value={`${t.completed_by_name ?? "—"} · ${fmtDateTime(t.completed_at)}`} />
              {t.actual_passenger_count != null && <InfoRow label="Gerçek Yolcu Sayısı" value={`${t.actual_passenger_count} kişi`} />}
              {t.completion_notes && <div className="sm:col-span-2"><InfoRow label="Notlar" value={t.completion_notes} /></div>}
            </div>
          ) : status === "yapılıyor" && canEdit ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Gerçekleşen Yolcu Sayısı</label>
                <input type="number" min="0" value={tamamlaForm.actual_passenger_count}
                  onChange={e => setTamamlaForm(f => ({ ...f, actual_passenger_count: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500"
                  placeholder={t.passenger_count ? String(t.passenger_count) : "0"} />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Tamamlama Notu</label>
                <textarea value={tamamlaForm.completion_notes}
                  onChange={e => setTamamlaForm(f => ({ ...f, completion_notes: e.target.value }))} rows={2}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 resize-none"
                  placeholder="Varsa notlarınız..." />
              </div>
              <button onClick={doTamamla} disabled={saving}
                className="w-full bg-emerald-600 text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors">
                {saving ? "Kaydediliyor..." : "Transfer Tamamlandı"}
              </button>
            </div>
          ) : (
            <p className="text-zinc-600 text-sm">Operasyon başladıktan sonra tamamlanabilir.</p>
          )}
        </SectionCard>

        {/* ── İptal Bilgisi ─────────────────────────────────────────────────── */}
        {cancelled && (
          <div className="rounded-2xl border border-red-800 bg-red-950/30 p-5">
            <h3 className="font-semibold text-sm uppercase tracking-wider text-red-400 mb-3">İptal Bilgisi</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <InfoRow label="İptal Eden" value={t.cancelled_by_name} />
              <InfoRow label="İptal Tarihi" value={fmtDateTime(t.cancelled_at)} />
              <div className="sm:col-span-2"><InfoRow label="İptal Sebebi" value={t.cancellation_reason} /></div>
            </div>
          </div>
        )}
      </main>

      {/* ── İptal Modal ──────────────────────────────────────────────────────── */}
      {showIptal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4"
          onClick={() => setShowIptal(false)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md"
            onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-1">Transfer İptal Et</h2>
            <p className="text-zinc-500 text-sm mb-4">Bu işlem geri alınamaz.</p>
            <div className="mb-4">
              <label className="block text-xs text-zinc-500 mb-1">İptal Sebebi *</label>
              <textarea value={iptalReason} onChange={e => setIptalReason(e.target.value)} rows={3}
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 resize-none"
                placeholder="Sebebi giriniz..." autoFocus />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowIptal(false)}
                className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700">
                Vazgeç
              </button>
              <button onClick={doIptal} disabled={saving || !iptalReason.trim()}
                className="flex-1 bg-red-700 text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-red-600 disabled:bg-zinc-700 disabled:text-zinc-500">
                {saving ? "İptal Ediliyor..." : "İptal Et"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
