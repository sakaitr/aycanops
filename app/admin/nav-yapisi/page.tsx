"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { toast } from "@/lib/toast";
import { hasPermission } from "@/lib/permissions";
import { ICON_REGISTRY, NAV_ICON_NAMES } from "@/lib/nav-icons";
import { v4 as uuidv4 } from "uuid";
import type {
  NavConfigType as NavConfig,
  NavGroupType as NavGroup,
  NavConfigItemType as NavItem,
} from "@/lib/schemas";

const MIN_ROLE_LABELS: Record<string, string> = { "": "Herkes", yetkili: "Yetkili+", admin: "Admin" };

export default function NavYapisiPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [config, setConfig] = useState<NavConfig | null>(null);
  const [permissionCatalog, setPermissionCatalog] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [dragItem, setDragItem] = useState<{ groupKey: string; itemId: string } | null>(null);
  const [dragGroupKey, setDragGroupKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      if (d.ok) setUser(d.data); else router.replace("/login");
    });
    fetch("/api/admin/nav-config").then((r) => r.json()).then((d) => { if (d.ok) setConfig(d.data); });
    fetch("/api/admin/permissions/catalog").then((r) => r.json()).then((d) => { if (d.ok) setPermissionCatalog(d.data); });
  }, []);

  const canEdit = hasPermission(user, "nav_config:update");

  function updateConfig(mutator: (c: NavConfig) => NavConfig) {
    setConfig((prev) => (prev ? mutator(structuredClone(prev)) : prev));
  }

  function toggleGroupActive(groupKey: string) {
    updateConfig((c) => {
      const g = c.groups.find((x) => x.key === groupKey);
      if (g) g.isActive = !g.isActive;
      return c;
    });
  }

  function toggleItemActive(groupKey: string, itemId: string) {
    updateConfig((c) => {
      const g = c.groups.find((x) => x.key === groupKey);
      const it = g?.items.find((x) => x.id === itemId);
      if (it) it.isActive = !it.isActive;
      return c;
    });
  }

  function deleteItem(groupKey: string, itemId: string) {
    if (!window.confirm("Bu link silinsin mi?")) return;
    updateConfig((c) => {
      const g = c.groups.find((x) => x.key === groupKey);
      if (g) g.items = g.items.filter((x) => x.id !== itemId);
      return c;
    });
  }

  function addGroup() {
    const label = window.prompt("Yeni grup adı:");
    if (!label?.trim()) return;
    updateConfig((c) => {
      c.groups.push({
        key: uuidv4(), label: label.trim(),
        sortOrder: c.groups.length, isActive: true, minRole: null, items: [],
      });
      return c;
    });
  }

  function addItem(groupKey: string) {
    const href = window.prompt("Link adresi (örn. /finans/ozel-rapor):");
    if (!href?.trim()) return;
    const label = window.prompt("Görünen ad:");
    if (!label?.trim()) return;
    updateConfig((c) => {
      const g = c.groups.find((x) => x.key === groupKey);
      if (!g) return c;
      g.items.push({
        id: uuidv4(), href: href.trim(), label: label.trim(),
        icon: NAV_ICON_NAMES[0], permission: permissionCatalog[0] || "dashboard:read",
        isActive: true, sortOrder: g.items.length, isCustom: true,
      });
      return c;
    });
  }

  function updateItemField(groupKey: string, itemId: string, field: "icon" | "permission" | "label" | "href", value: string) {
    updateConfig((c) => {
      const g = c.groups.find((x) => x.key === groupKey);
      const it = g?.items.find((x) => x.id === itemId);
      if (it) (it as any)[field] = value;
      return c;
    });
  }

  function updateItemMinRole(groupKey: string, itemId: string, value: string) {
    updateConfig((c) => {
      const g = c.groups.find((x) => x.key === groupKey);
      const it = g?.items.find((x) => x.id === itemId);
      if (it) it.minRole = value === "" ? null : (value as "yetkili" | "admin");
      return c;
    });
  }

  function updateGroupMinRole(groupKey: string, value: string) {
    updateConfig((c) => {
      const g = c.groups.find((x) => x.key === groupKey);
      if (g) g.minRole = value === "" ? null : (value as "yetkili" | "admin");
      return c;
    });
  }

  function onDropItem(targetGroupKey: string, targetItemId: string | null) {
    if (!dragItem) return;
    updateConfig((c) => {
      const sourceGroup = c.groups.find((x) => x.key === dragItem.groupKey);
      const item = sourceGroup?.items.find((x) => x.id === dragItem.itemId);
      if (!sourceGroup || !item) return c;
      sourceGroup.items = sourceGroup.items.filter((x) => x.id !== dragItem.itemId);

      const targetGroup = c.groups.find((x) => x.key === targetGroupKey);
      if (!targetGroup) return c;
      const targetIndex = targetItemId ? targetGroup.items.findIndex((x) => x.id === targetItemId) : targetGroup.items.length;
      targetGroup.items.splice(targetIndex < 0 ? targetGroup.items.length : targetIndex, 0, item);

      for (const g of c.groups) g.items.forEach((it, i) => { it.sortOrder = i; });
      return c;
    });
    setDragItem(null);
  }

  function onDropGroup(targetGroupKey: string) {
    if (!dragGroupKey || dragGroupKey === targetGroupKey) { setDragGroupKey(null); return; }
    updateConfig((c) => {
      const fromIdx = c.groups.findIndex((g) => g.key === dragGroupKey);
      const toIdx = c.groups.findIndex((g) => g.key === targetGroupKey);
      if (fromIdx < 0 || toIdx < 0) return c;
      const [moved] = c.groups.splice(fromIdx, 1);
      c.groups.splice(toIdx, 0, moved);
      c.groups.forEach((g, i) => { g.sortOrder = i; });
      return c;
    });
    setDragGroupKey(null);
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/nav-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const d = await res.json();
      if (!d.ok) { toast.error(typeof d.error === "string" ? d.error : "Kaydetme başarısız"); return; }
      toast.success("Nav yapısı kaydedildi");
    } finally { setSaving(false); }
  }

  if (!canEdit) {
    return (
      <>
        <Nav user={user} />
        <div className="min-h-screen bg-zinc-950 pt-16 flex items-center justify-center">
          <p className="text-zinc-500">Bu sayfaya erişim yetkiniz yok.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Nav Yapısı</h1>
              <p className="text-zinc-500 text-sm mt-0.5">Sidebar grup ve linklerini düzenle</p>
            </div>
            <div className="flex gap-2">
              <button onClick={addGroup} className="bg-zinc-800 text-zinc-200 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-700 transition-colors">
                + Grup Ekle
              </button>
              <button onClick={save} disabled={saving || !config} className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>

          {!config ? (
            <div className="text-center py-16 text-zinc-600">Yükleniyor...</div>
          ) : (
            <div className="space-y-3">
              {[...config.groups].sort((a, b) => a.sortOrder - b.sortOrder).map((group) => (
                <div
                  key={group.key}
                  draggable
                  onDragStart={() => setDragGroupKey(group.key)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDropGroup(group.key)}
                  className={`bg-zinc-900 border rounded-xl overflow-hidden ${group.isActive ? "border-zinc-800" : "border-zinc-800 opacity-50"}`}
                >
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 cursor-move">
                    <input
                      type="text"
                      value={group.label}
                      onChange={(e) => updateConfig((c) => { const g = c.groups.find((x) => x.key === group.key); if (g) g.label = e.target.value; return c; })}
                      className="bg-transparent text-white font-semibold text-sm focus:outline-none focus:bg-zinc-800 rounded px-1 flex-1"
                    />
                    <select
                      value={group.minRole || ""}
                      onChange={(e) => updateGroupMinRole(group.key, e.target.value)}
                      className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs px-2 py-1 rounded-lg focus:outline-none"
                    >
                      {Object.entries(MIN_ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <label className="flex items-center gap-1.5 text-xs text-zinc-400">
                      <input type="checkbox" checked={group.isActive} onChange={() => toggleGroupActive(group.key)} />
                      Aktif
                    </label>
                    <button onClick={() => addItem(group.key)} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors whitespace-nowrap">
                      + Link
                    </button>
                  </div>

                  <div className="divide-y divide-zinc-800/60">
                    {[...group.items].sort((a, b) => a.sortOrder - b.sortOrder).map((item) => {
                      const ItemIcon = ICON_REGISTRY[item.icon];
                      return (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={() => setDragItem({ groupKey: group.key, itemId: item.id })}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => { e.stopPropagation(); onDropItem(group.key, item.id); }}
                          className={`flex items-center gap-2 px-4 py-2.5 cursor-move ${item.isActive ? "" : "opacity-40"}`}
                        >
                          {ItemIcon && <ItemIcon size={16} className="text-zinc-500 shrink-0" />}
                          <input
                            type="text"
                            value={item.label}
                            onChange={(e) => updateItemField(group.key, item.id, "label", e.target.value)}
                            className="bg-transparent text-zinc-200 text-sm focus:outline-none focus:bg-zinc-800 rounded px-1 flex-1 min-w-0"
                          />
                          <input
                            type="text"
                            value={item.href}
                            onChange={(e) => updateItemField(group.key, item.id, "href", e.target.value)}
                            className="bg-zinc-800/60 text-zinc-500 text-xs px-2 py-1 rounded-lg focus:outline-none w-40 shrink-0"
                          />
                          <select
                            value={item.icon}
                            onChange={(e) => updateItemField(group.key, item.id, "icon", e.target.value)}
                            className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs px-1.5 py-1 rounded-lg focus:outline-none w-32 shrink-0"
                          >
                            {NAV_ICON_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                          <select
                            value={item.permission}
                            onChange={(e) => updateItemField(group.key, item.id, "permission", e.target.value)}
                            className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs px-1.5 py-1 rounded-lg focus:outline-none w-40 shrink-0"
                          >
                            {permissionCatalog.map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                          <select
                            value={item.minRole || ""}
                            onChange={(e) => updateItemMinRole(group.key, item.id, e.target.value)}
                            className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs px-1.5 py-1 rounded-lg focus:outline-none w-24 shrink-0"
                          >
                            <option value="">Grup varsayılanı</option>
                            <option value="yetkili">Yetkili+</option>
                            <option value="admin">Admin</option>
                          </select>
                          {item.isCustom && <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 shrink-0">özel</span>}
                          <label className="flex items-center shrink-0">
                            <input type="checkbox" checked={item.isActive} onChange={() => toggleItemActive(group.key, item.id)} />
                          </label>
                          <button onClick={() => deleteItem(group.key, item.id)} className="text-xs text-red-400 hover:text-red-300 shrink-0">Sil</button>
                        </div>
                      );
                    })}
                    {group.items.length === 0 && (
                      <div
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => onDropItem(group.key, null)}
                        className="px-4 py-6 text-center text-zinc-700 text-xs"
                      >
                        Link yok (buraya sürükleyebilirsiniz)
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
