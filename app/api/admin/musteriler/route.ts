import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { hashPortalPassword } from "@/lib/portal-auth";
import { apiError } from "@/lib/api-error";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "portal_requests:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const companyFilter = searchParams.get("company_id") || "";

    const db = getDb();
    let sql = `
      SELECT cu.id, cu.company_id, cu.email, cu.full_name, cu.is_active,
             cu.last_login_at, cu.created_at, c.name as company_name
      FROM customer_users cu
      JOIN companies c ON c.id = cu.company_id
      WHERE 1=1`;
    const params: unknown[] = [];

    if (companyFilter) {
      sql += " AND cu.company_id = ?";
      params.push(companyFilter);
    }
    sql += " ORDER BY c.name ASC, cu.full_name ASC";

    const data = await db.prepare(sql).all<any>(...params);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "portal_requests:approve"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { company_id, email, full_name, password } = await req.json();
    if (!company_id || !email?.trim() || !full_name?.trim() || !password) {
      return NextResponse.json(
        { ok: false, error: "Firma, e-posta, isim ve şifre zorunludur" },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { ok: false, error: "Şifre en az 8 karakter olmalıdır" },
        { status: 400 }
      );
    }

    const db = getDb();
    const existing = await db
      .prepare("SELECT id FROM customer_users WHERE email = ?")
      .get<{ id: string }>(email.trim().toLowerCase());
    if (existing) {
      return NextResponse.json(
        { ok: false, error: "Bu e-posta adresi zaten kullanımda" },
        { status: 409 }
      );
    }

    const id = uuidv4();
    const now = nowIso();
    const hash = hashPortalPassword(password);
    await db
      .prepare(
        `INSERT INTO customer_users (id, company_id, email, password_hash, full_name, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .run(id, company_id, email.trim().toLowerCase(), hash, full_name.trim(), now, now);

    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return apiError(e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "portal_requests:approve"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id, full_name, is_active, password } = await req.json();
    if (!id) return NextResponse.json({ ok: false, error: "ID gerekli" }, { status: 400 });

    const db = getDb();
    const now = nowIso();

    if (password) {
      if (password.length < 8) {
        return NextResponse.json(
          { ok: false, error: "Şifre en az 8 karakter olmalıdır" },
          { status: 400 }
        );
      }
      const hash = hashPortalPassword(password);
      await db
        .prepare(
          "UPDATE customer_users SET password_hash = ?, full_name = ?, is_active = ?, updated_at = ? WHERE id = ?"
        )
        .run(hash, full_name, is_active ? 1 : 0, now, id);
    } else {
      await db
        .prepare(
          "UPDATE customer_users SET full_name = ?, is_active = ?, updated_at = ? WHERE id = ?"
        )
        .run(full_name, is_active ? 1 : 0, now, id);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "portal_requests:delete"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "ID gerekli" }, { status: 400 });

    const db = getDb();
    await db.prepare("DELETE FROM portal_sessions WHERE customer_user_id = ?").run(id);
    await db.prepare("DELETE FROM customer_users WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
