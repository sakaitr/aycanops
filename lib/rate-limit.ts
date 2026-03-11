import { getDb } from "./db";

/**
 * IP/action bazlı rate limiting — MySQL
 * Tablo migration 013 ile oluşturulur.
 */
export async function checkRateLimit(
  ip: string,
  action: string,
  maxAttempts: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const db = getDb();
  const now = Date.now();
  const windowStart = new Date(now - windowMs).toISOString();

  // Pencere dışındaki eski kayıtları temizle
  await db.prepare(
    "DELETE FROM rate_limits WHERE ip = ? AND action = ? AND window_start < ?"
  ).run(ip, action, windowStart);

  const row = await db.prepare(
    "SELECT attempts, window_start FROM rate_limits WHERE ip = ? AND action = ?"
  ).get<{ attempts: number; window_start: string }>(ip, action);

  if (!row) {
    await db.prepare(
      "INSERT INTO rate_limits (ip, action, attempts, window_start) VALUES (?, ?, 1, ?)"
    ).run(ip, action, new Date(now).toISOString());
    return { allowed: true, retryAfterMs: 0 };
  }

  if (row.attempts >= maxAttempts) {
    const windowEndMs =
      new Date(row.window_start).getTime() + windowMs;
    return { allowed: false, retryAfterMs: Math.max(0, windowEndMs - now) };
  }

  await db.prepare(
    "UPDATE rate_limits SET attempts = attempts + 1 WHERE ip = ? AND action = ?"
  ).run(ip, action);
  return { allowed: true, retryAfterMs: 0 };
}

export async function resetRateLimit(ip: string, action: string) {
  const db = getDb();
  await db.prepare(
    "DELETE FROM rate_limits WHERE ip = ? AND action = ?"
  ).run(ip, action);
}
