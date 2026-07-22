import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isAtLeast } from "@/lib/permissions";

// GET: onaylayıcı olarak işaretli kullanıcılar + tüm aktif kullanıcılar
export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!isAtLeast(user.role, "admin")) {
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    }

    const db = getDb();
    const data = await db.prepare(`
      SELECT id, full_name, role, izin_onaylayici
      FROM users
      WHERE is_active = 1
      ORDER BY full_name ASC
    `).all();

    return NextResponse.json({ ok: true, data });
  } catch {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

// POST: { user_id, izin_onaylayici: 0|1 }
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!isAtLeast(user.role, "admin")) {
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    }

    const { user_id, izin_onaylayici } = await req.json();
    if (!user_id || typeof izin_onaylayici !== "number") {
      return NextResponse.json({ ok: false, error: "Geçersiz veri" }, { status: 400 });
    }

    const db = getDb();
    await db.prepare(
      "UPDATE users SET izin_onaylayici = ? WHERE id = ?"
    ).run(izin_onaylayici ? 1 : 0, user_id);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
