import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { finansKasaBankaSchema } from "@/lib/schemas";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_kasa_banka:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const raw = await req.json();

    if (raw.action === "durum-degistir") {
      await getDb().prepare(`UPDATE finans_kasa_banka_hesabi SET is_active = ?, updated_at = ? WHERE id = ?`)
        .run(raw.is_active ? 1 : 0, nowIso(), id);
      return NextResponse.json({ ok: true });
    }

    const parsed = finansKasaBankaSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const { ad, tip, banka_adi, iban, para_birimi_kod, acilis_bakiyesi, company_id } = parsed.data;

    const db = getDb();
    const existing = await db.prepare(`SELECT id FROM finans_kasa_banka_hesabi WHERE id = ?`).get(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    await db.prepare(
      `UPDATE finans_kasa_banka_hesabi
       SET ad = ?, tip = ?, banka_adi = ?, iban = ?, para_birimi_kod = ?, acilis_bakiyesi = ?, company_id = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      ad, tip, banka_adi || null, iban || null,
      para_birimi_kod || "TRY", acilis_bakiyesi ?? 0, company_id || null,
      nowIso(), id
    );

    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_kasa_banka:delete"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    await getDb().prepare(`DELETE FROM finans_kasa_banka_hesabi WHERE id = ?`).run(id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
