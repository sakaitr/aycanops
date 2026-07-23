import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";
import { nowIso } from "@/lib/time";

const VALID_DURUM = ["acik", "islemde", "cozuldu", "kapandi"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "musteri_destek:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    const existing = await db.prepare("SELECT id FROM portal_tickets WHERE id = ?").get(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Talep bulunamadı" }, { status: 404 });

    const { durum } = await req.json();
    if (!VALID_DURUM.includes(durum))
      return NextResponse.json({ ok: false, error: "Geçersiz durum" }, { status: 400 });

    await db.prepare("UPDATE portal_tickets SET durum = ?, assigned_to = ?, updated_at = ? WHERE id = ?")
      .run(durum, user.id, nowIso(), id);

    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
