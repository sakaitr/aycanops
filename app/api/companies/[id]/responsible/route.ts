import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

/** GET /api/companies/[id]/responsible — bu firmaya atanmış yetkilileri listele */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "companies:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { id } = await params;

    if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(id)) {
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
      }
    }

    const db = getDb();
    const data = await db.prepare(`
      SELECT cr.id, cr.user_id, u.full_name, u.username, cr.created_at
      FROM company_responsible cr
      JOIN users u ON u.id = cr.user_id
      WHERE cr.company_id = ?
      ORDER BY u.full_name ASC
    `).all(id);
    return NextResponse.json({ ok: true, data });
  } catch (e) { return apiError(e); }
}

/** POST /api/companies/[id]/responsible — firmaya yetkili ekle */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "companies:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { id } = await params;

    if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(id)) {
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
      }
    }
    const { user_id } = await req.json();
    if (!user_id) return NextResponse.json({ ok: false, error: "user_id zorunlu" }, { status: 400 });
    const db = getDb();
    // Kullanıcı var mı?
    const targetUser: any = await db.prepare("SELECT id, role FROM users WHERE id = ? AND is_active = 1").get(user_id);
    if (!targetUser) return NextResponse.json({ ok: false, error: "Kullanıcı bulunamadı" }, { status: 404 });
    const now = nowIso();
    const rid = uuidv4();
    try {
      await db.prepare(
        "INSERT INTO company_responsible (id, company_id, user_id, created_at) VALUES (?, ?, ?, ?)"
      ).run(rid, id, user_id, now);
      // companies.responsible_id'yi de güncelle (ilk yetkili ise)
      const existing: any = await db.prepare("SELECT responsible_id FROM companies WHERE id = ?").get(id);
      if (!existing?.responsible_id) {
        await db.prepare("UPDATE companies SET responsible_id = ?, updated_at = ? WHERE id = ?").run(user_id, now, id);
      }
    } catch (e: any) {
      if (e?.message?.includes("Duplicate") || e?.code === "ER_DUP_ENTRY") {
        return NextResponse.json({ ok: false, error: "Bu kullanıcı zaten bu firmaya atanmış" }, { status: 409 });
      }
      throw e;
    }
    return NextResponse.json({ ok: true, data: { id: rid } });
  } catch (e) { return apiError(e); }
}

/** DELETE /api/companies/[id]/responsible?user_id=xxx — firmadan yetkili kaldır */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "companies:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { id } = await params;

    if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(id)) {
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
      }
    }
    const { searchParams } = new URL(req.url);
    const user_id = searchParams.get("user_id");
    if (!user_id) return NextResponse.json({ ok: false, error: "user_id zorunlu" }, { status: 400 });
    const db = getDb();
    await db.prepare("DELETE FROM company_responsible WHERE company_id = ? AND user_id = ?").run(id, user_id);
    // companies.responsible_id'yi sıfırla veya başka birine güncelle
    const remaining: any = await db.prepare(
      "SELECT user_id FROM company_responsible WHERE company_id = ? LIMIT 1"
    ).get(id);
    const now = nowIso();
    await db.prepare("UPDATE companies SET responsible_id = ?, updated_at = ? WHERE id = ?").run(
      remaining?.user_id ?? null, now, id
    );
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
