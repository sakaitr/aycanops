import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { nowIso } from "@/lib/time";
import { warningUpdateSchema } from "@/lib/schemas";
import { hasPermission } from "@/lib/permissions";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "warnings:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const parsed = warningUpdateSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });

    const db  = getDb();
    const now = nowIso();
    const { is_done } = parsed.data;
    const done_at = is_done ? now : null;

    const result = await db.prepare(
      "UPDATE warnings SET is_done = ?, done_at = ?, updated_at = ? WHERE id = ?"
    ).run(is_done ? 1 : 0, done_at, now, id);

    if (result.affectedRows === 0)
      return NextResponse.json({ ok: false, error: "Uyarı bulunamadı" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[PUT warning]", e);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "warnings:delete"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    const result = await db.prepare("DELETE FROM warnings WHERE id = ?").run(id);

    if (result.affectedRows === 0)
      return NextResponse.json({ ok: false, error: "Uyarı bulunamadı" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE warning]", e);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
