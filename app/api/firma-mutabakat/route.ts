import { RequestError } from "@/lib/request-error";
import { dateOnly } from "@/lib/financial-validation";
import { transactionStore } from "@/lib/transaction-store";
import { settlementServices, pricedTotal } from "@/lib/cetele-pricing";
import { assertCompanyAccess } from "@/lib/company-access";
import { logAudit } from "@/lib/audit";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { appendFinancialSnapshot } from "@/lib/financial-snapshots";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "firma_mutabakat:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const company_id = searchParams.get("company_id") || "";
    const durum = searchParams.get("durum") || "";
    const limit = Math.min(500, parseInt(searchParams.get("limit") || "100"));

    if (company_id && user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(company_id)) {
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
      }
    }

    const db = getDb();
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (company_id) { conditions.push("m.company_id = ?"); params.push(company_id); }
    else if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (allowed.length === 0) return NextResponse.json({ ok: true, data: [] });
      conditions.push(`m.company_id IN (${allowed.map(() => "?").join(",")})`);
      params.push(...allowed);
    }
    if (durum) { conditions.push("m.durum = ?"); params.push(durum); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await db.prepare(
      `SELECT m.*, c.name AS company_name
       FROM firma_mutabakat m
       JOIN companies c ON c.id = m.company_id
       ${where}
       ORDER BY m.donem DESC
       LIMIT ?`
    ).all(...params, limit);

    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "firma_mutabakat:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const body = await req.json();
    if (!body.company_id) throw new RequestError("Firma seçiniz");
    assertCompanyAccess(user, body.company_id);
    const period = dateOnly(body.donem).slice(0, 8) + "01";
    const data = await getDb().transaction(async conn => {
      const db = transactionStore(conn);
      const company = await db.prepare("SELECT id FROM companies WHERE id = ? FOR UPDATE").get(body.company_id);
      if (!company) throw new RequestError("Firma bulunamadı", 404);
      const existing = await db.prepare("SELECT id FROM firma_mutabakat WHERE company_id = ? AND donem = ? FOR UPDATE").get(body.company_id, period);
      if (existing) throw new RequestError("Bu firma için bu dönemde zaten mutabakat var");
      const services = await settlementServices(db, body.company_id, period);
      const tutar = pricedTotal(services);
      const id = uuidv4(), now = nowIso();
      await db.prepare(`INSERT INTO firma_mutabakat
        (id, company_id, donem, tutar, para_birimi, durum, gonderilis_tarihi, aciklama, created_by, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id, body.company_id, period, tutar, "TRY", "bekliyor", now, body.aciklama || null, user.id, now, now);
      await appendFinancialSnapshot(conn, "firma_mutabakat", id, "create", user.id,
        { company_id: body.company_id, period, tutar, currency: "TRY", services });
      await logAudit({ actorUserId: user.id, action: "firma_mutabakat.create", entityType: "firma_mutabakat", entityId: id,
        details: { company_id: body.company_id, period, tutar, currency: "TRY", services } }, conn);
      return { id, tutar };
    });
    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (e) { return apiError(e); }
}
