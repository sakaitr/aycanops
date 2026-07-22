import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";
import { nowIso } from "@/lib/time";

type Params = { params: Promise<{ id: string }> };

// DELETE /api/admin/api-keys/[id] — revoke key
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "integrations:update")) {
      return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
    }

    const { id } = await params;
    const db = getDb();
    await db.prepare(`UPDATE api_keys SET is_active = 0, updated_at = ? WHERE id = ?`).run(nowIso(), id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

// PATCH /api/admin/api-keys/[id] — toggle active / update name
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "integrations:update")) {
      return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
    }

    const { id } = await params;
    const { is_active } = await req.json();
    const db = getDb();
    await db.prepare(`UPDATE api_keys SET is_active = ?, updated_at = ? WHERE id = ?`)
      .run(is_active ? 1 : 0, nowIso(), id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
