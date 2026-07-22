import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "arac_gruplari:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const existing = await db.prepare(`SELECT id FROM arac_gruplari WHERE id = ?`).get(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });
    const now = nowIso();

    if (body.action === "durum-degistir") {
      await db.prepare(`UPDATE arac_gruplari SET is_active = ?, updated_at = ? WHERE id = ?`)
        .run(body.is_active ? 1 : 0, now, id);
      return NextResponse.json({ ok: true });
    }

    if (!body.grup_adi?.trim()) return NextResponse.json({ ok: false, error: "Grup adı zorunludur" }, { status: 400 });
    await db.prepare(`UPDATE arac_gruplari SET grup_adi = ?, aciklama = ?, updated_at = ? WHERE id = ?`)
      .run(body.grup_adi.trim(), body.aciklama || null, now, id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "arac_gruplari:delete"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    await getDb().prepare(`DELETE FROM arac_gruplari WHERE id = ?`).run(id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
