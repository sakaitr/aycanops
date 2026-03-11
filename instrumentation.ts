export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const required = ["DB_HOST", "DB_USER", "DB_PASS", "DB_NAME"] as const;
    for (const key of required) {
      if (!process.env[key]) {
        throw new Error(`[startup] Eksik zorunlu ortam değişkeni: ${key}`);
      }
    }
    const path = await import("path");
    const { runMigrations } = await import("./lib/migrate");
    await runMigrations(path.join(process.cwd(), "migrations"));
  }
}
