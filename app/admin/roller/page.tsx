"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { toast } from "@/lib/toast";

interface RoleRow {
  id: string;
  name: string;
  label: string;
  hierarchy_level: number;
  is_system: number;
  permission_count: number;
  user_count: number;
}

const RESOURCE_LABELS: Record<string, string> = {
  dashboard: "Panel", companies: "Firmalar", arrivals: "Giriş Kontrol", vehicles: "Araçlar",
  route_suppliers: "İşletenler", route_prices: "Güzergah Fiyatları", route_price_authorities: "Fiyat Yetkilendirme",
  drivers: "Sürücüler", driver_records: "Sürücü Sicil", routes: "Güzergahlar", transfers: "Transfer",
  map: "Harita", passengers: "Yolcular", documents: "Belgeler", maintenance: "Araç Bakım",
  reports: "Raporlar", budget: "Bütçe", portal_requests: "Müşteri Portalı", notifications: "Bildirimler",
  warnings: "Uyarılar", suggestions: "Öneri/Talep", inspection_configs: "Denetim Türleri", inspections: "Denetimler",
  imports: "Toplu İçe Aktar", bulk_actions: "Toplu İşlem", users: "Kullanıcılar", departments: "Departmanlar",
  settings: "Ayarlar", integrations: "Entegrasyonlar", audit: "Aktivite Günlüğü", leave_requests: "İzin Talepleri",
  isleten: "İşleten", cetele: "Çetele", hakedis: "Hakediş", firma_mutabakat: "Firma Mutabakat",
  fleet_accidents: "Kazalar", fleet_penalties: "Cezalar", fleet_breakdowns: "Arızalar", fleet_insurances: "Sigortalar",
  fleet_tires: "Lastikler", gps_devices: "GPS Cihazları", fuel_cards: "Yakıt Kartları", hgs_ogs: "HGS/OGS",
  rehberler: "Rehberler", kara_liste: "Kara Liste", yakit_fiyatlari: "Yakıt Fiyatları", otoyol_fiyatlari: "Otoyol Fiyatları",
  arac_gruplari: "Araç Grupları", sigorta_sirketleri: "Sigorta Şirketleri", banka_tanimlari: "Banka Tanımları",
  donem_tanimlari: "Dönem Tanımları", duyurular: "Duyurular", anketler: "Anketler",
};

