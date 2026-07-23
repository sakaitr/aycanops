// Roller artık sabit değil — DB'de tanımlı, admin panelden oluşturulup düzenlenebilir.
// UserRole gerçek rol adlarını (string) tutar; "personel"/"yetkili"/"yonetici"/"admin"
// hâlâ sistem rolleri olarak var, ama başka roller de eklenebilir.
export type UserRole = string;

export const PERMISSIONS = {
  dashboard: ["read"],
  companies: ["read", "create", "update", "deactivate", "export"],
  arrivals: ["read", "create", "update", "delete", "bulk", "export"],
  vehicles: ["read", "create", "update", "deactivate", "bulk", "export"],
  route_suppliers: ["read", "create", "update", "deactivate", "export"],
  route_prices: ["read", "create", "request", "approve", "reject", "export"],
  route_price_authorities: ["read", "update"],
  drivers: ["read", "create", "update", "deactivate", "export"],
  driver_records: ["read", "create", "delete"],
  routes: ["read", "create", "update", "delete", "publish", "optimize", "export"],
  transfers: ["read", "create", "update", "cancel", "delete", "export"],
  map: ["read", "live", "history", "geocode", "edit"],
  passengers: ["read", "create", "update", "import", "export"],
  documents: ["read", "create", "update", "delete", "approve", "export"],
  maintenance: ["read", "create", "update", "close", "export"],
  reports: ["read", "export", "subscribe", "share_portal"],
  budget: ["read", "create", "update", "export"],
  portal_requests: ["read", "approve", "reject", "comment", "delete"],
  notifications: ["read", "create", "update", "delete", "send"],
  warnings: ["read", "create", "update", "delete"],
  suggestions: ["read", "create", "update", "assign", "delete"],
  inspection_configs: ["read", "create", "update", "delete"],
  inspections: ["read", "create", "update", "delete"],
  imports: ["create", "validate", "approve", "execute", "rollback"],
  bulk_actions: ["preview", "execute", "approve", "rollback"],
  users: ["read", "create", "update", "deactivate", "permissions"],
  departments: ["read", "create", "update", "delete"],
  settings: ["read", "update"],
  integrations: ["read", "update", "sync"],
  audit: ["read", "export"],
  leave_requests: ["read", "create", "update", "delete", "approve", "reject", "manage_approvers"],
  isleten: ["read", "create", "update", "deactivate"],
  cetele: ["read", "create", "update", "approve", "cancel"],
  hakedis: ["read", "create", "update", "approve", "reject", "pay"],
  firma_mutabakat: ["read", "create", "update", "approve", "reject"],
  fleet_accidents: ["read", "create", "update", "delete"],
  fleet_penalties: ["read", "create", "update", "delete"],
  fleet_breakdowns: ["read", "create", "update", "delete"],
  fleet_insurances: ["read", "create", "update", "delete"],
  fleet_tires: ["read", "create", "update", "delete"],
  gps_devices: ["read", "create", "update", "delete"],
  fuel_cards: ["read", "create", "update", "delete"],
  hgs_ogs: ["read", "create", "update", "delete"],
  rehberler: ["read", "create", "update", "deactivate"],
  kara_liste: ["read", "create", "update"],
  yakit_fiyatlari: ["read", "create", "delete"],
  otoyol_fiyatlari: ["read", "create", "delete"],
  arac_gruplari: ["read", "create", "update", "delete"],
  sigorta_sirketleri: ["read", "create", "update", "delete"],
  banka_tanimlari: ["read", "create", "update", "delete"],
  donem_tanimlari: ["read", "create", "update", "delete"],
  duyurular: ["read", "create", "update", "delete"],
  anketler: ["read", "create", "update", "delete", "respond"],
  finans_hesap_plani: ["read", "create", "update", "delete"],
  finans_kategori: ["read", "create", "update", "delete"],
  finans_masraf_merkezi: ["read", "create", "update", "delete"],
  finans_proje: ["read", "create", "update", "delete"],
  finans_kasa_banka: ["read", "create", "update", "delete"],
  finans_para_birimi: ["read"],
  finans_vergi_kodu: ["read", "create", "update", "delete"],
  finans_odeme_yontemi: ["read", "create", "update", "delete"],
  finans_gelir_gider: ["read", "create", "update", "delete", "approve"],
  finans_masraf_talebi: ["read", "create", "approve", "reject"],
  finans_belge_turu: ["read", "create", "update", "delete"],
  finans_fatura: ["read", "create", "update", "delete", "approve"],
  finans_fis: ["read", "create", "update", "delete"],
  finans_belge: ["read", "create", "delete"],
  finans_odeme: ["read", "create", "delete"],
  finans_banka_hareketi: ["read", "create", "update"],
} as const;

