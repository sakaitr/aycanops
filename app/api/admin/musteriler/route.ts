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
      sql += " AND EXISTS (SELECT 1 FROM customer_user_companies cuc WHERE cuc.customer_user_id = cu.id AND cuc.company_id = ?)";
      params.push(companyFilter);
    }
    sql += " ORDER BY c.name ASC, cu.full_name ASC";

    const data = await db.prepare(sql).all<any>(...params);

    const companyRows = await db.prepare(
      `SELECT cuc.customer_user_id, c.id, c.name
       FROM customer_user_companies cuc JOIN companies c ON c.id = cuc.company_id`
    ).all<{ customer_user_id: string; id: string; name: string }>();
    const byUser = new Map<string, { id: string; name: string }[]>();
    for (const r of companyRows) {
      const list = byUser.get(r.customer_user_id) ?? [];
      list.push({ id: r.id, name: r.name });
      byUser.set(r.customer_user_id, list);
    }
    const enriched = data.map(u => ({ ...u, companies: byUser.get(u.id) ?? [] }));

    return NextResponse.json({ ok: true, data: enriched });
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

    const body = await req.json();
    const { email, full_name, password } = body;
    const company_ids: string[] = Array.isArray(body.company_ids) && body.company_ids.length > 0
      ? body.company_ids
      : body.company_id ? [body.company_id] : [];
    if (company_ids.length === 0 || !email?.trim() || !full_name?.trim() || !password) {
      return NextResponse.json(
        { ok: false, error: "En az bir firma, e-posta, isim ve şifre zorunludur" },
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
      .run(id, company_ids[0], email.trim().toLowerCase(), hash, full_name.trim(), now, now);

    for (const cid of company_ids) {
      await db.prepare(
        `INSERT IGNORE INTO customer_user_companies (customer_user_id, company_id, created_at) VALUES (?, ?, ?)`
      ).run(id, cid, now);
    }

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

    const { id, full_name, is_active, password, company_ids } = await req.json();
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

    if (Array.isArray(company_ids) && company_ids.length > 0) {
      await db.prepare("DELETE FROM customer_user_companies WHERE customer_user_id = ?").run(id);
      for (const cid of company_ids) {
        await db.prepare(
          `INSERT IGNORE INTO customer_user_companies (customer_user_id, company_id, created_at) VALUES (?, ?, ?)`
        ).run(id, cid, now);
      }
      // customer_users.company_id varsayılan/birincil firma referansı — ilk seçilene güncellenir
      await db.prepare("UPDATE customer_users SET company_id = ? WHERE id = ?").run(company_ids[0], id);
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