export default function RollerPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [catalog, setCatalog] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", label: "", hierarchy_level: 1, clone_from: "" });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingRole, setEditingRole] = useState<RoleRow | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editLevel, setEditLevel] = useState(0);
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());
  const [permsLoading, setPermsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data);
      else router.replace("/login");
    });
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/roles");
      const d = await r.json();
      if (d.ok) { setRoles(d.data); setCatalog(d.catalog); }
      else if (r.status === 403) toast.error("Bu sayfaya erişim yetkiniz yok");
    } finally { setLoading(false); }
  }

  async function openRole(role: RoleRow) {
    setEditingRole(role);
    setEditLabel(role.label);
    setEditLevel(role.hierarchy_level);
    setPermsLoading(true);
    try {
      const r = await fetch(`/api/admin/roles/${role.id}/permissions`);
      const d = await r.json();
      if (d.ok) setSelectedPerms(new Set(d.data));
    } finally { setPermsLoading(false); }
  }

  function togglePerm(key: string) {
    setSelectedPerms(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleResourceAll(resource: string, actions: string[], checked: boolean) {
    setSelectedPerms(prev => {
      const next = new Set(prev);
      for (const a of actions) {
        const key = `${resource}:${a}`;
        if (checked) next.add(key); else next.delete(key);
      }
      return next;
    });
  }

  async function saveRole() {
    if (!editingRole) return;
    setSaving(true);
    try {
      const r1 = await fetch(`/api/admin/roles/${editingRole.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: editLabel, hierarchy_level: editLevel }),
      });
      const d1 = await r1.json();
      if (!d1.ok) { toast.error(d1.error || "Kaydetme hatası"); return; }

      const r2 = await fetch(`/api/admin/roles/${editingRole.id}/permissions`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: Array.from(selectedPerms) }),
      });
      const d2 = await r2.json();
      if (!d2.ok) { toast.error(d2.error || "İzinler kaydedilemedi"); return; }

      toast.success("Rol güncellendi");
      setEditingRole(null);
      load();
    } finally { setSaving(false); }
  }

  async function deleteRole(role: RoleRow) {
    if (!confirm(`"${role.label}" rolü silinsin mi?`)) return;
    const r = await fetch(`/api/admin/roles/${role.id}`, { method: "DELETE" });
    const d = await r.json();
    if (!d.ok) { toast.error(d.error || "Silinemedi"); return; }
    toast.success("Rol silindi");
    load();
  }

  async function createRole() {
    if (!createForm.name.trim() || !createForm.label.trim()) { setCreateError("Rol adı ve görünen ad zorunlu"); return; }
    setCreating(true); setCreateError(null);
    try {
      const r = await fetch("/api/admin/roles", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const d = await r.json();
      if (!d.ok) { setCreateError(d.error || "Oluşturma hatası"); return; }
      toast.success("Rol oluşturuldu");
      setShowCreate(false);
      setCreateForm({ name: "", label: "", hierarchy_level: 1, clone_from: "" });
      load();
    } finally { setCreating(false); }
  }

  const isAdmin = user?.role === "admin";

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Roller ve Yetkiler</h1>
              <p className="text-zinc-500 text-sm mt-0.5">{roles.length} rol · her rolün hangi işlemleri yapabileceğini burada düzenleyin</p>
            </div>
            <button onClick={() => setShowCreate(true)}
              className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors whitespace-nowrap">
              + Yeni Rol
            </button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-16 animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-2">
              {roles.map(role => (
                <div key={role.id} onClick={() => openRole(role)}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 cursor-pointer hover:border-zinc-700 transition-colors flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-semibold text-sm">{role.label}</span>
                      <span className="text-zinc-600 text-xs font-mono">{role.name}</span>
                      {role.is_system ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border bg-zinc-800 border-zinc-700 text-zinc-500">Sistem</span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border bg-indigo-950 border-indigo-800 text-indigo-300">Özel</span>
                      )}
                    </div>
                    <p className="text-zinc-500 text-xs mt-1">
                      Seviye {role.hierarchy_level} · {role.permission_count} izin · {role.user_count} kullanıcı
                    </p>
                  </div>
                  {!role.is_system && (
                    <button onClick={e => { e.stopPropagation(); deleteRole(role); }}
                      className="text-xs text-red-400 hover:text-red-300 px-2 py-1">Sil</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Yeni rol modalı */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/60" onClick={() => setShowCreate(false)} />
          <div className="w-full max-w-md bg-zinc-900 border-l border-zinc-800 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
              <h2 className="text-white font-semibold">Yeni Rol</h2>
              <button onClick={() => setShowCreate(false)} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {createError && <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">{createError}</div>}
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Rol Adı (kod) *</span>
                <input value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="örn. muhasebe"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 font-mono" />
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Görünen Ad *</span>
                <input value={createForm.label} onChange={e => setCreateForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="örn. Muhasebe"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Hiyerarşi Seviyesi</span>
                <input type="number" value={createForm.hierarchy_level}
                  onChange={e => setCreateForm(f => ({ ...f, hierarchy_level: Number(e.target.value) }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                <span className="text-zinc-600 text-xs mt-1 block">personel=0, yetkili=1, yönetici=2, admin=3 — aradaki bir sayı seçebilirsiniz</span>
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">İzinleri Kopyala (opsiyonel)</span>
                <select value={createForm.clone_from} onChange={e => setCreateForm(f => ({ ...f, clone_from: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                  <option value="">— Boş başla —</option>
                  {roles.map(r => <option key={r.name} value={r.name}>{r.label}</option>)}
                </select>
              </label>
            </div>
            <div className="px-5 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={() => setShowCreate(false)} className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={createRole} disabled={creating}
                className="flex-1 bg-white text-zinc-950 font-semibold text-sm py-2.5 rounded-xl hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                {creating ? "Oluşturuluyor..." : "Oluştur"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rol düzenleme / izin matrisi */}
      {editingRole && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/60" onClick={() => setEditingRole(null)} />
          <div className="w-full max-w-2xl bg-zinc-900 border-l border-zinc-800 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
              <h2 className="text-white font-semibold">{editingRole.label} — İzinler</h2>
              <button onClick={() => setEditingRole(null)} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Görünen Ad</span>
                  <input value={editLabel} onChange={e => setEditLabel(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Hiyerarşi Seviyesi</span>
                  <input type="number" value={editLevel} onChange={e => setEditLevel(Number(e.target.value))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
              </div>

              {permsLoading ? (
                <div className="py-10 text-center text-zinc-600 text-sm">Yükleniyor...</div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(catalog).map(([resource, actions]) => {
                    const allChecked = actions.every(a => selectedPerms.has(`${resource}:${a}`));
                    const someChecked = actions.some(a => selectedPerms.has(`${resource}:${a}`));
                    return (
                      <div key={resource} className="bg-zinc-800/50 border border-zinc-800 rounded-lg p-3">
                        <label className="flex items-center gap-2 mb-2 cursor-pointer">
                          <input type="checkbox" checked={allChecked} ref={el => { if (el) el.indeterminate = !allChecked && someChecked; }}
                            onChange={e => toggleResourceAll(resource, actions, e.target.checked)}
                            className="accent-white" />
                          <span className="text-white text-sm font-semibold">{RESOURCE_LABELS[resource] || resource}</span>
                        </label>
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5 pl-6">
                          {actions.map(action => (
                            <label key={action} className="flex items-center gap-1.5 cursor-pointer">
                              <input type="checkbox" checked={selectedPerms.has(`${resource}:${action}`)}
                                onChange={() => togglePerm(`${resource}:${action}`)}
                                className="accent-white" />
                              <span className="text-zinc-400 text-xs">{action}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={() => setEditingRole(null)} className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={saveRole} disabled={saving || permsLoading}
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
