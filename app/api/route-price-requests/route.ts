import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";
import { routePriceRequestCreateSchema } from "@/lib/schemas";

async function canRequest(user: { id: string; role: string; username?: string }) {
  if (user.role === "admin" || user.username === "admin") return true;
  const row = await getDb().prepare("SELECT can_request FROM route_price_authorities WHERE user_id = ? LIMIT 1").get(user.id) as { can_request: number } | undefined;
  return !!row?.can_request;
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "route_prices:read")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const params: unknown[] = [];
    let where = "WHERE 1=1";
    if (status) { where += " AND rpr.status = ?"; params.push(status); }
    for (const key of ["company_id", "route_id", "supplier_id"]) {
      const value = searchParams.get(key);
      if (value) { where += ` AND rpr.${key} = ?`; params.push(value); }
    }
    const rows = await getDb().prepare(
      `SELECT rpr.*, c.name AS company_name, r.name AS route_name, s.title AS supplier_title,
              requester.full_name AS requester_name, decider.full_name AS decider_name
       FROM route_price_requests rpr
       JOIN companies c ON c.id = rpr.company_id
       JOIN routes r ON r.id = rpr.route_id
       JOIN suppliers s ON s.id = rpr.supplier_id
            LEFT JOIN users requester ON requester.id = rpr.requested_by
            LEFT JOIN users decider ON decider.id = rpr.decided_by
       ${where}
       ORDER BY FIELD(rpr.status, 'pending', 'approved', 'rejected'), rpr.created_at DESC`
    ).all(...params);
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser() as any;
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "route_prices:request") || !(await canRequest(user))) return NextResponse.json({ ok: false, error: "Fiyat talebi yetkiniz yok" }, { status: 403 });
    const parsed = routePriceRequestCreateSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const data = parsed.data;
    if (data.valid_to && data.valid_to < data.valid_from) return NextResponse.json({ ok: false, error: "Bitiş tarihi başlangıçtan önce olamaz" }, { status: 400 });
    const db = getDb();
    const current = await db.prepare(
      `SELECT id, price_amount FROM route_supplier_prices
       WHERE company_id=? AND route_id=? AND supplier_id=? AND valid_from <= ? AND (valid_to IS NULL OR valid_to >= ?)
       ORDER BY valid_from DESC LIMIT 1`
    ).get(data.company_id, data.route_id, data.supplier_id, data.valid_from, data.valid_from) as { id: string; price_amount: number } | undefined;
    const id = uuidv4();
    const now = nowIso();
    await db.prepare(
      `INSERT INTO route_price_requests (id, company_id, route_id, supplier_id, current_price_id, current_price_amount, requested_price_amount, currency, valid_from, valid_to, reason, status, requested_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
    ).run(id, data.company_id, data.route_id, data.supplier_id, current?.id || null, current?.price_amount ?? null, data.price_amount, data.currency, data.valid_from, data.valid_to || null, data.reason || null, user.id, now, now);
    await logAudit({ actorUserId: user.id, action: "route_price_request.create", entityType: "route_price_requests", entityId: id, details: data });
    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
