import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

// Sadece çıkış işaretlemek için — kayıt zaten çıkışı yapılmışsa tekrar
// güncellenemez (yanlışlıkla çıkış saatini ezmemek için).
export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "ziyaretci_kaydi:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    const existing = await db.prepare("SELECT id, cikis_zamani FROM ziyaretci_kayitlari WHERE id = ?").get(id) as
      { id: string; cikis_zamani: string | null } | undefined;
    if (!existing) return NextResponse.json({ ok: false, error: "Kayıt bulunamadı" }, { status: 404 });
    if (existing.cikis_zamani) return NextResponse.json({ ok: false, error: "Bu ziyaretçinin çıkışı zaten yapılmış" }, { status: 400 });

    const now = nowIso();
    await db.prepare("UPDATE ziyaretci_kayitlari SET cikis_zamani = ?, updated_at = ? WHERE id = ?").run(now, now, id);

    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
