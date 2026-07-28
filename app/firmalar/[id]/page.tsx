"use client";
import { toast } from "@/lib/toast";
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Nav from "@/components/Nav";
import { hasPermission } from "@/lib/permissions";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysUntil(date: string | null | undefined) {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

function expiryBg(date: string | null | undefined) {
  const d = daysUntil(date);
  if (d === null) return "border-zinc-800 bg-zinc-900";
  if (d < 0) return "border-red-800 bg-red-950";
  if (d <= 30) return "border-amber-800 bg-amber-950";
  if (d <= 90) return "border-yellow-800 bg-yellow-950";
  return "border-zinc-800 bg-zinc-900";
}

function expiryColor(date: string | null | undefined) {
  const d = daysUntil(date);
  if (d === null) return "text-zinc-400";
  if (d < 0) return "text-red-400";
  if (d <= 30) return "text-amber-400";
  if (d <= 90) return "text-yellow-400";
  return "text-emerald-400";
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
  try {
    return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(d));
  } catch { return d; }
}

const TRANSFER_STATUS: Record<string, { label: string; cls: string }> = {
  istek:      { label: "İstek",      cls: "bg-zinc-700 text-zinc-200" },
  planlandı:  { label: "Planlandı",  cls: "bg-blue-900 text-blue-200" },
  yapılıyor:  { label: "Yapılıyor",  cls: "bg-amber-900 text-amber-200" },
  tamamlandı: { label: "Tamamlandı", cls: "bg-emerald-900 text-emerald-200" },
  iptal:      { label: "İptal",      cls: "bg-red-900 text-red-200" },
};

type Company = {
  id: string; name: string; notes: string | null; is_active: number;
  responsible_id: string | null; responsible_name: string | null;
  sort_mode: string; phone: string | null; email: string | null;
  address: string | null; tax_id: string | null; tax_office: string | null;
  contract_start: string | null; contract_end: string | null;
  sector: string | null; website: string | null;
  created_at: string; updated_at: string;
  vehicle_count: number; passenger_count: number; transfer_count: number;
  vehicles: any[]; responsibles: any[]; passengers: any[]; transfers: any[];
};

const TABS = ["Genel", "Araçlar", "Güzergahlar", "Sorumlu Kişiler", "Personeller", "Transferler", "Belgeler"] as const;
type Tab = (typeof TABS)[number];

