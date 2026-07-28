"use client";
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Nav from "@/components/Nav";
import Badge from "@/components/Badge";
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

function formatTL(n: number | null | undefined) {
  if (!n) return "—";
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(n);
}

const TYPE_LABELS: Record<string, string> = { minibus: "Minibüs", midibus: "Midibüs", otobus: "Otobüs", sedan: "Sedan" };
const DOC_TYPES_VEHICLE = [
  { value: "muayene", label: "Muayene" },
  { value: "sigorta", label: "Sigorta" },
  { value: "ruhsat", label: "Ruhsat" },
  { value: "fotograf", label: "Fotoğraf" },
  { value: "bakim", label: "Bakım Kaydı" },
];
const MAINTENANCE_TYPES: Record<string, string> = {
  general: "Genel Bakım", oil: "Yağ Değişimi", tire: "Lastik", brake: "Fren",
  filter: "Filtre", electrical: "Elektrik", body: "Kaporta", other: "Diğer",
};
const INSPECTION_RESULTS: Record<string, { label: string; cls: string }> = {
  pass: { label: "Geçti", cls: "bg-emerald-950 border-emerald-800 text-emerald-300" },
  fail: { label: "Kaldı", cls: "bg-red-950 border-red-800 text-red-300" },
  pending: { label: "Bekliyor", cls: "bg-zinc-800 border-zinc-700 text-zinc-400" },
  partial: { label: "Kısmi", cls: "bg-amber-950 border-amber-800 text-amber-300" },
};
const STATUS_OPTS = [
  { value: "active", label: "Aktif" },
  { value: "maintenance", label: "Bakımda" },
  { value: "inactive", label: "Pasif" },
];
const TYPE_OPTS = [
  { value: "minibus", label: "Minibüs" },
  { value: "midibus", label: "Midibüs" },
  { value: "otobus", label: "Otobüs" },
  { value: "sedan", label: "Sedan" },
];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AracDetayPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [user, setUser] = useState<any>(null);
  const [vehicle, setVehicle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<"genel" | "belgeler" | "bakim" | "denetimler" | "surucu" | "filo" | "gps_yakit">("genel");

  // GPS + Yakıt kartı — lazy-load
  const [gpsDevices, setGpsDevices] = useState<any[] | null>(null);
  const [fuelCards, setFuelCards] = useState<any[] | null>(null);
  const [gpsYakitLoading, setGpsYakitLoading] = useState(false);

  // Filo (kaza/ceza/arıza/sigorta/lastik) — ayrı, lazy-load
  const [filo, setFilo] = useState<{ kazalar: any[]; cezalar: any[]; arizalar: any[]; sigortalar: any[]; lastikler: any[] } | null>(null);
  const [filoLoading, setFiloLoading] = useState(false);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Add document
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [docForm, setDocForm] = useState({ doc_type: "muayene", doc_label: "", expiry_date: "", notes: "" });
  const [savingDoc, setSavingDoc] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState<number | null>(null);

  // Delete confirm
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data);
      else router.replace("/login");
    });
  }, []);

  useEffect(() => { if (id) load(); }, [id]);

  useEffect(() => {
    if (tab !== "gps_yakit" || !id || gpsDevices || fuelCards) return;
    setGpsYakitLoading(true);
    Promise.all([
      fetch(`/api/gps-cihazlari?vehicle_id=${id}`).then(r => r.json()),
      fetch(`/api/yakit-kartlari?vehicle_id=${id}`).then(r => r.json()),
    ]).then(([gpsR, yakitR]) => {
      setGpsDevices(gpsR.ok ? gpsR.data : []);
      setFuelCards(yakitR.ok ? yakitR.data : []);
    }).finally(() => setGpsYakitLoading(false));
  }, [tab, id, gpsDevices, fuelCards]);

  useEffect(() => {
    if (tab !== "filo" || !id || filo) return;
    setFiloLoading(true);
    Promise.all([
      fetch(`/api/filo/kazalar?vehicle_id=${id}`).then(r => r.json()),
      fetch(`/api/filo/cezalar?vehicle_id=${id}`).then(r => r.json()),
      fetch(`/api/filo/arizalar?vehicle_id=${id}`).then(r => r.json()),
      fetch(`/api/filo/sigortalar?vehicle_id=${id}`).then(r => r.json()),
      fetch(`/api/filo/lastikler?vehicle_id=${id}`).then(r => r.json()),
    ]).then(([kazaR, cezaR, arizaR, sigortaR, lastikR]) => {
      setFilo({
        kazalar: kazaR.ok ? kazaR.data : [],
        cezalar: cezaR.ok ? cezaR.data : [],
        arizalar: arizaR.ok ? arizaR.data : [],
        sigortalar: sigortaR.ok ? sigortaR.data : [],
        lastikler: lastikR.ok ? lastikR.data : [],
      });
    }).finally(() => setFiloLoading(false));
  }, [tab, id, filo]);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/vehicles/${id}/detail`);
      const d = await r.json();
      if (!d.ok) { setNotFound(true); return; }
      setVehicle(d.data);
    } finally { setLoading(false); }
  }

  function startEdit() {
    setEditForm({
      plate: vehicle.plate, type: vehicle.type,
      capacity: vehicle.capacity, brand: vehicle.brand || "",
      model: vehicle.model || "", year: vehicle.year || "",
      status_code: vehicle.status_code, notes: vehicle.notes || "",
      driver_name: vehicle.driver_name || "", driver_phone: vehicle.driver_phone || "",
      route_name: vehicle.route_name || "",
    });
    setSaveError(null);
    setEditing(true);
  }

  async function saveEdit() {
    if (!editForm.plate?.trim()) { setSaveError("Plaka zorunludur"); return; }
    setSaving(true); setSaveError(null);
    try {
      const res = await fetch(`/api/vehicles/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editForm, year: editForm.year ? parseInt(editForm.year) || null : null }),
      });
      const d = await res.json();
      if (!d.ok) { setSaveError(d.error || "Kayıt hatası"); return; }
      setEditing(false);
      load();
    } finally { setSaving(false); }
  }

  async function saveDoc() {
    if (!docForm.doc_type) return;
    setSavingDoc(true);
    try {
      const r = await fetch(`/api/vehicles/${id}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...docForm, expiry_date: docForm.expiry_date || null }),
      });
      const d = await r.json();
      if (d.ok) {
        setDocForm({ doc_type: "muayene", doc_label: "", expiry_date: "", notes: "" });
        setShowAddDoc(false);
        load();
      }
    } finally { setSavingDoc(false); }
  }

  async function deleteDoc(docId: number) {
    setDeletingDoc(docId);
    try {
      const r = await fetch(`/api/vehicles/${id}/documents?doc_id=${docId}`, { method: "DELETE" });
      const d = await r.json();
      if (d.ok) load();
    } finally { setDeletingDoc(null); }
  }

  async function deleteVehicle() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/vehicles/${id}`, { method: "DELETE" });
      const d = await res.json();
      if (d.ok) router.replace("/araclar");
    } finally { setDeleting(false); }
  }

  const canEdit = hasPermission(user, "vehicles:update");
  const canDelete = hasPermission(user, "vehicles:deactivate");

  // ── Render: loading / not found ───────────────────────────────────────────

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

  if (notFound || !vehicle) {
    return (
      <>
        <Nav user={user} />
        <div className="min-h-screen bg-zinc-950 pt-16 flex flex-col items-center justify-center gap-4">
          <p className="text-zinc-400 text-lg">Araç bulunamadı</p>
          <button onClick={() => router.push("/araclar")} className="text-sm text-white bg-zinc-800 px-4 py-2 rounded-xl hover:bg-zinc-700">
            ← Araçlara Dön
          </button>
        </div>
      </>
    );
  }

  const TABS = [
    { key: "genel", label: "Genel" },
    { key: "belgeler", label: `Belgeler (${vehicle.documents?.length ?? 0})` },
    { key: "bakim", label: `Bakım (${vehicle.maintenance?.length ?? 0})` },
    { key: "denetimler", label: `Denetimler (${vehicle.inspections?.length ?? 0})` },
    { key: "surucu", label: "Sürücü" },
    { key: "filo", label: "Filo" },
    { key: "gps_yakit", label: "GPS/Yakıt" },
  ] as const;

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-4xl mx-auto px-4 py-6">

          {/* Back — router.back() kullanılır (sabit /araclar değil) ki Firmalar
              ekranından araç detayına girenler geldikleri yere dönsün, listeye
              atılmasın. */}
          <button onClick={() => router.back()} className="flex items-center gap-1.5 text-zinc-500 hover:text-white text-sm mb-5 transition-colors">
            ← Geri
          </button>

          {/* Hero */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-white font-mono">{vehicle.plate}</h1>
                <Badge status={vehicle.status_code} showLabel />
              </div>
              <p className="text-zinc-400 text-sm mt-0.5">
                {TYPE_LABELS[vehicle.type] || vehicle.type} · {vehicle.capacity} kişi
                {(vehicle.brand || vehicle.model) && ` · ${[vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(" ")}`}
              </p>
              {vehicle.companies?.filter((c: any) => c.is_active).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {vehicle.companies.filter((c: any) => c.is_active).map((c: any) => (
                    <span key={c.company_id} className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 px-2 py-0.5 rounded-full">{c.company_name}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              {canEdit && !editing && (
                <button onClick={startEdit} className="text-xs text-white bg-zinc-800 px-3 py-1.5 rounded-lg hover:bg-zinc-700 transition-colors">Düzenle</button>
              )}
              {canDelete && (
                <button onClick={() => setShowDelete(true)} className="text-xs text-red-400 border border-zinc-800 px-3 py-1.5 rounded-lg hover:border-red-800 transition-colors">Sil</button>
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

          {/* Tab Content */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl">

            {/* ── GENEL ─────────────────────────────────────────────────────── */}
            {tab === "genel" && (
              <div className="p-5">
                {!editing ? (
                  <>
                    <h2 className="text-white font-semibold mb-4">Genel Bilgiler</h2>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                      {[
                        { label: "Plaka", value: vehicle.plate },
                        { label: "Tip", value: TYPE_LABELS[vehicle.type] || vehicle.type },
                        { label: "Kapasite", value: `${vehicle.capacity} kişi` },
                        { label: "Marka", value: vehicle.brand || "—" },
                        { label: "Model", value: vehicle.model || "—" },
                        { label: "Yıl", value: vehicle.year || "—" },
                        { label: "Güzergah", value: vehicle.route_name || "—" },
                        { label: "Durum", value: STATUS_OPTS.find(o => o.value === vehicle.status_code)?.label ?? vehicle.status_code },
                        { label: "Ruhsat Sahibi", value: vehicle.ruhsat_sahibi_unvan || "—" },
                        { label: "Kayıt Tarihi", value: formatDateTime(vehicle.created_at) },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <dt className="text-zinc-500 text-xs font-medium mb-0.5">{label}</dt>
                          <dd className="text-white text-sm">{value}</dd>
                        </div>
                      ))}
                      {vehicle.notes && (
                        <div className="sm:col-span-2">
                          <dt className="text-zinc-500 text-xs font-medium mb-0.5">Notlar</dt>
                          <dd className="text-white text-sm whitespace-pre-wrap">{vehicle.notes}</dd>
                        </div>
                      )}
                    </dl>

                    {/* Firmalar */}
                    {vehicle.companies?.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-zinc-800">
                        <p className="text-zinc-500 text-xs font-medium mb-2">Firma Atamaları</p>
                        <div className="flex flex-wrap gap-2">
                          {vehicle.companies.map((c: any) => (
                            <span key={c.company_id} className={`text-xs px-2 py-0.5 rounded-full border ${
                              c.is_active ? "bg-zinc-800 border-zinc-700 text-zinc-300" : "bg-zinc-900 border-zinc-800 text-zinc-600"
                            }`}>
                              {c.company_name} {!c.is_active && "(Pasif)"}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <h2 className="text-white font-semibold mb-4">Düzenleme Modu</h2>
                    {saveError && (
                      <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg mb-4">{saveError}</div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="block">
                        <span className="text-zinc-400 text-xs font-medium mb-1 block">Plaka *</span>
                        <input value={editForm.plate} onChange={e => setEditForm((f: any) => ({ ...f, plate: e.target.value.toUpperCase() }))}
                          className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 font-mono uppercase" />
                      </label>
                      <label className="block">
                        <span className="text-zinc-400 text-xs font-medium mb-1 block">Tip</span>
                        <select value={editForm.type} onChange={e => setEditForm((f: any) => ({ ...f, type: e.target.value }))}
                          className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                          {TYPE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-zinc-400 text-xs font-medium mb-1 block">Kapasite</span>
                        <input type="number" value={editForm.capacity} onChange={e => setEditForm((f: any) => ({ ...f, capacity: +e.target.value }))}
                          className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                      </label>
                      <label className="block">
                        <span className="text-zinc-400 text-xs font-medium mb-1 block">Marka</span>
                        <input value={editForm.brand} onChange={e => setEditForm((f: any) => ({ ...f, brand: e.target.value }))}
                          className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                      </label>
                      <label className="block">
                        <span className="text-zinc-400 text-xs font-medium mb-1 block">Model</span>
                        <input value={editForm.model} onChange={e => setEditForm((f: any) => ({ ...f, model: e.target.value }))}
                          className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                      </label>
                      <label className="block">
                        <span className="text-zinc-400 text-xs font-medium mb-1 block">Yıl</span>
                        <input type="number" value={editForm.year} onChange={e => setEditForm((f: any) => ({ ...f, year: e.target.value }))}
                          className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" min={1980} max={2030} />
                      </label>
                      <label className="block">
                        <span className="text-zinc-400 text-xs font-medium mb-1 block">Sürücü Adı</span>
                        <input value={editForm.driver_name} onChange={e => setEditForm((f: any) => ({ ...f, driver_name: e.target.value }))}
                          className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                      </label>
                      <label className="block">
                        <span className="text-zinc-400 text-xs font-medium mb-1 block">Sürücü Telefonu</span>
                        <input value={editForm.driver_phone} onChange={e => setEditForm((f: any) => ({ ...f, driver_phone: e.target.value }))}
                          className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                      </label>
                      <label className="block">
                        <span className="text-zinc-400 text-xs font-medium mb-1 block">Manuel Güzergah Adı</span>
                        <input value={editForm.route_name} onChange={e => setEditForm((f: any) => ({ ...f, route_name: e.target.value }))}
                          placeholder="Örn: Gebze" className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                      </label>
                      <label className="block">
                        <span className="text-zinc-400 text-xs font-medium mb-1 block">Durum</span>
                        <select value={editForm.status_code} onChange={e => setEditForm((f: any) => ({ ...f, status_code: e.target.value }))}
                          className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                          {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </label>
                      <label className="sm:col-span-2 block">
                        <span className="text-zinc-400 text-xs font-medium mb-1 block">Notlar</span>
                        <textarea value={editForm.notes} onChange={e => setEditForm((f: any) => ({ ...f, notes: e.target.value }))}
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
                  <h2 className="text-white font-semibold">Araç Belgeleri</h2>
                  {canEdit && !showAddDoc && (
                    <button
                      onClick={() => { setDocForm({ doc_type: "muayene", doc_label: "", expiry_date: "", notes: "" }); setShowAddDoc(true); }}
                      className="text-xs text-white bg-zinc-800 px-3 py-1.5 rounded-lg hover:bg-zinc-700 transition-colors"
                    >
                      + Belge Ekle
                    </button>
                  )}
                </div>

                {/* Add form */}
                {showAddDoc && (
                  <div className="bg-zinc-800/50 border border-zinc-800 rounded-xl p-4 mb-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="text-zinc-400 text-xs font-medium mb-1 block">Belge Tipi</span>
                        <select value={docForm.doc_type} onChange={e => setDocForm(f => ({ ...f, doc_type: e.target.value }))}
                          className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                          {DOC_TYPES_VEHICLE.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-zinc-400 text-xs font-medium mb-1 block">Son Geçerlilik</span>
                        <input type="date" value={docForm.expiry_date} min={new Date().toISOString().split("T")[0]} onChange={e => setDocForm(f => ({ ...f, expiry_date: e.target.value }))}
                          className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
                      </label>
                    </div>
                    <label className="block">
                      <span className="text-zinc-400 text-xs font-medium mb-1 block">Açıklama</span>
                      <input value={docForm.doc_label} onChange={e => setDocForm(f => ({ ...f, doc_label: e.target.value }))}
                        className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" placeholder="Opsiyonel..." />
                    </label>
                    <div className="flex gap-2">
                      <button onClick={saveDoc} disabled={savingDoc}
                        className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 disabled:opacity-50">
                        {savingDoc ? "Ekleniyor..." : "Ekle"}
                      </button>
                      <button onClick={() => setShowAddDoc(false)} className="text-zinc-500 hover:text-white text-sm px-3 py-2 rounded-lg border border-zinc-700">İptal</button>
                    </div>
                  </div>
                )}

                {/* Expiry cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {vehicle.documents?.length === 0 && (
                    <p className="text-zinc-500 text-sm sm:col-span-2">Henüz belge eklenmemiş</p>
                  )}
                  {vehicle.documents?.map((doc: any) => (
                    <div key={doc.id} className={`border rounded-xl p-4 ${expiryBg(doc.expiry_date)}`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-zinc-400 text-xs font-medium">
                            {DOC_TYPES_VEHICLE.find(t => t.value === doc.doc_type)?.label || doc.doc_type}
                          </p>
                          {doc.doc_label && <p className="text-zinc-500 text-xs">{doc.doc_label}</p>}
                          <p className={`text-lg font-bold mt-1 ${expiryColor(doc.expiry_date)}`}>
                            {formatDate(doc.expiry_date)}
                          </p>
                          <p className={`text-xs ${expiryColor(doc.expiry_date)}`}>{expiryLabel(doc.expiry_date)}</p>
                        </div>
                        {canEdit && (
                          <button onClick={() => deleteDoc(doc.id)} disabled={deletingDoc === doc.id}
                            className="text-zinc-600 hover:text-red-400 text-sm transition-colors">
                            {deletingDoc === doc.id ? "..." : "✕"}
                          </button>
                        )}
                      </div>
                      {doc.notes && <p className="text-zinc-500 text-xs mt-2 italic">{doc.notes}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── BAKIM ─────────────────────────────────────────────────────── */}
            {tab === "bakim" && (
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-white font-semibold">Bakım Geçmişi</h2>
                  <div className="text-right">
                    <p className="text-zinc-500 text-xs">Toplam Maliyet</p>
                    <p className="text-emerald-400 font-bold text-sm">{formatTL(vehicle.maintenance_total_cost)}</p>
                  </div>
                </div>
                {!vehicle.maintenance?.length ? (
                  <p className="text-zinc-500 text-sm">Bakım kaydı bulunamadı</p>
                ) : (
                  <div className="space-y-2">
                    {vehicle.maintenance.map((m: any) => (
                      <div key={m.id} className="bg-zinc-800/50 border border-zinc-800 rounded-xl px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-white text-sm font-medium">
                              {MAINTENANCE_TYPES[m.type] || m.type}
                            </p>
                            {m.notes && <p className="text-zinc-500 text-xs mt-0.5">{m.notes}</p>}
                            {m.technician && <p className="text-zinc-600 text-xs">Teknisyen: {m.technician}</p>}
                            {m.company_name && <p className="text-zinc-600 text-xs">Firma: {m.company_name}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-zinc-400 text-xs">{formatDate(m.maintenance_date)}</p>
                            {m.cost && <p className="text-emerald-400 text-xs font-medium">{formatTL(m.cost)}</p>}
                            {m.next_service_date && (
                              <p className={`text-xs ${expiryColor(m.next_service_date)}`}>
                                Sonraki: {formatDate(m.next_service_date)}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── DENETİMLER ────────────────────────────────────────────────── */}
            {tab === "denetimler" && (
              <div className="p-5">
                <h2 className="text-white font-semibold mb-4">Denetim Geçmişi</h2>
                {!vehicle.inspections?.length ? (
                  <p className="text-zinc-500 text-sm">Denetim kaydı bulunamadı</p>
                ) : (
                  <div className="space-y-2">
                    {vehicle.inspections.map((ins: any) => {
                      const result = INSPECTION_RESULTS[ins.result] ?? { label: ins.result, cls: "bg-zinc-800 border-zinc-700 text-zinc-400" };
                      return (
                        <div key={ins.id} className="bg-zinc-800/50 border border-zinc-800 rounded-xl px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${result.cls}`}>
                                  {result.label}
                                </span>
                                <span className="text-zinc-500 text-xs">{ins.type || "Rutin"}</span>
                              </div>
                              {ins.inspector_name && <p className="text-zinc-500 text-xs">Denetçi: {ins.inspector_name}</p>}
                              {ins.notes && <p className="text-zinc-400 text-sm mt-1">{ins.notes}</p>}
                            </div>
                            <p className="text-zinc-400 text-xs shrink-0">{formatDate(ins.inspection_date)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── SÜRÜCÜ ────────────────────────────────────────────────────── */}
            {tab === "surucu" && (
              <div className="p-5">
                <h2 className="text-white font-semibold mb-4">Sürücü Bilgileri</h2>

                {/* Normalize sürücü (drivers tablosundan) */}
                {vehicle.current_driver && (
                  <div className="bg-zinc-800/50 border border-zinc-800 rounded-xl p-4 mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">Atanmış Sürücü</p>
                      <button
                        onClick={() => router.push(`/suruculer/${vehicle.current_driver.id}`)}
                        className="text-xs text-white bg-zinc-700 hover:bg-zinc-600 px-3 py-1 rounded-lg transition-colors"
                      >
                        Profili Gör →
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-zinc-500 text-xs mb-0.5">Ad</p>
                        <p className="text-white text-sm">{vehicle.current_driver.name}</p>
                      </div>
                      <div>
                        <p className="text-zinc-500 text-xs mb-0.5">Telefon</p>
                        <p className="text-white text-sm">{vehicle.current_driver.phone || "—"}</p>
                      </div>
                      <div>
                        <p className="text-zinc-500 text-xs mb-0.5">Ehliyet Sınıfı</p>
                        <p className="text-white text-sm">{vehicle.current_driver.license_class || "—"}</p>
                      </div>
                      <div>
                        <p className="text-zinc-500 text-xs mb-0.5">Ehliyet Bitiş</p>
                        <p className={`text-sm ${expiryColor(vehicle.current_driver.license_expiry)}`}>
                          {formatDate(vehicle.current_driver.license_expiry)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Serbest metin sürücü (eski/fallback) */}
                {!vehicle.current_driver && (vehicle.driver_name || vehicle.driver_phone) && (
                  <div className="bg-zinc-800/50 border border-zinc-800 rounded-xl p-4 mb-4">
                    <p className="text-zinc-500 text-xs font-medium mb-2">Manuel Sürücü Bilgisi</p>
                    <p className="text-white text-sm">{vehicle.driver_name || "—"}</p>
                    {vehicle.driver_phone && <p className="text-zinc-500 text-sm">{vehicle.driver_phone}</p>}
                  </div>
                )}

                {!vehicle.current_driver && !vehicle.driver_name && (
                  <p className="text-zinc-500 text-sm mb-4">Atanmış sürücü yok</p>
                )}

                {/* Sürücü atama geçmişi */}
                {vehicle.driver_assignments?.length > 0 && (
                  <>
                    <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-3">Atama Geçmişi</p>
                    <div className="space-y-2">
                      {vehicle.driver_assignments.map((a: any) => (
                        <div key={a.id} className="bg-zinc-800/50 border border-zinc-800 rounded-xl px-4 py-3 flex justify-between items-start gap-3">
                          <div>
                            <p className="text-white text-sm font-medium">{a.driver_name || "—"}</p>
                            {a.driver_phone && <p className="text-zinc-500 text-xs">{a.driver_phone}</p>}
                            {a.note && <p className="text-zinc-600 text-xs italic">{a.note}</p>}
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
                  </>
                )}
              </div>
            )}

            {/* ── FİLO ──────────────────────────────────────────────────────── */}
            {tab === "filo" && (
              <div className="p-5 space-y-5">
                {filoLoading || !filo ? (
                  <p className="text-zinc-500 text-sm">Yükleniyor...</p>
                ) : (
                  <>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-white text-sm font-semibold">Kazalar ({filo.kazalar.length})</h3>
                        <button onClick={() => router.push("/filo/kazalar")} className="text-xs text-zinc-500 hover:text-white transition-colors">Tümünü Gör →</button>
                      </div>
                      {filo.kazalar.length === 0 ? (
                        <p className="text-zinc-600 text-xs">Kaza kaydı yok</p>
                      ) : (
                        <div className="space-y-1.5">
                          {filo.kazalar.slice(0, 5).map((k: any) => (
                            <div key={k.id} className="bg-zinc-800/50 border border-zinc-800 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
                              <span className="text-zinc-300 text-xs">{k.kaza_turu || "—"}{k.kusur_orani != null ? ` · Kusur %${k.kusur_orani}` : ""}</span>
                              <span className="text-zinc-500 text-xs shrink-0">{formatDate(k.tarih)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-white text-sm font-semibold">Cezalar ({filo.cezalar.length})</h3>
                        <button onClick={() => router.push("/filo/cezalar")} className="text-xs text-zinc-500 hover:text-white transition-colors">Tümünü Gör →</button>
                      </div>
                      {filo.cezalar.length === 0 ? (
                        <p className="text-zinc-600 text-xs">Ceza kaydı yok</p>
                      ) : (
                        <div className="space-y-1.5">
                          {filo.cezalar.slice(0, 5).map((c: any) => (
                            <div key={c.id} className="bg-zinc-800/50 border border-zinc-800 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
                              <span className="text-zinc-300 text-xs">{c.ceza_turu || "—"}{c.ceza_puani ? ` · ${c.ceza_puani} puan` : ""}</span>
                              <span className="text-zinc-500 text-xs shrink-0">{formatTL(c.ceza_tutari)} · {c.odendi ? "Ödendi" : "Ödenmedi"}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-white text-sm font-semibold">Arızalar ({filo.arizalar.length})</h3>
                        <button onClick={() => router.push("/filo/arizalar")} className="text-xs text-zinc-500 hover:text-white transition-colors">Tümünü Gör →</button>
                      </div>
                      {filo.arizalar.length === 0 ? (
                        <p className="text-zinc-600 text-xs">Arıza kaydı yok</p>
                      ) : (
                        <div className="space-y-1.5">
                          {filo.arizalar.slice(0, 5).map((a: any) => (
                            <div key={a.id} className="bg-zinc-800/50 border border-zinc-800 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
                              <span className="text-zinc-300 text-xs">{a.ariza_detay || "—"}</span>
                              <span className="text-zinc-500 text-xs shrink-0">{a.durum}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-white text-sm font-semibold">Sigortalar ({filo.sigortalar.length})</h3>
                        <button onClick={() => router.push("/filo/sigortalar")} className="text-xs text-zinc-500 hover:text-white transition-colors">Tümünü Gör →</button>
                      </div>
                      {filo.sigortalar.length === 0 ? (
                        <p className="text-zinc-600 text-xs">Sigorta kaydı yok</p>
                      ) : (
                        <div className="space-y-1.5">
                          {filo.sigortalar.slice(0, 5).map((s: any) => (
                            <div key={s.id} className="bg-zinc-800/50 border border-zinc-800 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
                              <span className="text-zinc-300 text-xs">{s.police_no} · {s.sigorta_turu}</span>
                              <span className={`text-xs shrink-0 ${expiryColor(s.bitis_tarihi)}`}>{formatDate(s.bitis_tarihi)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-white text-sm font-semibold">Lastik Değişimleri ({filo.lastikler.length})</h3>
                        <button onClick={() => router.push("/filo/lastikler")} className="text-xs text-zinc-500 hover:text-white transition-colors">Tümünü Gör →</button>
                      </div>
                      {filo.lastikler.length === 0 ? (
                        <p className="text-zinc-600 text-xs">Lastik değişim kaydı yok</p>
                      ) : (
                        <div className="space-y-1.5">
                          {filo.lastikler.slice(0, 5).map((l: any) => (
                            <div key={l.id} className="bg-zinc-800/50 border border-zinc-800 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
                              <span className="text-zinc-300 text-xs">{l.lastik_turu || "—"} · {l.adet} adet</span>
                              <span className="text-zinc-500 text-xs shrink-0">{formatDate(l.degisim_tarihi)} · {formatTL(l.tutar)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── GPS/YAKIT ─────────────────────────────────────────────────── */}
            {tab === "gps_yakit" && (
              <div className="p-5 space-y-5">
                {gpsYakitLoading || !gpsDevices || !fuelCards ? (
                  <p className="text-zinc-500 text-sm">Yükleniyor...</p>
                ) : (
                  <>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-white text-sm font-semibold">GPS Cihazları ({gpsDevices.length})</h3>
                        <button onClick={() => router.push("/admin/gps-cihazlari")} className="text-xs text-zinc-500 hover:text-white transition-colors">Tümünü Gör →</button>
                      </div>
                      {gpsDevices.length === 0 ? (
                        <p className="text-zinc-600 text-xs">Bu araca takılı GPS cihazı kaydı yok</p>
                      ) : (
                        <div className="space-y-1.5">
                          {gpsDevices.map((g: any) => (
                            <div key={g.id} className="bg-zinc-800/50 border border-zinc-800 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
                              <span className="text-zinc-300 text-xs">{g.gps_saglayici || "Sağlayıcı belirtilmemiş"} · IMEI: {g.imei}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${g.is_active ? "bg-emerald-950 border-emerald-800 text-emerald-300" : "bg-zinc-800 border-zinc-700 text-zinc-500"}`}>
                                {g.is_active ? "Aktif" : "Pasif"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-white text-sm font-semibold">Yakıt Kartları ({fuelCards.length})</h3>
                        <button onClick={() => router.push("/yakit-kartlari")} className="text-xs text-zinc-500 hover:text-white transition-colors">Tümünü Gör →</button>
                      </div>
                      {fuelCards.length === 0 ? (
                        <p className="text-zinc-600 text-xs">Bu araca bağlı yakıt kartı kaydı yok</p>
                      ) : (
                        <div className="space-y-1.5">
                          {fuelCards.map((k: any) => (
                            <div key={k.id} onClick={() => router.push(`/yakit-kartlari/${k.id}`)}
                              className="bg-zinc-800/50 border border-zinc-800 rounded-lg px-3 py-2 flex items-center justify-between gap-3 cursor-pointer hover:border-zinc-700">
                              <span className="text-zinc-300 text-xs font-mono">{k.kart_no} · {k.firma}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${k.is_active ? "bg-emerald-950 border-emerald-800 text-emerald-300" : "bg-zinc-800 border-zinc-700 text-zinc-500"}`}>
                                {k.is_active ? "Aktif" : "Pasif"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete modal */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-white font-semibold mb-2">Aracı Sil</h3>
            <p className="text-zinc-400 text-sm mb-5">
              <strong className="text-white font-mono">{vehicle.plate}</strong> kalıcı olarak silinecek. Bu işlem geri alınamaz.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDelete(false)} className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700">İptal</button>
              <button onClick={deleteVehicle} disabled={deleting} className="flex-1 bg-red-700 text-white font-semibold text-sm py-2.5 rounded-xl hover:bg-red-600 disabled:opacity-50">
                {deleting ? "Siliniyor..." : "Sil"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
