/**
 * lib/api-key.ts — Public API v1 key validation
 *
 * Keys are stored as SHA-256 hashes in the api_keys table.
 * A valid key must exist, be active, and not be expired.
 *
 * Usage:
 *   const key = await validateApiKey(req);
 *   if (!key) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 */

import { createHash, randomBytes } from "crypto";
import { getDb } from "@/lib/db";
import { nowIso } from "@/lib/time";
import type { NextRequest } from "next/server";

export type ApiKeyRecord = {
  id: string;
  user_id: string | null;
  name: string;
  scopes: string;
  key_prefix: string;
};

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Generate a new API key string (akp_ prefix + 32 random bytes hex) */
export function generateApiKey(): string {
  return "akp_" + randomBytes(32).toString("hex");
}

/** Validate an API key from the request (Bearer token or X-API-Key header) */
export async function validateApiKey(req: NextRequest): Promise<ApiKeyRecord | null> {
  const authHeader = req.headers.get("authorization");
  const apiKeyHeader = req.headers.get("x-api-key");

  let rawKey: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    rawKey = authHeader.slice(7);
  } else if (apiKeyHeader) {
    rawKey = apiKeyHeader;
  }

  if (!rawKey) return null;

  const hash = hashKey(rawKey);
  const db = getDb();

  const record = await db.prepare(`
    SELECT id, user_id, name, scopes, key_prefix, expires_at
    FROM api_keys
    WHERE key_hash = ? AND is_active = 1
  `).get(hash) as (ApiKeyRecord & { expires_at: string | null }) | undefined;

  if (!record) return null;

  // Check expiry
  if (record.expires_at && record.expires_at < nowIso()) return null;

  // Update last_used_at (fire-and-forget)
  db.prepare(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`).run(nowIso(), record.id);

  return {
    id: record.id,
    user_id: record.user_id,
    name: record.name,
    scopes: record.scopes,
    key_prefix: record.key_prefix,
  };
}

/** Check if a key has a specific scope */
export function hasScope(key: ApiKeyRecord, scope: string): boolean {
  return key.scopes.split(" ").includes(scope);
}

export { hashKey };
