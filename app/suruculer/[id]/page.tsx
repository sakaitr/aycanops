"use client";
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Nav from "@/components/Nav";
import ComboboxSearch from "@/components/ComboboxSearch";
import { hasPermission } from "@/lib/permissions";

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysUntil(date: string | null | undefined) {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

function expiryColor(date: string | null | undefined) {
  const d = daysUntil(date);
  if (d === null) return "text-zinc-600";
  if (d < 0) return "text-red-400";
  if (d <= 30) return "text-amber-400";
  if (d <= 90) return "text-yellow-400";
  return "text-emerald-400";
}

function expiryBg(date: string | null | undefined) {
  const d = daysUntil(date);
  if (d === null) return "border-zinc-800 bg-zinc-900";
  if (d < 0) return "border-red-800 bg-red-950";
  if (d <= 30) return "border-amber-800 bg-amber-950";
  if (d <= 90) return "border-yellow-800 bg-yellow-950";
  return "border-zinc-800 bg-zinc-900";
}

function expiryLabel(date: string | null | undefined) {
  const d = daysUntil(date);
  if (d === null) return "—";
  if (d < 0) return `${Math.abs(d)} gün önce geçti`;
  if (d === 0) return "Bugün bitiyor!";
  return `${d} gün kaldı`;
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  try { return new Intl.DateTimeFormat("tr-TR").format(new Date(d)); } catch { return d; }
}

function formatDateTime(d: string | null | undefined) {
  if (!d) return "—";
  try { return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(d)); } catch { return d; }
}

function scoreColor(score: number) {
  if (score >= 85) return { bg: "bg-emerald-950 border-emerald-800 text-emerald-300", text: "text-emerald-400", label: "İyi" };
  if (score >= 70) return { bg: "bg-yellow-950 border-yellow-800 text-yellow-300", text: "text-yellow-400", label: "Dikkat" };
  if (score >= 50) return { bg: "bg-orange-950 border-orange-800 text-orange-300", text: "text-orange-400", label: "Sorunlu" };
  return { bg: "bg-red-950 border-red-800 text-red-300", text: "text-red-400", label: "Kritik" };
}

const SEVERITY_LABELS: Record<number, string> = { 1: "Hafif", 2: "Orta", 3: "Ağır", 4: "Çok Ağır" };
const SEVERITY_DEDUCTS: Record<number, number> = { 1: 5, 2: 15, 3: 25, 4: 40 };
const SEVERITY_COLORS: Record<number, string> = {
  1: "bg-yellow-950 border-yellow-800 text-yellow-300",
  2: "bg-orange-950 border-orange-800 text-orange-300",
  3: "bg-red-950 border-red-800 text-red-300",
  4: "bg-red-950 border-red-700 text-red-200",
};

const STATUS_OPTS = [
  { value: "aktif", label: "Aktif" },
  { value: "pasif", label: "Pasif" },
  { value: "izinli", label: "İzinli" },
];

