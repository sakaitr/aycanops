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
    if (!hasPermission(user, "finans_kategori_grubu:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const { ad } = await req.json();
    if (!ad?.trim()) return NextResponse.json({ ok: false, error: "Grup adı zorunlu" }, { status: 400 });

    const db = getDb();
    await db.prepare("UPDATE finans_kategori_grubu SET ad = ?, updated_at = ? WHERE id = ?").run(ad.trim(), nowIso(), id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_kategori_grubu:delete"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    await db.prepare("DELETE FROM finans_kategori_grup_uyelik WHERE grup_id = ?").run(id);
    await db.prepare("DELETE FROM finans_kategori_grup_kullanici WHERE grup_id = ?").run(id);
    await db.prepare("DELETE FROM finans_kategori_grubu WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
