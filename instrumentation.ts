export async function register() {
  // Sentry — register in both edge and nodejs runtimes
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const required = ["DB_HOST", "DB_USER", "DB_PASS", "DB_NAME"] as const;
    for (const key of required) {
      if (!process.env[key]) {
        throw new Error(`[startup] Eksik zorunlu ortam değişkeni: ${key}`);
      }
    }
    const { runMigrations } = await import("./lib/migrate");
    try {
      await runMigrations(process.cwd());
    } catch (e) {
      // Migration hatası uygulamayı çöktürmesin — log'a düşsün, çalışmaya devam etsin
      console.error("[startup] Migration hatası (uygulama yine de başlatılıyor):", e);
    }

    const { loadPermissionsCache } = await import("./lib/permissions-loader");
    try {
      await loadPermissionsCache();
    } catch (e) {
      console.error("[startup] Rol/izin cache yüklenemedi (varsayılan izinlerle devam ediliyor):", e);
    }
  }
}

export const onRequestError = async (
  err: unknown,
  _request: { path: string; method: string },
  _context: { routerKind: string; routePath: string }
) => {
  // Only capture if Sentry is configured
  if (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN) {
    const { captureException } = await import("@sentry/nextjs");
    captureException(err);
  }
};
