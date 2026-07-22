import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { generateApiKey, hashKey } from "@/lib/api-key";

// GET /api/admin/api-keys — list all keys (admin only)
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "integrations:read")) {
      return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
    }

    const db = getDb();
    const rows = await db.prepare(`
      SELECT id, name, key_prefix, scopes, last_used_at, expires_at, is_active, created_at
      FROM api_keys
      ORDER BY created_at DESC
    `).all();

    return NextResponse.json({ ok: true, data: rows });
  } catch (e) {
    return apiError(e);
  }
}

// POST /api/admin/api-keys — create new key
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "integrations:update")) {
      return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
    }

    const { name, scopes = "read", expires_at } = await req.json();
    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Anahtar adı gerekli" }, { status: 400 });
    }

    const rawKey = generateApiKey();
    const hash = hashKey(rawKey);
    const prefix = rawKey.slice(0, 8);
    const id = uuidv4();
    const now = nowIso();

    const db = getDb();
    await db.prepare(`
      INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, scopes, expires_at, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, user.id, name, hash, prefix, scopes, expires_at ?? null, now, now);

    // Return raw key ONCE — it will never be shown again
    return NextResponse.json({ ok: true, id, key: rawKey, prefix }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