type PermissionResource = keyof typeof PERMISSIONS;
type PermissionAction<R extends PermissionResource> = (typeof PERMISSIONS)[R][number];
export type PermissionKey = {
  [R in PermissionResource]: `${R}:${PermissionAction<R>}`;
}[PermissionResource];

// Sistem rollerinin varsayılan hiyerarşi seviyesi ve izin seti — DB tabloları
// (roles, role_permissions) boşsa bunlarla seed edilir; ayrıca DB cache henüz
// yüklenmemişse (örn. client bundle'da) güvenli bir fallback olarak kullanılır.
export const DEFAULT_ROLE_ORDER: Record<string, number> = {
  personel: 0,
  yetkili: 1,
  yonetici: 2,
  admin: 3,
};

// Geriye dönük uyumluluk için eski isim de dışa aktarılıyor.
export const ROLE_ORDER = DEFAULT_ROLE_ORDER;

// DB'den yüklenen canlı rol/izin cache'i. Bu dosya client bundle'a da giriyor
// (Nav.tsx gibi "use client" bileşenler import ediyor), bu yüzden burada DB
// erişimi YOK — cache sadece lib/permissions-loader.ts (server-only) tarafından
// setRoleCache() ile dolduruluyor. Client tarafında cache hep boş kalır ve
// aşağıdaki DEFAULT_* sabitlerine düşülür (UI görünürlüğü için yeterli;
// gerçek yetki kontrolü zaten server tarafında, dolu cache ile yapılıyor).
let roleCache: {
  hierarchy: Record<string, number>;
  permissions: Record<string, Set<string>>;
} | null = null;

export function setRoleCache(data: {
  hierarchy: Record<string, number>;
  permissions: Record<string, string[]>;
}) {
  roleCache = {
    hierarchy: data.hierarchy,
    permissions: Object.fromEntries(
      Object.entries(data.permissions).map(([role, perms]) => [role, new Set(perms)])
    ),
  };
}

export function isRoleCacheLoaded() {
  return roleCache !== null;
}

export function isAtLeast(userRole: UserRole, requiredRole: UserRole) {
  const hierarchy = roleCache?.hierarchy ?? DEFAULT_ROLE_ORDER;
  const userLevel = hierarchy[userRole] ?? -1;
  const requiredLevel = hierarchy[requiredRole] ?? Number.POSITIVE_INFINITY;
  return userLevel >= requiredLevel;
}

