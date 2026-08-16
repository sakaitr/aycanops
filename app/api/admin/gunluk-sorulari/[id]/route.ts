import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { gunlukSoruUpdateSchema } from "@/lib/schemas";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "gunluk_soru:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const raw = await req.json();
    const parsed = gunlukSoruUpdateSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const d = parsed.data;

    if (d.detay_tip === "secim" && (!d.detay_secenekler || d.detay_secenekler.length === 0)) {
      return NextResponse.json({ ok: false, error: "Takip sorusu seçim tipi için en az bir seçenek gerekli" }, { status: 400 });
    }
    if (d.detay_label && d.detay_tetikleyici === undefined) {
      return NextResponse.json({ ok: false, error: "Takip sorusu için tetikleyici cevap seçilmeli" }, { status: 400 });
    }

    const db = getDb();
    const existing = await db.prepare("SELECT id FROM gunluk_soru WHERE id = ?").get(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Soru bulunamadı" }, { status: 404 });

    const fields: string[] = ["updated_at = ?"];
    const values: unknown[] = [nowIso()];
    if (d.label !== undefined) { fields.push("label = ?"); values.push(d.label); }
    if (d.tip !== undefined) { fields.push("tip = ?"); values.push(d.tip); }
    if (d.secenekler !== undefined) { fields.push("secenekler = ?"); values.push(d.secenekler ? JSON.stringify(d.secenekler) : null); }
    if (d.zorunlu !== undefined) { fields.push("zorunlu = ?"); values.push(d.zorunlu ? 1 : 0); }
    if (d.bolum_baslik !== undefined) { fields.push("bolum_baslik = ?"); values.push(d.bolum_baslik || null); }
    if (d.detay_label !== undefined) { fields.push("detay_label = ?"); values.push(d.detay_label || null); }
    if (d.detay_tip !== undefined) { fields.push("detay_tip = ?"); values.push(d.detay_tip || null); }
    if (d.detay_secenekler !== undefined) { fields.push("detay_secenekler = ?"); values.push(d.detay_secenekler ? JSON.stringify(d.detay_secenekler) : null); }
    if (d.detay_tetikleyici !== undefined) { fields.push("detay_tetikleyici = ?"); values.push(d.detay_tetikleyici || null); }
    values.push(id);

    await db.prepare(`UPDATE gunluk_soru SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "gunluk_soru:delete"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    await db.prepare("UPDATE gunluk_soru SET is_active = 0, updated_at = ? WHERE id = ?").run(nowIso(), id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
