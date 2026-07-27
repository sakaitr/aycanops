import { getDb } from "@/lib/db";
import { nowIso } from "@/lib/time";
import { v4 as uuidv4 } from "uuid";
import {
  setRoleCache,
  isRoleCacheLoaded,
  DEFAULT_ROLE_ORDER,
  DEFAULT_ROLE_PERMISSIONS,
} from "@/lib/permissions";

// Server-only: roles/role_permissions tablolarını okuyup lib/permissions.ts'teki
// in-memory cache'i doldurur. Tablolar boşsa (ilk kurulum) DEFAULT_* sabitlerinden
// tek seferlik seed yapar. instrumentation.ts'te açılışta, admin rol/izin
// güncelleme API'lerinde her mutasyondan sonra çağrılır.
export async function loadPermissionsCache(): Promise<void> {
  const db = getDb();

  const roleCountRow = await db.prepare("SELECT COUNT(*) AS total FROM roles").get() as { total: number };
  if (Number(roleCountRow.total) === 0) {
    const now = nowIso();
    for (const [name, level] of Object.entries(DEFAULT_ROLE_ORDER)) {
      await db.prepare(
        "INSERT INTO roles (id, name, label, hierarchy_level, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)"
      ).run(uuidv4(), name, name, level, now, now);
      const perms = DEFAULT_ROLE_PERMISSIONS[name] ?? [];
      for (const key of perms) {
        await db.prepare(
          "INSERT IGNORE INTO role_permissions (role_name, permission_key) VALUES (?, ?)"
        ).run(name, key);
      }
    }
  }

  const roles = await db.prepare("SELECT name, hierarchy_level FROM roles").all() as { name: string; hierarchy_level: number }[];
  const rolePerms = await db.prepare("SELECT role_name, permission_key FROM role_permissions").all() as { role_name: string; permission_key: string }[];

  const hierarchy: Record<string, number> = {};
  for (const r of roles) hierarchy[r.name] = Number(r.hierarchy_level);

  const permissions: Record<string, string[]> = {};
  for (const r of roles) permissions[r.name] = [];
  for (const rp of rolePerms) {
    if (!permissions[rp.role_name]) permissions[rp.role_name] = [];
    permissions[rp.role_name].push(rp.permission_key);
  }

  setRoleCache({ hierarchy, permissions });
}

// instrumentation.ts'teki açılış çağrısı, Next.js'in API route'ları ayrı
// webpack chunk'larına derlemesi yüzünden route handler'ların kullandığı
// lib/permissions.ts kopyasına ulaşmayabiliyor (her chunk kendi modül-seviyeli
// roleCache'ine sahip) — bu da restart sonrası özel rollerin (örn. İdari İşler)
// bir admin herhangi bir rolün izinlerini kaydedene kadar boş görünmesine yol
// açıyordu. requireUser() içinden çağrılan bu fonksiyon, o anki route'un kendi
// modül kopyasında cache'i tembel biçimde ve tek seferlik doldurur.
let cacheLoadPromise: Promise<void> | null = null;
export function ensureRoleCache(): Promise<void> {
  if (isRoleCacheLoaded()) return Promise.resolve();
  if (!cacheLoadPromise) {
    cacheLoadPromise = loadPermissionsCache().catch((e) => {
      cacheLoadPromise = null;
      throw e;
    });
  }
  return cacheLoadPromise;
}
