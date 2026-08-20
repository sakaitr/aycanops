import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { updateHareketOdeme } from "@/lib/finans-hareket";

const VALID = ["odenmedi", "kismen_odendi", "odendi"] as const;

// PATCH /api/finans/gider/[id]/odeme — sadece ödeme durumunu işaretler.
// Ayrı, dar bir uç: genel finans_gider:update yetkisinden bağımsız,
// "izin onaylayıcı" gibi seçili kişilere Roller ve Yetkiler'den atanan
// finans_gider:odeme_isaretle izniyle çalışır.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_gider:odeme_isaretle"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const raw = await req.json();
    const odeme_durumu = raw?.odeme_durumu;
    if (!VALID.includes(odeme_durumu)) {
      return NextResponse.json({ ok: false, error: "Geçersiz ödeme durumu" }, { status: 400 });
    }

    const db = getDb();
    const existing = await db.prepare("SELECT id, tutar FROM finans_gider WHERE id = ?").get(id) as
      { id: string; tutar: number } | undefined;
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    const odenenTutar = odeme_durumu === "odendi" ? Number(existing.tutar)
      : odeme_durumu === "odenmedi" ? 0
      : raw?.odenen_tutar != null ? Number(raw.odenen_tutar) : Number(existing.tutar) / 2;

    await db.prepare(
      "UPDATE finans_gider SET odeme_durumu = ?, updated_at = ? WHERE id = ?"
    ).run(odeme_durumu, nowIso(), id);
    await updateHareketOdeme("gider", id, odeme_durumu, odenenTutar);

    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
