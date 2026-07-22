/**
 * auth-storage.ts — Platform-aware token storage
 *
 * Web (Next.js)  : HttpOnly cookie — server manages it, no client JS access.
 *                  For non-sensitive UI state (theme, lastRoute) we use localStorage.
 * Native (Capacitor): @capacitor/preferences — backed by Keychain (iOS) / Keystore (Android)
 *
 * Usage (client-side only):
 *   import { authStorage } from "@/lib/auth-storage"
 *   await authStorage.set("session_token", token)
 *   const token = await authStorage.get("session_token")
 *   await authStorage.remove("session_token")
 */

type StorageDriver = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
};

// ── Web driver (localStorage fallback for non-sensitive client state) ─────────
// NOTE: Session tokens are managed by HttpOnly cookies on web — the web driver
// here is only for non-sensitive UI preferences (theme, lastRoute, etc.)
const webDriver: StorageDriver = {
  async get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  async set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* storage full / private */ }
  },
  async remove(key) {
    try { localStorage.removeItem(key); } catch { /* noop */ }
  },
  async clear() {
    try { localStorage.clear(); } catch { /* noop */ }
  },
};

// ── Capacitor Preferences driver (Keychain/Keystore) ─────────────────────────
// Loaded lazily so tree-shaking removes it from web builds.
let _secureDriver: StorageDriver | null = null;

async function getSecureDriver(): Promise<StorageDriver> {
  if (_secureDriver) return _secureDriver;

  try {
    const { Preferences } = await import("@capacitor/preferences");
    _secureDriver = {
      async get(key) {
        try {
          const { value } = await Preferences.get({ key });
          return value ?? null;
        } catch { return null; }
      },
      async set(key, value) {
        await Preferences.set({ key, value });
      },
      async remove(key) {
        try { await Preferences.remove({ key }); } catch { /* noop */ }
      },
      async clear() {
        try { await Preferences.clear(); } catch { /* noop */ }
      },
    };
  } catch {
    // Capacitor not available — fall back to web driver
    _secureDriver = webDriver;
  }

  return _secureDriver;
}

// ── Platform detection ────────────────────────────────────────────────────────
function isCapacitorNative(): boolean {
  if (typeof window === "undefined") return false;
  // Capacitor sets window.Capacitor.isNativePlatform() when running native
  const cap = (window as any).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

// ── Public API ────────────────────────────────────────────────────────────────
async function getDriver(): Promise<StorageDriver> {
  return isCapacitorNative() ? getSecureDriver() : webDriver;
}

export const authStorage = {
  async get(key: string): Promise<string | null> {
    const driver = await getDriver();
    return driver.get(key);
  },
  async set(key: string, value: string): Promise<void> {
    const driver = await getDriver();
    return driver.set(key, value);
  },
  async remove(key: string): Promise<void> {
    const driver = await getDriver();
    return driver.remove(key);
  },
  async clear(): Promise<void> {
    const driver = await getDriver();
    return driver.clear();
  },
} satisfies StorageDriver;

// Re-export type for consumers
export type { StorageDriver };
