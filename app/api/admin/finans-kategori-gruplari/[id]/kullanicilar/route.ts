import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_kategori_grubu:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const rows = await getDb().prepare(
      "SELECT user_id FROM finans_kategori_grup_kullanici WHERE grup_id = ?"
    ).all(id) as { user_id: string }[];
    return NextResponse.json({ ok: true, data: rows.map(r => r.user_id) });
  } catch (e) { return apiError(e); }
}

// PUT: grubun kullanıcı üyeliğini tam listeyle değiştirir
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_kategori_grubu:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const userIds: string[] = Array.isArray(body.user_ids) ? body.user_ids : [];

    const db = getDb();
    await db.prepare("DELETE FROM finans_kategori_grup_kullanici WHERE grup_id = ?").run(id);
    for (const uid of userIds) {
      await db.prepare("INSERT IGNORE INTO finans_kategori_grup_kullanici (grup_id, user_id) VALUES (?, ?)").run(id, uid);
    }
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
