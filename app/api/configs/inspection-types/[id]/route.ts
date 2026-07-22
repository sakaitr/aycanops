import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "inspection_configs:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const { label, code } = await req.json();
    if (!label?.trim()) return NextResponse.json({ ok: false, error: "Etiket zorunlu" }, { status: 400 });

    const db = getDb();
    const now = nowIso();
    const result = await db.prepare(
      "UPDATE config_inspection_types SET label = ?, code = ?, updated_at = ? WHERE id = ? AND is_active = 1"
    ).run(label.trim(), code?.trim() || label.trim().toLowerCase(), now, id);

    if (result.affectedRows === 0)
      return NextResponse.json({ ok: false, error: "Tür bulunamadı" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[PUT inspection-type]", e);
    if (e?.message?.includes("UNIQUE"))
      return NextResponse.json({ ok: false, error: "Bu kod zaten kullanımda" }, { status: 409 });
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
    if (!hasPermission(user, "inspection_configs:delete"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    const now = nowIso();
    const result = await db.prepare(
      "UPDATE config_inspection_types SET is_active = 0, updated_at = ? WHERE id = ?"
    ).run(now, id);

    if (result.affectedRows === 0)
      return NextResponse.json({ ok: false, error: "Tür bulunamadı" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE inspection-type]", e);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
