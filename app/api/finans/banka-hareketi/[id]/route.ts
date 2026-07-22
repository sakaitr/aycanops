import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";

// Bu kaynak için tek mutasyon "eslestir" (manuel eşleştirme onayı) —
// eslesen_tip/eslesen_id çiftini set eder. Başka bir action tanımlı değil
// (brief'in Step 1-2 kapsamı: "sadece action: 'eslestir' ile ... günceller").
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_banka_hareketi:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const raw = await req.json();
    if (raw?.action !== "eslestir")
      return NextResponse.json({ ok: false, error: "Geçersiz işlem" }, { status: 400 });

    const eslesenTip = raw.eslesen_tip;
    const eslesenId = raw.eslesen_id;
    if (eslesenTip !== "fatura" && eslesenTip !== "odeme")
      return NextResponse.json({ ok: false, error: "eslesen_tip 'fatura' veya 'odeme' olmalıdır" }, { status: 400 });
    if (!eslesenId || typeof eslesenId !== "string")
      return NextResponse.json({ ok: false, error: "eslesen_id zorunludur" }, { status: 400 });

    const db = getDb();
    const existing = await db.prepare(`SELECT id FROM finans_banka_hareketi WHERE id = ?`).get(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    // eslesen_tip/eslesen_id polimorfik olduğu için DB'de FK yok — hedef
    // kaydın gerçekten var olduğunu burada doğruluyoruz. Tablo adı yalnızca
    // yukarıda enum kontrolünden geçmiş iki sabit değerden biri olabilir,
    // kullanıcı girdisi doğrudan SQL'e enjekte edilmiyor.
    const targetTable = eslesenTip === "fatura" ? "finans_fatura" : "finans_odeme";
    const target = await db.prepare(`SELECT id FROM ${targetTable} WHERE id = ?`).get(eslesenId);
    if (!target)
      return NextResponse.json(
        { ok: false, error: eslesenTip === "fatura" ? "Fatura bulunamadı" : "Ödeme bulunamadı" },
        { status: 400 }
      );

    await db.prepare(
      `UPDATE finans_banka_hareketi SET eslesen_tip = ?, eslesen_id = ? WHERE id = ?`
    ).run(eslesenTip, eslesenId, id);

    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
