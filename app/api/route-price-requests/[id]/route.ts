import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import type { ResultSetHeader } from "mysql2/promise";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";
import { routePriceRequestDecisionSchema } from "@/lib/schemas";

async function canApprove(user: { id: string; role: string; username?: string }) {
  if (user.role === "admin" || user.username === "admin") return true;
  const row = await getDb().prepare("SELECT can_approve FROM route_price_authorities WHERE user_id = ? LIMIT 1").get(user.id) as { can_approve: number } | undefined;
  return !!row?.can_approve;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser() as any;
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    const parsed = routePriceRequestDecisionSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const permission = parsed.data.status === "approved" ? "route_prices:approve" : "route_prices:reject";
    if (!hasPermission(user, permission) || !(await canApprove(user))) return NextResponse.json({ ok: false, error: "Fiyat onay yetkiniz yok" }, { status: 403 });
    const { id } = await params;
    const db = getDb();
    const request = await db.prepare("SELECT * FROM route_price_requests WHERE id = ? LIMIT 1").get(id) as any;
    if (!request) return NextResponse.json({ ok: false, error: "Fiyat talebi bulunamadı" }, { status: 404 });
    if (request.status !== "pending") return NextResponse.json({ ok: false, error: "Bu talep zaten sonuçlanmış" }, { status: 409 });
    const now = nowIso();

    const result = await db.transaction(async (conn) => {
      let priceId: string | null = null;
      let closed = 0;
      if (parsed.data.status === "approved") {
        const [overlaps] = await conn.execute<any[]>(
          `SELECT id, valid_from FROM route_supplier_prices
           WHERE company_id=? AND route_id=? AND supplier_id=?
             AND valid_from <= COALESCE(?, '9999-12-31')
             AND COALESCE(valid_to, '9999-12-31') >= ?`,
          [request.company_id, request.route_id, request.supplier_id, request.valid_to || null, request.valid_from]
        );
        for (const row of overlaps) {
          if (row.valid_from === request.valid_from) continue;
          const [updateResult] = await conn.execute<ResultSetHeader>(
            "UPDATE route_supplier_prices SET valid_to = DATE_SUB(?, INTERVAL 1 DAY), updated_at=? WHERE id=? AND (valid_to IS NULL OR valid_to >= ?)",
            [request.valid_from, now, row.id, request.valid_from]
          );
          closed += updateResult.affectedRows || 0;
        }
        priceId = uuidv4();
        await conn.execute(
          `INSERT INTO route_supplier_prices (id, company_id, route_id, supplier_id, price_amount, currency, valid_from, valid_to, source_request_id, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [priceId, request.company_id, request.route_id, request.supplier_id, request.requested_price_amount, request.currency, request.valid_from, request.valid_to || null, id, user.id, now, now]
        );
      }
      await conn.execute(
        "UPDATE route_price_requests SET status=?, decided_by=?, decided_at=?, decision_note=?, updated_at=? WHERE id=?",
        [parsed.data.status, user.id, now, parsed.data.decision_note || null, now, id]
      );
      return { price_id: priceId, closed_price_count: closed };
    });

    await logAudit({ actorUserId: user.id, action: `route_price_request.${parsed.data.status}`, entityType: "route_price_requests", entityId: id, details: result });
    return NextResponse.json({ ok: true, data: result });
  } catch (e) { return apiError(e); }
}
