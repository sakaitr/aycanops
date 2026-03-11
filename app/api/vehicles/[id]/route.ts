import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isAtLeast } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { vehicleUpdateSchema } from "@/lib/schemas";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    const { id } = await params;
    const db = getDb();
    const vehicle = await db.prepare(
      `SELECT v.*, u.full_name as creator_name FROM vehicles v
       LEFT JOIN users u ON u.id = v.created_by WHERE v.id = ?`
    ).get(id);
    if (!vehicle) return NextResponse.json({ ok: false, error: "Araç bulunamadı" }, { status: 404 });
    return NextResponse.json({ ok: true, data: vehicle });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!isAtLeast(user.role, "yetkili"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { id } = await params;
    const raw = await req.json();
    const parsed = vehicleUpdateSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const body = parsed.data;
    const db = getDb();
    const now = nowIso();
    const fields = ["plate", "type", "capacity", "brand", "model", "year", "driver_name", "driver_phone", "status_code", "notes"] as const;
    const sets = fields.filter(f => body[f] !== undefined).map(f => `${f} = ?`);
    const vals = fields.filter(f => body[f] !== undefined).map(f => body[f]);
    if (sets.length === 0) return NextResponse.json({ ok: false, error: "Güncellenecek alan yok" }, { status: 400 });
    await db.prepare(`UPDATE vehicles SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`).run(...vals, now, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!isAtLeast(user.role, "yonetici"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { id } = await params;
    const db = getDb();
    await db.prepare("DELETE FROM vehicles WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
