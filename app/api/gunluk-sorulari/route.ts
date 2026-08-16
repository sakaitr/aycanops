import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

// GET /api/gunluk-sorulari — aktif soru listesi, herkes okuyabilir (işe
// başlama check-in'inde cevaplamak için). Düzenleme yetkisi ayrı
// (gunluk_soru:*), bkz. /api/admin/gunluk-sorulari.
export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const db = getDb();
    const rows = await db.prepare(
      `SELECT id, label, tip, secenekler, zorunlu, bolum_baslik, detay_label, detay_tip, detay_secenekler, detay_tetikleyici
       FROM gunluk_soru WHERE is_active = 1 ORDER BY sort_order ASC, created_at ASC`
    ).all() as any[];

    return NextResponse.json({
      ok: true,
      data: rows.map(r => ({
        ...r,
        secenekler: r.secenekler ? JSON.parse(r.secenekler) : null,
        zorunlu: !!r.zorunlu,
        detay_secenekler: r.detay_secenekler ? JSON.parse(r.detay_secenekler) : null,
      })),
    });
  } catch (e) { return apiError(e); }
}