export default function FirmaDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [user, setUser] = useState<any>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("Genel");

  // Edit state
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Company>>({});

  // Responsible management
  const [usersList, setUsersList] = useState<any[]>([]);
  const [newResponsibleId, setNewResponsibleId] = useState("");
  const [addingResp, setAddingResp] = useState(false);
  const [removingResp, setRemovingResp] = useState<string | null>(null);

  // Vehicle management
  const [routesList, setRoutesList] = useState<{ id: string; name: string; code: string }[]>([]);
  const [driversList, setDriversList] = useState<{ id: string; name: string; phone: string | null }[]>([]);
  const [vehicleFilter, setVehicleFilter] = useState<"active" | "inactive" | "all">("active");
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [vehicleEditForm, setVehicleEditForm] = useState({ plate: "", driver_name: "", route_name: "", route_id: "", notes: "", is_temporary: false });
  const [savingVehicleEdit, setSavingVehicleEdit] = useState(false);
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [newVehicleForm, setNewVehicleForm] = useState({ plate: "", driver_name: "", route_name: "", route_id: "", notes: "", is_temporary: false });
  const [savingNewVehicle, setSavingNewVehicle] = useState(false);
  const [deletingVehicleId, setDeletingVehicleId] = useState<string | null>(null);
  const [newRouteForm, setNewRouteForm] = useState({ name: "", code: "", direction: "both", notes: "" });
  const [savingNewRoute, setSavingNewRoute] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data); else router.replace("/login");
    }).catch(() => router.replace("/login"));
  }, []);

  useEffect(() => {
    if (!id) return;
    loadCompany();
  }, [id]);

  useEffect(() => {
    fetch("/api/users?simple=1").then(r => r.json()).then(d => {
      if (d.ok) setUsersList(d.data);
    }).catch(() => {});
    fetch("/api/suruculer?status=aktif&limit=200").then(r => r.json()).then(d => {
      if (d.ok) setDriversList(d.data ?? []);
    }).catch(() => {});
  }, []);

  useEffect(() => { if (id) loadRoutes(); }, [id]);

  async function loadCompany() {
    setLoading(true);
    try {
      const r = await fetch(`/api/companies/${id}/detail`);
      const d = await r.json();
      if (d.ok) setCompany(d.data);
      else router.replace("/firmalar");
    } finally { setLoading(false); }
  }

  async function loadRoutes() {
    const r = await fetch(`/api/routes?company_id=${id}&is_active=1&limit=200`);
    const d = await r.json();
    if (d.ok) setRoutesList(d.data ?? []);
  }

  async function addNewRoute() {
    if (!newRouteForm.name.trim()) return;
    setSavingNewRoute(true);
    try {
      const r = await fetch("/api/routes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newRouteForm.name, code: newRouteForm.code || null, direction: newRouteForm.direction, company_id: id, notes: newRouteForm.notes || null }),
      });
      const d = await r.json();
      if (d.ok) { setNewRouteForm({ name: "", code: "", direction: "both", notes: "" }); loadRoutes(); }
      else toast.error(d.error);
    } finally { setSavingNewRoute(false); }
  }

  function startEdit() {
    if (!company) return;
    setEditForm({
      name: company.name,
      notes: company.notes ?? "",
      phone: company.phone ?? "",
      email: company.email ?? "",
      address: company.address ?? "",
      tax_id: company.tax_id ?? "",
      tax_office: company.tax_office ?? "",
      contract_start: company.contract_start ?? "",
      contract_end: company.contract_end ?? "",
      sector: company.sector ?? "",
      website: company.website ?? "",
      is_active: company.is_active,
      sort_mode: company.sort_mode as any,
      responsible_id: company.responsible_id ?? "",
    });
    setEditing(true);
  }

  async function saveEdit() {
    if (!company || !editForm.name?.trim()) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/companies/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          notes: editForm.notes || null,
          is_active: Boolean(editForm.is_active),
          responsible_id: editForm.responsible_id || null,
          sort_mode: editForm.sort_mode || "manual",
          phone: editForm.phone || null,
          email: editForm.email || null,
          address: editForm.address || null,
          tax_id: editForm.tax_id || null,
          tax_office: editForm.tax_office || null,
          contract_start: editForm.contract_start || null,
          contract_end: editForm.contract_end || null,
          sector: editForm.sector || null,
          website: editForm.website || null,
        }),
      });
      const d = await r.json();
      if (d.ok) { setEditing(false); loadCompany(); }
      else toast.error(d.error);
    } finally { setSaving(false); }
  }

  async function addResponsible() {
    if (!newResponsibleId) return;
    setAddingResp(true);
    try {
      const r = await fetch(`/api/companies/${id}/responsible`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: newResponsibleId }),
      });
      const d = await r.json();
      if (d.ok) { setNewResponsibleId(""); loadCompany(); }
      else toast.error(d.error);
    } finally { setAddingResp(false); }
  }

  async function removeResponsible(userId: string) {
    setRemovingResp(userId);
    try {
      const r = await fetch(`/api/companies/${id}/responsible?user_id=${userId}`, { method: "DELETE" });
      const d = await r.json();
      if (d.ok) loadCompany();
      else toast.error(d.error);
    } finally { setRemovingResp(null); }
  }

  async function saveVehicleEdit(vehicleId: string) {
    if (!vehicleEditForm.plate.trim()) return;
    setSavingVehicleEdit(true);
    try {
      const r = await fetch(`/api/companies/${id}/vehicles?vehicleId=${vehicleId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plate: vehicleEditForm.plate, driver_name: vehicleEditForm.driver_name || null, route_name: vehicleEditForm.route_name || null, route_id: vehicleEditForm.route_id || null, notes: vehicleEditForm.notes || null, is_temporary: vehicleEditForm.is_temporary }),
      });
      const d = await r.json();
      if (d.ok) { setEditingVehicleId(null); loadCompany(); }
      else toast.error(d.error);
    } finally { setSavingVehicleEdit(false); }
  }

  async function removeVehicle(vehicleId: string) {
    if (!confirm("Bu araç firmadan kaldırılsın mı? (Pasife alınır)")) return;
    setDeletingVehicleId(vehicleId);
    try {
      const r = await fetch(`/api/companies/${id}/vehicles?vehicleId=${vehicleId}`, { method: "DELETE" });
      const d = await r.json();
      if (d.ok) loadCompany();
      else toast.error(d.error);
    } finally { setDeletingVehicleId(null); }
  }

  async function hardDeleteVehicle(vehicleId: string, plate: string) {
    if (!confirm(`"${plate}" plakalı araç kalıcı olarak silinecek. Bu işlem geri alınamaz. Onaylıyor musunuz?`)) return;
    setDeletingVehicleId(vehicleId);
    try {
      const r = await fetch(`/api/companies/${id}/vehicles?vehicleId=${vehicleId}&hard=true`, { method: "DELETE" });
      const d = await r.json();
      if (d.ok) loadCompany();
      else toast.error(d.error);
    } finally { setDeletingVehicleId(null); }
  }

  async function addNewVehicle() {
    if (!newVehicleForm.plate.trim()) return;
    setSavingNewVehicle(true);
    try {
      const r = await fetch(`/api/companies/${id}/vehicles`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plate: newVehicleForm.plate, driver_name: newVehicleForm.driver_name || null, route_name: newVehicleForm.route_name || null, route_id: newVehicleForm.route_id || null, notes: newVehicleForm.notes || null, is_temporary: newVehicleForm.is_temporary }),
      });
      const d = await r.json();
      if (d.ok) { setAddingVehicle(false); setNewVehicleForm({ plate: "", driver_name: "", route_name: "", route_id: "", notes: "", is_temporary: false }); loadCompany(); }
      else toast.error(d.error);
    } finally { setSavingNewVehicle(false); }
  }

  // Eskiden sadece "yonetici"/"admin" rol adına bakıyordu — özel departman
  // rolleri (operasyon_yetkili gibi) role adı eşleşmediği için hiç düzenleme
  // yapamıyordu. companies:update izni olan herkes (firma + firmaya bağlı
  // araç/güzergah) burada düzenleyebilsin.
  const canEdit = hasPermission(user, "companies:update");

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
      <Nav user={user} />
      <p className="text-zinc-400">Yükleniyor…</p>
    </div>
  );

  if (!company) return null;

  const contractWarningBg = expiryBg(company.contract_end);
  const contractWarningColor = expiryColor(company.contract_end);

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-20">
      <Nav user={user} />
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-start gap-4 mb-6">
          <button
            onClick={() => router.push("/firmalar")}
            className="text-zinc-500 hover:text-white text-sm mt-1"
          >
            ← Firmalar
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold">{company.name}</h1>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${company.is_active ? "bg-emerald-900 text-emerald-300" : "bg-zinc-700 text-zinc-400"}`}>
                {company.is_active ? "Aktif" : "Pasif"}
              </span>
              {company.sector && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">{company.sector}</span>
              )}
            </div>
            <div className="flex gap-4 mt-2 text-sm text-zinc-500">
              <span>{company.vehicle_count} araç</span>
              <span>{company.passenger_count} personel</span>
              <span>{company.transfer_count} transfer</span>
            </div>
          </div>
          {canEdit && !editing && (
            <button onClick={startEdit} className="bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg text-sm">
              Düzenle
            </button>
          )}
        </div>

        {/* Contract expiry banner */}
        {company.contract_end && (
          <div className={`mb-5 border rounded-xl px-4 py-3 text-sm flex items-center gap-3 ${contractWarningBg}`}>
            <span className="text-lg">📄</span>
            <span className="text-zinc-300">Sözleşme bitiş:</span>
            <span className={`font-semibold ${contractWarningColor}`}>{formatDate(company.contract_end)}</span>
            <span className={`ml-auto text-xs ${contractWarningColor}`}>{expiryLabel(company.contract_end)}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-zinc-800 flex-wrap">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === t
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t}
              {t === "Araçlar" && company.vehicle_count > 0 && (
                <span className="ml-1 text-xs bg-zinc-700 text-zinc-300 px-1.5 rounded-full">{company.vehicle_count}</span>
              )}
              {t === "Güzergahlar" && routesList.length > 0 && (
                <span className="ml-1 text-xs bg-zinc-700 text-zinc-300 px-1.5 rounded-full">{routesList.length}</span>
              )}
              {t === "Personeller" && company.passenger_count > 0 && (
                <span className="ml-1 text-xs bg-zinc-700 text-zinc-300 px-1.5 rounded-full">{company.passenger_count}</span>
              )}
              {t === "Transferler" && company.transfer_count > 0 && (
                <span className="ml-1 text-xs bg-zinc-700 text-zinc-300 px-1.5 rounded-full">{company.transfer_count}</span>
              )}
            </button>
          ))}
        </div>

        {/* ─── Tab: Genel ─────────────────────────────── */}
        {activeTab === "Genel" && (
          <div>
            {editing ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
                <h2 className="text-lg font-semibold text-zinc-200 mb-2">Firma Bilgilerini Düzenle</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Firma Adı *</label>
                    <input value={editForm.name ?? ""} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Sektör</label>
                    <input value={editForm.sector ?? ""} onChange={e => setEditForm(f => ({ ...f, sector: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" placeholder="Örn: Lojistik, İnşaat" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Telefon</label>
                    <input value={editForm.phone ?? ""} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" placeholder="+90 5XX XXX XX XX" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">E-posta</label>
                    <input type="email" value={editForm.email ?? ""} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" placeholder="info@firma.com" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Vergi No</label>
                    <input value={editForm.tax_id ?? ""} onChange={e => setEditForm(f => ({ ...f, tax_id: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Vergi Dairesi</label>
                    <input value={editForm.tax_office ?? ""} onChange={e => setEditForm(f => ({ ...f, tax_office: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Website</label>
                    <input value={editForm.website ?? ""} onChange={e => setEditForm(f => ({ ...f, website: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" placeholder="https://firma.com" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Durumu</label>
                    <select value={editForm.is_active ? "1" : "0"} onChange={e => setEditForm(f => ({ ...f, is_active: Number(e.target.value) }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white">
                      <option value="1">Aktif</option>
                      <option value="0">Pasif</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Sözleşme Başlangıç</label>
                    <input type="date" value={editForm.contract_start ?? ""} onChange={e => setEditForm(f => ({ ...f, contract_start: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Sözleşme Bitiş</label>
                    <input type="date" value={editForm.contract_end ?? ""} onChange={e => setEditForm(f => ({ ...f, contract_end: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Adres</label>
                  <textarea value={editForm.address ?? ""} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))}
                    rows={2} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white resize-none" />
                </div>

                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Notlar</label>
                  <textarea value={editForm.notes ?? ""} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                    rows={3} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white resize-none" />
                </div>

                <div className="flex gap-3 pt-2">
                  <button onClick={saveEdit} disabled={saving}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                    {saving ? "Kaydediliyor…" : "Kaydet"}
                  </button>
                  <button onClick={() => setEditing(false)}
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-5 py-2 rounded-lg text-sm">
                    İptal
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <InfoCard label="Telefon" value={company.phone} />
                <InfoCard label="E-posta" value={company.email} />
                <InfoCard label="Sektör" value={company.sector} />
                <InfoCard label="Website" value={company.website} link={company.website} />
                <InfoCard label="Vergi No" value={company.tax_id} />
                <InfoCard label="Vergi Dairesi" value={company.tax_office} />
                <InfoCard label="Sözleşme Başlangıç" value={formatDate(company.contract_start)} />
                <div className={`border rounded-xl p-4 ${expiryBg(company.contract_end)}`}>
                  <p className="text-xs text-zinc-500 mb-1">Sözleşme Bitiş</p>
                  <p className={`text-sm font-medium ${expiryColor(company.contract_end)}`}>
                    {formatDate(company.contract_end)}
                  </p>
                  {company.contract_end && (
                    <p className={`text-xs mt-0.5 ${expiryColor(company.contract_end)}`}>{expiryLabel(company.contract_end)}</p>
                  )}
                </div>
                <div className="col-span-full border border-zinc-800 bg-zinc-900 rounded-xl p-4">
                  <p className="text-xs text-zinc-500 mb-1">Adres</p>
                  <p className="text-sm text-zinc-200 whitespace-pre-wrap">{company.address || "—"}</p>
                </div>
                <div className="col-span-full border border-zinc-800 bg-zinc-900 rounded-xl p-4">
                  <p className="text-xs text-zinc-500 mb-1">Notlar</p>
                  <p className="text-sm text-zinc-200 whitespace-pre-wrap">{company.notes || "—"}</p>
                </div>
                <InfoCard label="Oluşturulma" value={formatDateTime(company.created_at)} />
                <InfoCard label="Güncelleme" value={formatDateTime(company.updated_at)} />
              </div>
            )}
          </div>
        )}

        {/* ─── Tab: Araçlar ────────────────────────────── */}
        {activeTab === "Araçlar" && (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
                {([[ "active", "Aktif"], ["inactive", "Pasif"], ["all", "Tümü"]] as const).map(([val, label]) => (
                  <button key={val} onClick={() => setVehicleFilter(val)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${vehicleFilter === val ? "bg-white text-zinc-950" : "text-zinc-400 hover:text-white"}`}>
                    {label}
                    <span className="ml-1 opacity-60">
                      {val === "active" ? company.vehicles.filter((v: any) => v.is_active).length
                        : val === "inactive" ? company.vehicles.filter((v: any) => !v.is_active).length
                        : company.vehicles.length}
                    </span>
                  </button>
                ))}
              </div>
              {canEdit && !addingVehicle && (
                <button onClick={() => { setAddingVehicle(true); setNewVehicleForm({ plate: "", driver_name: "", route_name: "", route_id: "", notes: "", is_temporary: false }); }}
                  className="bg-white text-zinc-950 text-xs font-semibold px-3 py-2 rounded-lg hover:bg-zinc-200 transition-colors">
                  + Araç Ekle
                </button>
              )}
            </div>

            {/* Add new vehicle form */}
            {addingVehicle && (
              <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-zinc-300">Yeni Araç Ekle</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Plaka *</label>
                    <input value={newVehicleForm.plate} onChange={e => setNewVehicleForm(f => ({ ...f, plate: e.target.value.toUpperCase() }))}
                      placeholder="34 AB 1234" className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 uppercase" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Sürücü Adı</label>
                    <select value={newVehicleForm.driver_name} onChange={e => setNewVehicleForm(f => ({ ...f, driver_name: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                      <option value="">— Seçiniz —</option>
                      {driversList.map(d => <option key={d.id} value={d.name}>{d.name}{d.phone ? ` (${d.phone})` : ""}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Güzergah</label>
                    <select value={newVehicleForm.route_id} onChange={e => {
                      const r = routesList.find(r => r.id === e.target.value);
                      setNewVehicleForm(f => ({ ...f, route_id: e.target.value, route_name: r?.name ?? "" }));
                    }} className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                      <option value="">— Seçiniz —</option>
                      {routesList.map(r => <option key={r.id} value={r.id}>{r.name}{r.code ? ` (${r.code})` : ""}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Manuel Güzergah Adı</label>
                    <input value={newVehicleForm.route_name} onChange={e => setNewVehicleForm(f => ({ ...f, route_name: e.target.value }))}
                      placeholder="Örn: Gebze" className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Not</label>
                    <input value={newVehicleForm.notes} onChange={e => setNewVehicleForm(f => ({ ...f, notes: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newVehicleForm.is_temporary} onChange={e => setNewVehicleForm(f => ({ ...f, is_temporary: e.target.checked }))} className="rounded" />
                  <span className="text-xs text-zinc-400">Geçici araç</span>
                </label>
                <div className="flex gap-2">
                  <button onClick={addNewVehicle} disabled={savingNewVehicle || !newVehicleForm.plate.trim()}
                    className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                    {savingNewVehicle ? "Ekleniyor..." : "Ekle"}
                  </button>
                  <button onClick={() => setAddingVehicle(false)} className="text-zinc-400 hover:text-white text-sm px-3 py-2 rounded-lg border border-zinc-700 transition-colors">İptal</button>
                </div>
              </div>
            )}

            {/* Vehicle list */}
            {(() => {
              const filtered = company.vehicles.filter((v: any) =>
                vehicleFilter === "all" ? true : vehicleFilter === "active" ? v.is_active : !v.is_active
              );
              if (filtered.length === 0) return (
                <div className="text-center py-16 text-zinc-500 text-sm">
                  {vehicleFilter === "inactive" ? "Pasif araç bulunmuyor." : "Bu firmaya atanmış araç bulunamadı."}
                </div>
              );
              return (
                <div className="space-y-2">
                  {filtered.map((v: any) => (
                    <div key={v.id} className={`bg-zinc-900 border rounded-xl transition-colors ${!v.is_active ? "border-zinc-700 opacity-60" : editingVehicleId === v.id ? "border-indigo-700" : "border-zinc-800"}`}>
                      {/* Vehicle row */}
                      <div className="p-4 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-mono text-base font-bold text-white">{v.plate}</span>
                            {v.is_temporary ? (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-900 text-amber-300">Geçici</span>
                            ) : (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400">Sabit</span>
                            )}
                            {!v.is_active && <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-500">Pasif</span>}
                          </div>
                          <div className="flex gap-3 text-xs text-zinc-500 flex-wrap">
                            {v.driver_name && <span>Sürücü: {v.driver_name}</span>}
                            {v.route_name && <span>Güzergah: {v.route_name}</span>}
                            {v.notes && <span className="text-zinc-600 truncate max-w-xs">{v.notes}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button onClick={() => router.push(`/araclar/${v.vehicle_id ?? v.id}`)}
                            className="text-xs text-zinc-500 hover:text-white border border-zinc-700 hover:border-zinc-500 px-2.5 py-1.5 rounded-lg transition-colors">
                            Detay
                          </button>
                          {canEdit && (
                            <>
                              <button onClick={() => {
                                if (editingVehicleId === v.id) { setEditingVehicleId(null); return; }
                                setEditingVehicleId(v.id);
                                setVehicleEditForm({ plate: v.plate, driver_name: v.driver_name || "", route_name: v.route_name || "", route_id: v.route_id || "", notes: v.notes || "", is_temporary: Boolean(v.is_temporary) });
                              }} className={`text-xs border px-2.5 py-1.5 rounded-lg transition-colors ${editingVehicleId === v.id ? "border-indigo-600 text-indigo-400 bg-indigo-950" : "text-zinc-500 hover:text-white border-zinc-700 hover:border-zinc-500"}`}>
                                {editingVehicleId === v.id ? "✕" : "Düzenle"}
                              </button>
                              {v.is_active ? (
                                <button onClick={() => removeVehicle(v.id)} disabled={deletingVehicleId === v.id}
                                  className="text-xs text-zinc-500 hover:text-amber-400 border border-zinc-700 hover:border-amber-700 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                                  {deletingVehicleId === v.id ? "..." : "Kaldır"}
                                </button>
                              ) : (
                                <button onClick={() => hardDeleteVehicle(v.id, v.plate)} disabled={deletingVehicleId === v.id}
                                  className="text-xs text-zinc-500 hover:text-red-400 border border-zinc-700 hover:border-red-800 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                                  {deletingVehicleId === v.id ? "..." : "Kalıcı Sil"}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      {/* Inline Edit Form */}
                      {editingVehicleId === v.id && (
                        <div className="border-t border-zinc-700 px-4 pb-4 pt-3 space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs text-zinc-500 mb-1">Plaka *</label>
                              <input value={vehicleEditForm.plate} onChange={e => setVehicleEditForm(f => ({ ...f, plate: e.target.value.toUpperCase() }))}
                                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 uppercase" />
                            </div>
                            <div>
                              <label className="block text-xs text-zinc-500 mb-1">Sürücü Adı</label>
                              <select value={vehicleEditForm.driver_name} onChange={e => setVehicleEditForm(f => ({ ...f, driver_name: e.target.value }))}
                                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                                <option value="">— Seçiniz —</option>
                                {driversList.map(d => <option key={d.id} value={d.name}>{d.name}{d.phone ? ` (${d.phone})` : ""}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-zinc-500 mb-1">Güzergah</label>
                              <select value={vehicleEditForm.route_id} onChange={e => {
                                const r = routesList.find(r => r.id === e.target.value);
                                setVehicleEditForm(f => ({ ...f, route_id: e.target.value, route_name: r?.name ?? "" }));
                              }} className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                                <option value="">— Seçiniz —</option>
                                {routesList.map(r => <option key={r.id} value={r.id}>{r.name}{r.code ? ` (${r.code})` : ""}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-zinc-500 mb-1">Manuel Güzergah Adı</label>
                              <input value={vehicleEditForm.route_name} onChange={e => setVehicleEditForm(f => ({ ...f, route_name: e.target.value }))}
                                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                            </div>
                            <div>
                              <label className="block text-xs text-zinc-500 mb-1">Not</label>
                              <input value={vehicleEditForm.notes} onChange={e => setVehicleEditForm(f => ({ ...f, notes: e.target.value }))}
                                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                            </div>
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={vehicleEditForm.is_temporary} onChange={e => setVehicleEditForm(f => ({ ...f, is_temporary: e.target.checked }))} />
                            <span className="text-xs text-zinc-400">Geçici araç</span>
                          </label>
                          <div className="flex gap-2">
                            <button onClick={() => saveVehicleEdit(v.id)} disabled={savingVehicleEdit || !vehicleEditForm.plate.trim()}
                              className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                              {savingVehicleEdit ? "Kaydediliyor..." : "Kaydet"}
                            </button>
                            <button onClick={() => setEditingVehicleId(null)} className="text-zinc-400 hover:text-white text-sm px-3 py-2 rounded-lg border border-zinc-700 transition-colors">İptal</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* ─── Tab: Güzergahlar ────────────────────────── */}
        {activeTab === "Güzergahlar" && (
          <div className="space-y-4">
            {canEdit && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-zinc-300">Bu firmaya özel güzergah ekle</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input value={newRouteForm.name} onChange={e => setNewRouteForm(f => ({ ...f, name: e.target.value }))} placeholder="Güzergah adı *" className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" />
                  <input value={newRouteForm.code} onChange={e => setNewRouteForm(f => ({ ...f, code: e.target.value }))} placeholder="Kod" className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" />
                  <select value={newRouteForm.direction} onChange={e => setNewRouteForm(f => ({ ...f, direction: e.target.value }))} className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white">
                    <option value="both">Gidiş + Dönüş</option>
                    <option value="morning">Gidiş</option>
                    <option value="evening">Dönüş</option>
                  </select>
                  <input value={newRouteForm.notes} onChange={e => setNewRouteForm(f => ({ ...f, notes: e.target.value }))} placeholder="Not" className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" />
                </div>
                <button onClick={addNewRoute} disabled={savingNewRoute || !newRouteForm.name.trim()} className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 disabled:opacity-50">
                  {savingNewRoute ? "Ekleniyor..." : "Güzergah Ekle"}
                </button>
              </div>
            )}

            {routesList.length === 0 ? (
              <div className="text-center py-16 text-zinc-500 text-sm">Bu firmaya özel güzergah bulunamadı.</div>
            ) : (
              <div className="space-y-2">
                {routesList.map((r: any) => (
                  <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">{r.name}</p>
                      <p className="text-xs text-zinc-500">{r.code || "Kod yok"}{r.active_price_amount ? ` · Aktif fiyat: ${Number(r.active_price_amount).toLocaleString("tr-TR")} ${r.active_price_currency}` : ""}</p>
                    </div>
                    <button onClick={() => router.push(`/guzergahlar?company_id=${id}`)} className="text-xs text-zinc-400 border border-zinc-700 px-3 py-1.5 rounded-lg hover:text-white hover:border-zinc-500">Güzergahlar ekranı</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Tab: Sorumlu Kişiler ─────────────────────── */}
        {activeTab === "Sorumlu Kişiler" && (
          <div className="space-y-4">
            {canEdit && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-sm text-zinc-400 mb-3">Yetkili kullanıcı ekle</p>
                <div className="flex gap-2">
                  <select value={newResponsibleId} onChange={e => setNewResponsibleId(e.target.value)}
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white">
                    <option value="">— Kullanıcı seç —</option>
                    {usersList.filter((u: any) =>
                      !company.responsibles.some((r: any) => r.user_id === u.id)
                    ).map((u: any) => (
                      <option key={u.id} value={u.id}>{u.full_name} ({u.username})</option>
                    ))}
                  </select>
                  <button onClick={addResponsible} disabled={addingResp || !newResponsibleId}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50">
                    {addingResp ? "…" : "Ekle"}
                  </button>
                </div>
              </div>
            )}

            {company.responsibles.length === 0 ? (
              <div className="text-center py-12 text-zinc-500">Henüz sorumlu kişi atanmamış.</div>
            ) : (
              company.responsibles.map((r: any) => (
                <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-indigo-950 border border-indigo-700 flex items-center justify-center text-indigo-300 font-bold text-sm">
                    {r.full_name?.charAt(0)?.toUpperCase() ?? "?"}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-white">{r.full_name}</p>
                    <p className="text-xs text-zinc-500">@{r.username} · {r.role}</p>
                    {r.phone && <p className="text-xs text-zinc-500">{r.phone}</p>}
                  </div>
                  {canEdit && (
                    <button onClick={() => removeResponsible(r.user_id)} disabled={removingResp === r.user_id}
                      className="text-red-500 hover:text-red-400 text-xs px-3 py-1.5 rounded-lg border border-red-800 hover:bg-red-950 disabled:opacity-50">
                      {removingResp === r.user_id ? "…" : "Kaldır"}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ─── Tab: Personeller ─────────────────────────── */}
        {activeTab === "Personeller" && (
          <div className="space-y-3">
            {company.passengers.length === 0 ? (
              <div className="text-center py-16 text-zinc-500">Bu firmaya kayıtlı personel bulunamadı.</div>
            ) : (
              company.passengers.map((p: any) => (
                <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 font-bold text-sm">
                    {p.full_name?.charAt(0)?.toUpperCase() ?? "?"}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-white">{p.full_name}</p>
                    <div className="flex gap-3 text-xs text-zinc-500">
                      {p.phone && <span>{p.phone}</span>}
                      {p.email && <span>{p.email}</span>}
                      {p.type && p.type !== "yolcu" && <span className="text-zinc-600">{p.type}</span>}
                    </div>
                    {p.pickup_address && <p className="text-xs text-zinc-600 mt-0.5 truncate max-w-xs">{p.pickup_address}</p>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === "aktif" ? "bg-emerald-900 text-emerald-300" : "bg-zinc-700 text-zinc-400"}`}>
                    {p.status ?? "aktif"}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {/* ─── Tab: Transferler ─────────────────────────── */}
        {activeTab === "Transferler" && (
          <div className="space-y-3">
            {company.transfers.length === 0 ? (
              <div className="text-center py-16 text-zinc-500">Bu firmaya ait transfer bulunamadı.</div>
            ) : (
              company.transfers.map((t: any) => {
                const st = TRANSFER_STATUS[t.status] ?? { label: t.status, cls: "bg-zinc-700 text-zinc-300" };
                return (
                  <div key={t.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-white">{t.title || "Transfer"}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.cls}`}>{st.label}</span>
                        </div>
                        <div className="flex gap-3 text-xs text-zinc-500 flex-wrap">
                          {t.transfer_date && <span>📅 {formatDate(t.transfer_date)} {t.transfer_time ?? ""}</span>}
                          {t.pickup_location && <span>🔴 {t.pickup_location}</span>}
                          {t.dropoff_location && <span>🟢 {t.dropoff_location}</span>}
                          {t.passenger_count && <span>👥 {t.passenger_count}</span>}
                          {t.driver_name && <span>🚗 {t.driver_name}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ─── Tab: Belgeler ───────────────────────────── */}
        {activeTab === "Belgeler" && (
          <div className="text-center py-20">
            <div className="text-4xl mb-4">📁</div>
            <p className="text-zinc-400 text-sm">Firma belgesi yönetimi yakında eklenecek.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Info Card Component ──────────────────────────────────────────────────────
function InfoCard({ label, value, link }: { label: string; value: string | null | undefined; link?: string | null }) {
  return (
    <div className="border border-zinc-800 bg-zinc-900 rounded-xl p-4">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      {link ? (
        <a href={link.startsWith("http") ? link : `https://${link}`} target="_blank" rel="noopener noreferrer"
          className="text-sm text-indigo-400 hover:text-indigo-300 break-all">
          {value || "—"}
        </a>
      ) : (
        <p className="text-sm text-zinc-200 break-all">{value || "—"}</p>
      )}
    </div>
  );
}
