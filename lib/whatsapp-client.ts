/**
 * Singleton WhatsApp Web client (whatsapp-web.js / Puppeteer).
 *
 * All state is held in module-level variables (safe in production Docker —
 * single process, no hot-reload). Uses lazy require() so bundlers (Turbopack /
 * webpack) never try to statically resolve whatsapp-web.js or qrcode.
 *
 * IMPORTANT: NO top-level imports from whatsapp-web.js, not even `import type`,
 * and NO `typeof import()` type casts — Turbopack traces all import() expressions.
 */

export type WAState = "initializing" | "qr" | "ready" | "disconnected";

// Module-level state — safe in production (no hot-reload in standalone Docker)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any = null;
let _state: WAState = "disconnected";
let _qrDataUrl: string | null = null;

export function getWAState(): { state: WAState; qrDataUrl: string | null } {
  return { state: _state, qrDataUrl: _qrDataUrl };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function initWAClient(): any {
  if (_client && (_state === "initializing" || _state === "qr" || _state === "ready")) {
    return _client;
  }

  _state = "initializing";
  _qrDataUrl = null;

  // Remove stale Chromium singleton lock files left by previous container instances.
  // These cause "profile in use by another process" errors on container restart.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const fs = require("fs");
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const path = require("path");
    const sessionDir = path.resolve(".wwebjs_auth/session");
    for (const name of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
      const f = path.join(sessionDir, name);
      if (fs.existsSync(f)) { fs.unlinkSync(f); }
    }
  } catch { /* ignore */ }

  // Lazy require — Turbopack/webpack must NOT statically bundle these packages.
  // Do NOT use `as typeof import(...)` — Turbopack traces import() expressions.
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const wwebjs = require("whatsapp-web.js");
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const qrcode = require("qrcode");

  const { Client, LocalAuth } = wwebjs;

  const puppeteerArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-accelerated-2d-canvas",
    "--no-first-run",
    "--disable-gpu",
    "--disable-features=VizDisplayCompositor",
  ];

  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

  _client = new Client({
    authStrategy: new LocalAuth({ dataPath: ".wwebjs_auth" }),
    puppeteer: { headless: true, executablePath, args: puppeteerArgs },
    webVersionCache: { type: "none" },
  });

  _client.on("qr", async (qr: string) => {
    try {
      _qrDataUrl = await qrcode.toDataURL(qr);
    } catch {
      _qrDataUrl = qr;
    }
    _state = "qr";
    console.log("[WhatsApp] QR hazır — /admin/whatsapp adresinden tarayın");
  });

  _client.on("authenticated", () => {
    console.log("[WhatsApp] Kimlik doğrulama başarılı, oturum kaydedildi");
  });

  _client.on("ready", () => {
    _state = "ready";
    _qrDataUrl = null;
    console.log("[WhatsApp] İstemci hazır ✓");
  });

  _client.on("auth_failure", (msg: string) => {
    console.error("[WhatsApp] Auth hatası:", msg);
    _state = "disconnected";
    _client = null;
  });

  _client.on("disconnected", (reason: string) => {
    console.warn("[WhatsApp] Bağlantı kesildi:", reason);
    _state = "disconnected";
    _client = null;
    setTimeout(() => initWAClient(), 30_000);
  });

  _client.initialize().catch((e: unknown) => {
    console.error("[WhatsApp] Başlatma hatası:", e);
    _state = "disconnected";
    _client = null;
  });

  return _client;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getWAClient(): any {
  return _client;
}

export async function destroyWAClient(): Promise<void> {
  if (_client) {
    try { await _client.destroy(); } catch { /* ignore */ }
  }
  _client = null;
  _state = "disconnected";
  _qrDataUrl = null;
}
