import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { navConfigSchema } from "@/lib/schemas";

// Herkes (giriş yapmış her kullanıcı) okuyabilir — Nav.tsx her sayfada
// bunu fetch ediyor, sadece admin panelinden düzenleme kısıtlı.
export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const row = await getDb().prepare(
      `SELECT config_json FROM nav_config WHERE id = 'singleton'`
    ).get() as { config_json: string } | undefined;

    if (!row) return NextResponse.json({ ok: false, error: "Nav config bulunamadı" }, { status: 404 });

    const config = typeof row.config_json === "string" ? JSON.parse(row.config_json) : row.config_json;
    return NextResponse.json({ ok: true, data: config });
  } catch (e) { return apiError(e); }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "nav_config:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const raw = await req.json();
    const parsed = navConfigSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });

    const now = nowIso();
    await getDb().prepare(
      `UPDATE nav_config SET config_json = ?, updated_by = ?, updated_at = ? WHERE id = 'singleton'`
    ).run(JSON.stringify(parsed.data), user.id, now);

    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
