import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { validateStoredHakedis } from "@/lib/financial-validation";
import { transactionStore } from "@/lib/transaction-store";
import { logAudit } from "@/lib/audit";

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
      const reason = await db.transaction(async conn => {
      const tx = transactionStore(conn);
      const existing = await tx.prepare(`SELECT * FROM hakedis WHERE id = ? FOR UPDATE`).get<{ id: string; durum: string } & Record<string, unknown>>(id);
      if (!existing) return "Bulunamadı";
      if (existing.durum !== "taslak") return "Taslak değil";
      try { validateStoredHakedis(existing); }
      catch (e) { return e instanceof Error ? e.message : "Hesap kontrol edilemedi"; }

      await tx.prepare(`UPDATE hakedis SET durum = 'tahakkuk', tahakkuk_tarihi = ?, updated_at = ? WHERE id = ?`)
        .run(now, now, id);
      await logAudit({ actorUserId: user.id, action: "hakedis.tahakkuk", entityType: "hakedis", entityId: id,
        details: { before: existing, after: { ...existing, durum: "tahakkuk", tahakkuk_tarihi: now, updated_at: now }, source: "bulk" } }, conn);
      return null;
      });
      if (reason) skipped.push({ id, reason });
      else updated++;
    }

    return NextResponse.json({ ok: true, data: { updated, skipped } });
  } catch (e) { return apiError(e); }
}
