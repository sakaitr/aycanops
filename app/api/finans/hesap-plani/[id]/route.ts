import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { finansHesapPlaniSchema } from "@/lib/schemas";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_hesap_plani:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const raw = await req.json();

    if (raw.action === "durum-degistir") {
      await getDb().prepare(`UPDATE finans_hesap_plani SET is_active = ?, updated_at = ? WHERE id = ?`)
        .run(raw.is_active ? 1 : 0, nowIso(), id);
      return NextResponse.json({ ok: true });
    }

    const parsed = finansHesapPlaniSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const { kod, ad, ust_hesap_id, tip } = parsed.data;

    const db = getDb();
    const existing = await db.prepare(`SELECT id FROM finans_hesap_plani WHERE id = ?`).get(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    await db.prepare(
      `UPDATE finans_hesap_plani SET kod = ?, ad = ?, ust_hesap_id = ?, tip = ?, updated_at = ? WHERE id = ?`
    ).run(kod, ad, ust_hesap_id || null, tip, nowIso(), id);

    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_hesap_plani:delete"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    await getDb().prepare(`DELETE FROM finans_hesap_plani WHERE id = ?`).run(id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