export const DEFAULT_ROLE_PERMISSIONS: Record<string, readonly PermissionKey[]> = {
  personel: [
    "dashboard:read",
    "arrivals:read",
    "arrivals:create",
    "departments:read",
    "notifications:read",
    "suggestions:read",
    "suggestions:create",
    "suggestions:update",
    "inspection_configs:read",
    "leave_requests:read",
    "leave_requests:create",
    "leave_requests:update",
    "leave_requests:delete",
    "duyurular:read",
    "anketler:read",
    "anketler:respond",
    "finans_masraf_talebi:read",
    "finans_masraf_talebi:create",
  ],
  yetkili: [
    "dashboard:read",
    "arrivals:read",
    "arrivals:create",
    "arrivals:update",
    "arrivals:export",
    "vehicles:read",
    "vehicles:create",
    "vehicles:update",
    "route_suppliers:read",
    "route_prices:read",
    "route_prices:create",
    "route_prices:request",
    "companies:read",
    "drivers:read",
    "drivers:create",
    "drivers:update",
    "drivers:deactivate",
    "driver_records:read",
    "driver_records:create",
    "routes:read",
    "routes:create",
    "routes:update",
    "routes:optimize",
    "transfers:read",
    "transfers:create",
    "transfers:update",
    "transfers:cancel",
    "map:read",
    "map:edit",
    "passengers:read",
    "passengers:create",
    "passengers:update",
    "passengers:import",
    "documents:read",
    "documents:create",
    "documents:update",
    "maintenance:read",
    "maintenance:create",
    "maintenance:update",
    "budget:read",
    "budget:create",
    "budget:update",
    "reports:read",
    "reports:export",
    "portal_requests:read",
    "departments:read",
    "notifications:read",
    "suggestions:read",
    "suggestions:create",
    "suggestions:update",
    "suggestions:assign",
    "inspection_configs:read",
    "inspections:read",
    "inspections:create",
    "inspections:update",
    "leave_requests:read",
    "leave_requests:create",
    "leave_requests:update",
    "leave_requests:delete",
    "isleten:read",
    "cetele:read",
    "cetele:create",
    "cetele:update",
    "hakedis:read",
    "firma_mutabakat:read",
    "fleet_accidents:read",
    "fleet_accidents:create",
    "fleet_penalties:read",
    "fleet_penalties:create",
    "fleet_breakdowns:read",
    "fleet_breakdowns:create",
    "fleet_insurances:read",
    "fleet_tires:read",
    "fleet_tires:create",
    "gps_devices:read",
    "gps_devices:create",
    "fuel_cards:read",
    "fuel_cards:create",
    "hgs_ogs:read",
    "hgs_ogs:create",
    "rehberler:read",
    "rehberler:create",
    "kara_liste:read",
    "yakit_fiyatlari:read",
    "otoyol_fiyatlari:read",
    "arac_gruplari:read",
    "sigorta_sirketleri:read",
    "banka_tanimlari:read",
    "donem_tanimlari:read",
    "duyurular:read",
    "anketler:read",
    "anketler:respond",
    "finans_masraf_talebi:read",
    "finans_masraf_talebi:create",
    "finans_gelir_gider:read",
    "finans_hesap_plani:read",
    "finans_kategori:read",
    "finans_masraf_merkezi:read",
    "finans_proje:read",
    "finans_kasa_banka:read",
    "finans_para_birimi:read",
    "finans_vergi_kodu:read",
    "finans_odeme_yontemi:read",
    "finans_fatura:read",
    "finans_fis:read",
    "finans_belge:read",
    "finans_odeme:read",
    "finans_banka_hareketi:read",
    "finans_belge_turu:read",
  ],
  yonetici: [
    "dashboard:read",
    "arrivals:read",
    "arrivals:create",
    "arrivals:update",
    "arrivals:delete",
    "arrivals:bulk",
    "arrivals:export",
    "vehicles:read",
    "vehicles:create",
    "vehicles:update",
    "vehicles:deactivate",
    "vehicles:bulk",
    "vehicles:export",
    "route_suppliers:read",
    "route_suppliers:create",
    "route_suppliers:update",
    "route_suppliers:deactivate",
    "route_suppliers:export",
    "route_prices:read",
    "route_prices:create",
    "route_prices:request",
    "route_prices:approve",
    "route_prices:reject",
    "route_prices:export",
    "route_price_authorities:read",
    "companies:read",
    "companies:create",
    "companies:update",
    "companies:deactivate",
    "companies:export",
    "drivers:read",
    "drivers:create",
    "drivers:update",
    "drivers:deactivate",
    "drivers:export",
    "driver_records:read",
    "driver_records:create",
    "driver_records:delete",
    "routes:read",
    "routes:create",
    "routes:update",
    "routes:delete",
    "routes:publish",
    "routes:optimize",
    "routes:export",
    "transfers:read",
    "transfers:create",
    "transfers:update",
    "transfers:cancel",
    "transfers:delete",
    "transfers:export",
    "map:read",
    "map:live",
    "map:history",
    "map:geocode",
    "map:edit",
    "passengers:read",
    "passengers:create",
    "passengers:update",
    "passengers:import",
    "passengers:export",
    "documents:read",
    "documents:create",
    "documents:update",
    "documents:delete",
    "documents:approve",
    "documents:export",
    "maintenance:read",
    "maintenance:create",
    "maintenance:update",
    "maintenance:close",
    "maintenance:export",
    "reports:read",
    "reports:export",
    "reports:subscribe",
    "reports:share_portal",
    "budget:read",
    "budget:create",
    "budget:update",
    "budget:export",
    "portal_requests:read",
    "portal_requests:approve",
    "portal_requests:reject",
    "portal_requests:comment",
    "notifications:read",
    "notifications:create",
    "notifications:update",
    "notifications:delete",
    "notifications:send",
    "suggestions:read",
    "suggestions:create",
    "suggestions:update",
    "suggestions:assign",
    "suggestions:delete",
    "inspection_configs:read",
    "inspections:read",
    "inspections:create",
    "inspections:update",
    "inspections:delete",
    "integrations:read",
    "integrations:update",
    "integrations:sync",
    "imports:create",
    "imports:validate",
    "imports:approve",
    "imports:execute",
    "imports:rollback",
    "bulk_actions:preview",
    "bulk_actions:execute",
    "bulk_actions:approve",
    "bulk_actions:rollback",
    "departments:read",
    "departments:create",
    "departments:update",
    "leave_requests:read",
    "leave_requests:create",
    "leave_requests:update",
    "leave_requests:delete",
    "leave_requests:approve",
    "leave_requests:reject",
    "isleten:read",
    "isleten:create",
    "isleten:update",
    "isleten:deactivate",
    "cetele:read",
    "cetele:create",
    "cetele:update",
    "cetele:approve",
    "cetele:cancel",
    "hakedis:read",
    "hakedis:create",
    "hakedis:update",
    "hakedis:approve",
    "hakedis:reject",
    "firma_mutabakat:read",
    "firma_mutabakat:create",
    "firma_mutabakat:update",
    "firma_mutabakat:approve",
    "firma_mutabakat:reject",
    "fleet_accidents:read",
    "fleet_accidents:create",
    "fleet_accidents:update",
    "fleet_accidents:delete",
    "fleet_penalties:read",
    "fleet_penalties:create",
    "fleet_penalties:update",
    "fleet_penalties:delete",
    "fleet_breakdowns:read",
    "fleet_breakdowns:create",
    "fleet_breakdowns:update",
    "fleet_breakdowns:delete",
    "fleet_insurances:read",
    "fleet_insurances:create",
    "fleet_insurances:update",
    "fleet_insurances:delete",
    "fleet_tires:read",
    "fleet_tires:create",
    "fleet_tires:update",
    "fleet_tires:delete",
    "gps_devices:read",
    "gps_devices:create",
    "gps_devices:update",
    "gps_devices:delete",
    "fuel_cards:read",
    "fuel_cards:create",
    "fuel_cards:update",
    "fuel_cards:delete",
    "hgs_ogs:read",
    "hgs_ogs:create",
    "hgs_ogs:update",
    "hgs_ogs:delete",
    "rehberler:read",
    "rehberler:create",
    "rehberler:update",
    "rehberler:deactivate",
    "kara_liste:read",
    "kara_liste:create",
    "kara_liste:update",
    "yakit_fiyatlari:read",
    "yakit_fiyatlari:create",
    "yakit_fiyatlari:delete",
    "otoyol_fiyatlari:read",
    "otoyol_fiyatlari:create",
    "otoyol_fiyatlari:delete",
    "arac_gruplari:read",
    "arac_gruplari:create",
    "arac_gruplari:update",
    "arac_gruplari:delete",
    "sigorta_sirketleri:read",
    "sigorta_sirketleri:create",
    "sigorta_sirketleri:update",
    "sigorta_sirketleri:delete",
    "banka_tanimlari:read",
    "banka_tanimlari:create",
    "banka_tanimlari:update",
    "banka_tanimlari:delete",
    "donem_tanimlari:read",
    "donem_tanimlari:create",
    "donem_tanimlari:update",
    "donem_tanimlari:delete",
    "duyurular:read",
    "duyurular:create",
    "duyurular:update",
    "duyurular:delete",
    "anketler:read",
    "anketler:create",
    "anketler:update",
    "anketler:delete",
    "anketler:respond",
    "finans_masraf_talebi:read",
    "finans_masraf_talebi:create",
    "finans_masraf_talebi:approve",
    "finans_masraf_talebi:reject",
    "finans_gelir_gider:read",
    "finans_gelir_gider:create",
    "finans_gelir_gider:update",
    "finans_gelir_gider:approve",
    "finans_hesap_plani:read",
    "finans_hesap_plani:create",
    "finans_hesap_plani:update",
    "finans_kategori:read",
    "finans_kategori:create",
    "finans_kategori:update",
    "finans_masraf_merkezi:read",
    "finans_masraf_merkezi:create",
    "finans_masraf_merkezi:update",
    "finans_proje:read",
    "finans_proje:create",
    "finans_proje:update",
    "finans_kasa_banka:read",
    "finans_kasa_banka:create",
    "finans_kasa_banka:update",
    "finans_para_birimi:read",
    "finans_vergi_kodu:read",
    "finans_vergi_kodu:create",
    "finans_vergi_kodu:update",
    "finans_odeme_yontemi:read",
    "finans_odeme_yontemi:create",
    "finans_odeme_yontemi:update",
    "finans_belge_turu:read",
    "finans_belge_turu:create",
    "finans_belge_turu:update",
    "finans_fatura:read",
    "finans_fatura:create",
    "finans_fatura:update",
    "finans_fatura:approve",
    "finans_fis:read",
    "finans_fis:create",
    "finans_fis:update",
    "finans_belge:read",
    "finans_belge:create",
    "finans_belge:delete",
    "finans_odeme:read",
    "finans_odeme:create",
    "finans_banka_hareketi:read",
    "finans_banka_hareketi:create",
    "finans_banka_hareketi:update",
  ],
  admin: Object.entries(PERMISSIONS).flatMap(([resource, actions]) =>
    actions.map((action) => `${resource}:${action}` as PermissionKey)
  ),
};

