import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

// Birden fazla taslak hakedişi tek seferde tahakkuk durumuna geçirir.
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "hakedis:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
    if (ids.length === 0) return NextResponse.json({ ok: false, error: "En az bir hakediş seçin" }, { status: 400 });

    const db = getDb();
    const now = nowIso();
    let updated = 0;
    const skipped: { id: string; reason: string }[] = [];

    for (const id of ids) {
      const existing = await db.prepare(`SELECT id, durum FROM hakedis WHERE id = ?`).get<{ id: string; durum: string }>(id);
      if (!existing) { skipped.push({ id, reason: "Bulunamadı" }); continue; }
      if (existing.durum !== "taslak") { skipped.push({ id, reason: "Taslak değil" }); continue; }

      await db.prepare(`UPDATE hakedis SET durum = 'tahakkuk', tahakkuk_tarihi = ?, updated_at = ? WHERE id = ?`)
        .run(now, now, id);
      updated++;
    }

    return NextResponse.json({ ok: true, data: { updated, skipped } });
  } catch (e) { return apiError(e); }
}
