import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { cariTedarikciUpdateSchema } from "@/lib/schemas";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "cari_tedarikci:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const parsed = cariTedarikciUpdateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const d = parsed.data;

    const db = getDb();
    const existing = await db.prepare("SELECT id FROM cari_tedarikci WHERE id = ?").get(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Cari bulunamadı" }, { status: 404 });

    const fields: string[] = ["updated_at = ?"];
    const values: any[] = [nowIso()];
    for (const [key, val] of Object.entries(d)) {
      if (val === undefined) continue;
      fields.push(`${key} = ?`);
      values.push(key === "is_active" ? (val ? 1 : 0) : val);
    }
    values.push(id);
    await db.prepare(`UPDATE cari_tedarikci SET ${fields.join(", ")} WHERE id = ?`).run(...values);

    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "cari_tedarikci:delete"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    await db.prepare("UPDATE cari_tedarikci SET is_active = 0, updated_at = ? WHERE id = ?").run(nowIso(), id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