type Driver = {
  id: string; name: string; phone: string; email: string; tc_no: string; birth_date: string;
  license_number: string; license_class: string;
  license_expiry: string; src_expiry: string; psiko_expiry: string; health_expiry: string;
  status: string; notes: string; company_id: string; company_name: string;
  created_at: string; updated_at: string;
  score: number; total_deduction: number;
  current_vehicle: { id: string; plate: string; type: string; brand: string; model: string } | null;
  records: { id: number; incident_date: string; category: string; severity: number; description: string; action_taken: string }[];
  assignments: { id: number; vehicle_plate: string; vehicle_type: string; assigned_at: string; unassigned_at: string | null; note: string | null }[];
  transfers: { id: string; title: string; transfer_date: string; status: string; company_name: string; pickup_location: string; dropoff_location: string }[];
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SuruculerDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [user, setUser] = useState<any>(null);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<"genel" | "belgeler" | "gecmis" | "sicil" | "transferler">("genel");

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Driver>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Delete confirm
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data);
      else router.replace("/login");
    });
    fetch("/api/companies?limit=9999").then(r => r.json()).then(d => { if (d.ok) setCompanies(d.data); });
  }, []);

  useEffect(() => { if (id) load(); }, [id]);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/suruculer/${id}`);
      const d = await r.json();
      if (!d.ok) { setNotFound(true); return; }
      setDriver(d.data);
    } finally { setLoading(false); }
  }

  function startEdit() {
    if (!driver) return;
    setEditForm({
      name: driver.name, phone: driver.phone, email: driver.email,
      tc_no: driver.tc_no, birth_date: driver.birth_date?.slice(0, 10) ?? "",
      license_number: driver.license_number, license_class: driver.license_class,
      license_expiry: driver.license_expiry?.slice(0, 10) ?? "",
      src_expiry: driver.src_expiry?.slice(0, 10) ?? "",
      psiko_expiry: driver.psiko_expiry?.slice(0, 10) ?? "",
      health_expiry: driver.health_expiry?.slice(0, 10) ?? "",
      status: driver.status, notes: driver.notes, company_id: driver.company_id,
    });
    setSaveError(null);
    setEditing(true);
  }

  async function saveEdit() {
    if (!editForm.name?.trim()) { setSaveError("Ad zorunludur"); return; }
    setSaving(true); setSaveError(null);
    try {
      const res = await fetch(`/api/suruculer/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const d = await res.json();
      if (!d.ok) { setSaveError(d.error || "Kayıt hatası"); return; }
      setEditing(false);
      load();
    } finally { setSaving(false); }
  }

  async function deleteDriver() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/suruculer/${id}`, { method: "DELETE" });
      const d = await res.json();
      if (d.ok) router.replace("/suruculer");
    } finally { setDeleting(false); }
  }

  const canEdit = hasPermission(user, "drivers:update");

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <>
        <Nav user={user} />
        <div className="min-h-screen bg-zinc-950 pt-16 flex items-center justify-center">
          <div className="text-zinc-500">Yükleniyor...</div>
        </div>
      </>
    );
  }

  if (notFound || !driver) {
    return (
      <>
        <Nav user={user} />
        <div className="min-h-screen bg-zinc-950 pt-16 flex flex-col items-center justify-center gap-4">
          <p className="text-zinc-400 text-lg">Sürücü bulunamadı</p>
          <button onClick={() => router.push("/suruculer")} className="text-sm text-white bg-zinc-800 px-4 py-2 rounded-xl hover:bg-zinc-700">
            ← Listeye Dön
          </button>
        </div>
      </>
    );
  }

  const score = Math.max(0, driver.score ?? 100);
  const sc = scoreColor(score);
  const initials = driver.name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();

  const TABS = [
    { key: "genel", label: "Genel" },
    { key: "belgeler", label: "Belgeler" },
    { key: "gecmis", label: `Araç Geçmişi (${driver.assignments?.length ?? 0})` },
    { key: "sicil", label: `Sicil (${driver.records?.length ?? 0})` },
    { key: "transferler", label: `Transferler (${driver.transfers?.length ?? 0})` },
  ] as const;

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-4xl mx-auto px-4 py-6">

          {/* Back */}
          <button onClick={() => router.push("/suruculer")} className="flex items-center gap-1.5 text-zinc-500 hover:text-white text-sm mb-5 transition-colors">
            ← Sürücüler
          </button>

          {/* Hero header */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-16 h-16 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xl shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-white">{driver.name}</h1>
              {driver.phone && <p className="text-zinc-400 text-sm">{driver.phone}</p>}
              {driver.company_name && <p className="text-zinc-500 text-sm">{driver.company_name}</p>}
              {driver.current_vehicle && (
                <p className="text-zinc-400 text-sm mt-0.5">
                  <span className="text-zinc-600">Araç:</span>{" "}
                  <span className="font-mono">{driver.current_vehicle.plate}</span>
                  {driver.current_vehicle.type && ` · ${driver.current_vehicle.type}`}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-sm font-bold px-3 py-1.5 rounded-xl border ${sc.bg}`}>
                {score} · {sc.label}
              </span>
              {driver.status !== "aktif" && (
                <span className={`text-xs px-2 py-1 rounded-lg border ${
                  driver.status === "pasif" ? "bg-zinc-800 text-zinc-500 border-zinc-700" : "bg-blue-950 text-blue-300 border-blue-800"
                }`}>
                  {driver.status === "pasif" ? "Pasif" : "İzinli"}
                </span>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-0.5 bg-zinc-900 border border-zinc-800 rounded-xl p-1 mb-4 overflow-x-auto">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 text-xs font-medium px-3 py-2 rounded-lg transition-colors whitespace-nowrap ${
                  tab === t.key ? "bg-white text-zinc-950" : "text-zinc-500 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl">

            {/* ── GENEL ─────────────────────────────────────────────────────── */}
            {tab === "genel" && (
              <div className="p-5">
                {!editing ? (
                  <>
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-white font-semibold">Genel Bilgiler</h2>
                      {canEdit && (
                        <button onClick={startEdit} className="text-xs text-white bg-zinc-800 px-3 py-1.5 rounded-lg hover:bg-zinc-700 transition-colors">
                          Düzenle
                        </button>
                      )}
                    </div>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                      {[
                        { label: "Ad Soyad", value: driver.name },
                        { label: "Telefon", value: driver.phone || "—" },
                        { label: "E-posta", value: driver.email || "—" },
                        { label: "TC Kimlik No", value: driver.tc_no || "—" },
                        { label: "Doğum Tarihi", value: formatDate(driver.birth_date) },
                        { label: "Durum", value: STATUS_OPTS.find(o => o.value === driver.status)?.label ?? driver.status },
                        { label: "Firma", value: driver.company_name || "—" },
                        { label: "Kayıt Tarihi", value: formatDateTime(driver.created_at) },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <dt className="text-zinc-500 text-xs font-medium mb-0.5">{label}</dt>
                          <dd className="text-white text-sm">{value}</dd>
                        </div>
                      ))}
                      {driver.notes && (
                        <div className="sm:col-span-2">
                          <dt className="text-zinc-500 text-xs font-medium mb-0.5">Notlar</dt>
                          <dd className="text-white text-sm whitespace-pre-wrap">{driver.notes}</dd>
                        </div>
                      )}
                    </dl>

                    {canEdit && (
                      <div className="mt-6 pt-4 border-t border-zinc-800">
                        <button
                          onClick={() => setShowDelete(true)}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors"
                        >
                          Sürücüyü Pasife Al / Sil
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-white font-semibold">Düzenleme Modu</h2>
                    </div>
                    {saveError && (
                      <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg mb-4">{saveError}</div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="sm:col-span-2 block">
                        <span className="text-zinc-400 text-xs font-medium mb-1 block">Ad Soyad *</span>
                        <input value={editForm.name ?? ""} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                          className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                      </label>
                      <label className="block">
                        <span className="text-zinc-400 text-xs font-medium mb-1 block">Telefon</span>
                        <input value={editForm.phone ?? ""} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                          className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                      </label>
                      <label className="block">
                        <span className="text-zinc-400 text-xs font-medium mb-1 block">E-posta</span>
                        <input type="email" value={editForm.email ?? ""} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                          className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                      </label>
                      <label className="block">
                        <span className="text-zinc-400 text-xs font-medium mb-1 block">TC Kimlik No</span>
                        <input value={editForm.tc_no ?? ""} onChange={e => setEditForm(f => ({ ...f, tc_no: e.target.value }))}
                          maxLength={11} className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                      </label>
                      <label className="block">
                        <span className="text-zinc-400 text-xs font-medium mb-1 block">Doğum Tarihi</span>
                        <input type="date" value={editForm.birth_date ?? ""} onChange={e => setEditForm(f => ({ ...f, birth_date: e.target.value }))}
                          className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                      </label>
                      <label className="block">
                        <span className="text-zinc-400 text-xs font-medium mb-1 block">Durum</span>
                        <select value={editForm.status ?? "aktif"} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                          className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                          {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-zinc-400 text-xs font-medium mb-1 block">Firma</span>
                        <ComboboxSearch
                          options={companies.map(c => ({ value: c.id, label: c.name }))}
                          value={editForm.company_id ?? ""}
                          onChange={v => setEditForm(f => ({ ...f, company_id: v }))}
                          placeholder="Firma seç..."
                          emptyLabel="— Firma Yok —"
                        />
                      </label>
                      <label className="sm:col-span-2 block">
                        <span className="text-zinc-400 text-xs font-medium mb-1 block">Notlar</span>
                        <textarea value={editForm.notes ?? ""} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                          rows={3} className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
                      </label>
                    </div>
                    <div className="flex gap-3 mt-4">
                      <button onClick={() => setEditing(false)}
                        className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors">
                        İptal
                      </button>
                      <button onClick={saveEdit} disabled={saving}
                        className="flex-1 bg-white text-zinc-950 font-semibold text-sm py-2.5 rounded-xl hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                        {saving ? "Kaydediliyor..." : "Kaydet"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── BELGELER ──────────────────────────────────────────────────── */}
            {tab === "belgeler" && (
              <div className="p-5">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-white font-semibold">Belge Bilgileri</h2>
                  {canEdit && !editing && (
                    <button onClick={startEdit} className="text-xs text-white bg-zinc-800 px-3 py-1.5 rounded-lg hover:bg-zinc-700 transition-colors">
                      Düzenle
                    </button>
                  )}
                </div>

                {!editing ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { label: "Ehliyet No", value: driver.license_number || "—" },
                      { label: "Ehliyet Sınıfı", value: driver.license_class || "—" },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-zinc-800/50 border border-zinc-800 rounded-xl p-4">
                        <p className="text-zinc-500 text-xs font-medium mb-1">{label}</p>
                        <p className="text-white text-sm font-mono">{value}</p>
                      </div>
                    ))}

                    {[
                      { label: "Ehliyet Geçerlilik", date: driver.license_expiry },
                      { label: "SRC Belgesi", date: driver.src_expiry },
                      { label: "Psikoteknik", date: driver.psiko_expiry },
                      { label: "Sağlık Raporu", date: driver.health_expiry },
                    ].map(({ label, date }) => (
                      <div key={label} className={`border rounded-xl p-4 ${expiryBg(date)}`}>
                        <p className="text-zinc-500 text-xs font-medium mb-1">{label}</p>
                        <p className={`text-lg font-bold ${expiryColor(date)}`}>{formatDate(date)}</p>
                        <p className={`text-xs mt-0.5 ${expiryColor(date)}`}>{expiryLabel(date)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-zinc-400 text-xs font-medium mb-1 block">Ehliyet Numarası</span>
                      <input value={editForm.license_number ?? ""} onChange={e => setEditForm(f => ({ ...f, license_number: e.target.value }))}
                        className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 font-mono" />
                    </label>
                    <label className="block">
                      <span className="text-zinc-400 text-xs font-medium mb-1 block">Ehliyet Sınıfı</span>
                      <select value={editForm.license_class ?? ""} onChange={e => setEditForm(f => ({ ...f, license_class: e.target.value }))}
                        className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                        <option value="">Seç...</option>
                        {["B", "C", "C1", "D", "D1", "DE"].map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                    {[
                      { key: "license_expiry", label: "Ehliyet Geçerlilik" },
                      { key: "src_expiry", label: "SRC Belgesi" },
                      { key: "psiko_expiry", label: "Psikoteknik" },
                      { key: "health_expiry", label: "Sağlık Raporu" },
                    ].map(({ key, label }) => (
                      <label key={key} className="block">
                        <span className="text-zinc-400 text-xs font-medium mb-1 block">{label}</span>
                        <input type="date" value={(editForm as any)[key] ?? ""} min={new Date().toISOString().split("T")[0]}
                          onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                          className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                      </label>
                    ))}
                    <div className="sm:col-span-2 flex gap-3 mt-2">
                      <button onClick={() => setEditing(false)}
                        className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors">İptal</button>
                      <button onClick={saveEdit} disabled={saving}
                        className="flex-1 bg-white text-zinc-950 font-semibold text-sm py-2.5 rounded-xl hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                        {saving ? "Kaydediliyor..." : "Kaydet"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── ARAÇ GEÇMİŞİ ─────────────────────────────────────────────── */}
            {tab === "gecmis" && (
              <div className="p-5">
                <h2 className="text-white font-semibold mb-4">Araç Atama Geçmişi</h2>
                {!driver.assignments?.length ? (
                  <p className="text-zinc-500 text-sm">Henüz araç ataması yok</p>
                ) : (
                  <div className="space-y-2">
                    {driver.assignments.map(a => (
                      <div key={a.id} className="bg-zinc-800/50 border border-zinc-800 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <p className="text-white text-sm font-mono font-medium">{a.vehicle_plate}</p>
                          {a.vehicle_type && <p className="text-zinc-500 text-xs">{a.vehicle_type}</p>}
                          {a.note && <p className="text-zinc-500 text-xs italic mt-0.5">{a.note}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-zinc-400 text-xs">{formatDateTime(a.assigned_at)}</p>
                          <p className="text-zinc-600 text-xs">
                            {a.unassigned_at ? `→ ${formatDateTime(a.unassigned_at)}` : "→ Hâlâ atanmış"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── SİCİL ─────────────────────────────────────────────────────── */}
            {tab === "sicil" && (
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-white font-semibold">Sürücü Sicil</h2>
                  <span className={`text-sm font-bold px-3 py-1.5 rounded-xl border ${sc.bg}`}>
                    Puan: {score}
                  </span>
                </div>
                {!driver.records?.length ? (
                  <p className="text-zinc-500 text-sm">Sicil kaydı yok</p>
                ) : (
                  <div className="space-y-3">
                    {driver.records.map(rec => {
                      const deduct = SEVERITY_DEDUCTS[rec.severity] ?? 0;
                      return (
                        <div key={rec.id} className="bg-zinc-800/50 border border-zinc-800 rounded-xl p-4">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex gap-2 flex-wrap">
                              <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${SEVERITY_COLORS[rec.severity] ?? "bg-zinc-800 border-zinc-700 text-zinc-400"}`}>
                                {SEVERITY_LABELS[rec.severity] ?? `Seviye ${rec.severity}`}
                              </span>
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded border bg-zinc-800 border-zinc-700 text-zinc-400">
                                {rec.category}
                              </span>
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded border bg-red-950 border-red-800 text-red-300">
                                -{deduct} puan
                              </span>
                            </div>
                            <span className="text-zinc-500 text-xs shrink-0">{formatDate(rec.incident_date)}</span>
                          </div>
                          <p className="text-zinc-300 text-sm">{rec.description}</p>
                          {rec.action_taken && (
                            <p className="text-zinc-500 text-xs mt-1 italic">Aksiyon: {rec.action_taken}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── TRANSFERLER ───────────────────────────────────────────────── */}
            {tab === "transferler" && (
              <div className="p-5">
                <h2 className="text-white font-semibold mb-4">Transfer Geçmişi</h2>
                {!driver.transfers?.length ? (
                  <p className="text-zinc-500 text-sm">Transfer kaydı yok</p>
                ) : (
                  <div className="space-y-2">
                    {driver.transfers.map(t => (
                      <div key={t.id} className="bg-zinc-800/50 border border-zinc-800 rounded-xl px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-white text-sm font-medium">{t.title || "Transfer"}</p>
                            {t.company_name && <p className="text-zinc-500 text-xs">{t.company_name}</p>}
                            {(t.pickup_location || t.dropoff_location) && (
                              <p className="text-zinc-600 text-xs mt-0.5">
                                {t.pickup_location} → {t.dropoff_location}
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-zinc-400 text-xs">{formatDate(t.transfer_date)}</p>
                            <span className="text-[10px] px-1.5 py-0.5 rounded border bg-zinc-800 border-zinc-700 text-zinc-400">{t.status}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirm modal */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-white font-semibold mb-2">Sürücüyü Pasife Al</h3>
            <p className="text-zinc-400 text-sm mb-5">
              <strong className="text-white">{driver.name}</strong> pasife alınacak. Araç ataması kaldırılır. Bu işlem geri alınabilir.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDelete(false)}
                className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700">
                İptal
              </button>
              <button onClick={deleteDriver} disabled={deleting}
                className="flex-1 bg-red-700 text-white font-semibold text-sm py-2.5 rounded-xl hover:bg-red-600 disabled:opacity-50">
                {deleting ? "İşleniyor..." : "Pasife Al"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
