import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { aracIsBasvuruUpdateSchema } from "@/lib/schemas";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "arac_is_basvuru:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const raw = await req.json();
    const parsed = aracIsBasvuruUpdateSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const d = parsed.data;

    const db = getDb();
    const existing = await db.prepare("SELECT id FROM arac_is_basvuru WHERE id = ?").get(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Başvuru bulunamadı" }, { status: 404 });

    const fields: string[] = ["updated_at = ?"];
    const values: unknown[] = [nowIso()];
    for (const [key, val] of Object.entries(d)) {
      if (val === undefined) continue;
      fields.push(`${key} = ?`);
      values.push(val);
    }
    values.push(id);
    await db.prepare(`UPDATE arac_is_basvuru SET ${fields.join(", ")} WHERE id = ?`).run(...values);

    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "arac_is_basvuru:delete"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    await db.prepare("DELETE FROM arac_is_basvuru WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