// Geriye dönük uyumluluk için eski isim de dışa aktarılıyor.
export const ROLE_PERMISSIONS = DEFAULT_ROLE_PERMISSIONS;

export function hasPermission(
  user: { role: UserRole; permissions?: string[] } | null | undefined,
  permission: PermissionKey | string
) {
  if (!user) return false;
  // "admin" rolü DB'deki izin içeriği ne olursa olsun her zaman tam yetkili —
  // yanlış yapılandırma ile kilitlenmeyi önleyen sabit güvenlik ağı.
  if (user.role === "admin") return true;
  // user.permissions verilmişse (ör. /api/auth/me'den gelen çözümlenmiş liste),
  // hem server hem client'ta DOĞRU ve güncel sonucu verir — cache'in hangi
  // ortamda yüklü olduğuna bağlı değildir. Bunu tercih et.
  if (user.permissions) return user.permissions.includes(permission);
  if (roleCache) return roleCache.permissions[user.role]?.has(permission) ?? false;
  return DEFAULT_ROLE_PERMISSIONS[user.role]?.includes(permission as PermissionKey) ?? false;
}

export function getEffectivePermissions(userRole: UserRole): readonly string[] {
  if (roleCache) return Array.from(roleCache.permissions[userRole] ?? []);
  return DEFAULT_ROLE_PERMISSIONS[userRole] ?? [];
}

