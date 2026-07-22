import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { companyCreateSchema } from "@/lib/schemas";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "companies:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(9999, Math.max(1, parseInt(searchParams.get("limit") || "100")));
    const offset = (page - 1) * limit;
    const db = getDb();
    // Restrict to allowed companies if set (admins bypass)
    const allowedIds: string[] | null =
      user.role !== "admin" && user.allowed_companies
        ? JSON.parse(user.allowed_companies)
        : null;

    let query = `
      SELECT c.*, COUNT(cv.id) as vehicle_count,
        u.full_name as responsible_name,
        (SELECT GROUP_CONCAT(ru.full_name ORDER BY ru.full_name SEPARATOR ', ')
         FROM company_responsible cr2 JOIN users ru ON ru.id = cr2.user_id
         WHERE cr2.company_id = c.id) as responsible_names
      FROM companies c
      LEFT JOIN company_vehicles cv ON cv.company_id = c.id AND cv.is_active = 1
      LEFT JOIN users u ON u.id = c.responsible_id
      WHERE c.is_active = 1`;
    const qParams: any[] = [];

    if (user.role === "yetkili") {
      // Yetkili: pivot tablodan atandığı firmalar
      query += ` AND EXISTS (SELECT 1 FROM company_responsible cr WHERE cr.company_id = c.id AND cr.user_id = ?)`;
      qParams.push(user.id);
    } else if (allowedIds && allowedIds.length > 0) {
      query += ` AND c.id IN (${allowedIds.map(() => "?").join(",")})`;
      qParams.push(...allowedIds);
    } else if (allowedIds && allowedIds.length === 0) {
      return NextResponse.json({ ok: true, data: [] });
    }
    const countRow = await db.prepare(`SELECT COUNT(*) as total FROM (${query} GROUP BY c.id) _t`).get(...qParams) as { total: number };
    const total = countRow.total;
    query += " GROUP BY c.id ORDER BY c.name ASC LIMIT ? OFFSET ?";
    const data = await db.prepare(query).all(...qParams, limit, offset);
    return NextResponse.json({ ok: true, data, meta: { total, page, limit, pages: Math.ceil(total / limit) } });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "companies:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const body = await req.json();
    const parsed = companyCreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const { name, notes } = parsed.data;
    const db = getDb();
    const now = nowIso();
    // Aynı isimde silinmiş (is_active=0) firma varsa yeniden aktifleştir
    const existing = await db.prepare(
      "SELECT id FROM companies WHERE name = ? AND is_active = 0"
    ).get(name.trim()) as { id: string } | undefined;
    if (existing) {
      await db.prepare(
        "UPDATE companies SET is_active = 1, notes = ?, updated_at = ? WHERE id = ?"
      ).run(notes || null, now, existing.id);
      return NextResponse.json({ ok: true, data: { id: existing.id } });
    }
    const id = uuidv4();
    await db.prepare(
      "INSERT INTO companies (id, name, notes, is_active, created_by, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?)"
    ).run(id, name.trim(), notes || null, user.id, now, now);
    return NextResponse.json({ ok: true, data: { id } });
  } catch (e) { return apiError(e); }
}
