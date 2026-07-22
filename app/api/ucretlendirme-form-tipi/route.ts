import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";

export async function GET(_req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "hakedis:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const db = getDb();
    const rows = await db.prepare(
      `SELECT id, form_adi, grup_adi FROM ucretlendirme_form_tipi WHERE is_active = 1 ORDER BY form_adi ASC`
    ).all();

    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}