export function hasReportPermission(
  user: { role: UserRole } | null | undefined,
  action: "read" | "export",
  roleMin: UserRole = "yetkili"
) {
  if (!user) return false;
  return hasPermission(user, `reports:${action}`) && isAtLeast(user.role, roleMin);
}

export function canManageConfigs(userRole: UserRole) {
  return isAtLeast(userRole, "yonetici");
}

export function canManageUsers(userRole: UserRole) {
  return hasPermission({ role: userRole }, "users:update");
}

export function canViewTicket(
  user: { id: string; role: UserRole },
  ticket: { assigned_to: string | null; created_by: string }
) {
  if (isAtLeast(user.role, "yetkili")) {
    return true;
  }
  return ticket.assigned_to === user.id || ticket.created_by === user.id;
}

export function canViewTodo(
  user: { id: string; role: UserRole },
  todo: { assigned_to: string | null; created_by: string }
) {
  if (isAtLeast(user.role, "yonetici")) {
    return true;
  }
  return todo.assigned_to === user.id || todo.created_by === user.id;
}

export function canViewWorklog(
  user: { id: string; role: UserRole },
  worklog: { user_id: string }
) {
  if (isAtLeast(user.role, "yonetici")) {
    return true;
  }
  return worklog.user_id === user.id;
}

export function canReviewWorklog(userRole: UserRole) {
  return isAtLeast(userRole, "yonetici");
}
