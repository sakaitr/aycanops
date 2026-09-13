import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { RequestError } from "@/lib/request-error";
import { dateOnly } from "@/lib/financial-validation";
import { transactionStore } from "@/lib/transaction-store";
import { settlementServices, pricedTotal, serviceSignature } from "@/lib/cetele-pricing";
import { assertCompanyAccess } from "@/lib/company-access";
import { logAudit } from "@/lib/audit";
import { appendFinancialSnapshot, readFinancialSnapshot } from "@/lib/financial-snapshots";

type Agreement = {
  id: string; company_id: string; donem: string | Date; tutar: string | number;
  para_birimi: string; durum: string; itiraz_aciklamasi: string | null;
};
type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "firma_mutabakat:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { id } = await params;
    const db = getDb();
    const row = await db.prepare(`SELECT m.*, c.name AS company_name FROM firma_mutabakat m
      JOIN companies c ON c.id = m.company_id WHERE m.id = ?`).get<Agreement>(id);
    if (!row) throw new RequestError("Bulunamadı", 404);
    assertCompanyAccess(user, row.company_id);
    // New approvals retain their service/price evidence in the transactional audit.
    // Legacy approved rows have no such evidence; report that explicitly.
    const approval = row.durum === "onaylandi" ? await db.prepare(`SELECT details_json FROM audit_log
      WHERE entity_type='firma_mutabakat' AND entity_id=? AND action='firma_mutabakat.onayla' ORDER BY created_at DESC LIMIT 1`)
      .get<{ details_json: string }>(id) : undefined;
    const evidence = row.durum === "onaylandi" ? await readFinancialSnapshot(db, "firma_mutabakat", id, ["onayla"]) : null;
    const saved = evidence?.services ?? (approval ? JSON.parse(approval.details_json).services : null);
    const services: Awaited<ReturnType<typeof settlementServices>> = Array.isArray(saved) ? saved
      : await settlementServices(db, row.company_id, dateOnly(row.donem));
    return NextResponse.json({ ok: true, data: { ...row, cetele: services,
      calculation_source: evidence ? "financial_snapshot" : Array.isArray(saved) ? "approval_audit" : "live",
      historical_evidence_missing: row.durum === "onaylandi" && !Array.isArray(saved),
      missing_price_count: services.filter(s => s.price_id == null).length } });
  } catch (e) { return apiError(e); }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    const { id } = await params;
    const body = await req.json();
    return await getDb().transaction(async conn => {
      const db = transactionStore(conn);
      const existing = await db.prepare("SELECT * FROM firma_mutabakat WHERE id = ? FOR UPDATE").get<Agreement>(id);
      if (!existing) throw new RequestError("Bulunamadı", 404);
      assertCompanyAccess(user, existing.company_id);
      const permission = body.action === "onayla" ? "firma_mutabakat:approve"
        : body.action === "itiraz" ? "firma_mutabakat:reject"
        : body.action === "yeniden-hesapla" ? "firma_mutabakat:update" : null;
      if (!permission) throw new RequestError("Geçersiz işlem");
      if (!hasPermission(user, permission)) throw new RequestError("Yetersiz yetki", 403);
      const allowedStates = body.action === "yeniden-hesapla" ? ["bekliyor", "itiraz"] : ["bekliyor"];
      if (!allowedStates.includes(existing.durum)) throw new RequestError("Bu durumdaki mutabakat için işlem yapılamaz");
      const now = nowIso();
      let services: Awaited<ReturnType<typeof settlementServices>> | undefined;
      let tutar = Number(existing.tutar);
      if (body.action !== "itiraz") {
        services = await settlementServices(db, existing.company_id, dateOnly(existing.donem));
        tutar = pricedTotal(services, existing.para_birimi);
        if (body.action === "onayla") {
          const calculation = await db.prepare(`SELECT details_json FROM audit_log WHERE entity_type='firma_mutabakat' AND entity_id=?
            AND action IN ('firma_mutabakat.create','firma_mutabakat.yeniden-hesapla') ORDER BY created_at DESC LIMIT 1`)
            .get<{ details_json: string }>(id);
          const evidence = await readFinancialSnapshot(db, "firma_mutabakat", id, ["create", "yeniden-hesapla"]);
          const savedServices = evidence?.services ?? (calculation ? JSON.parse(calculation.details_json).services : null);
          if (!Array.isArray(savedServices) || serviceSignature(savedServices) !== serviceSignature(services))
            throw new RequestError("Hesap dayanağı değişmiş veya eski kayıtta saklanmamış. Onaylamadan önce yeniden hesaplayın", 409);
        }
        if (body.action === "onayla" && Math.round(Number(existing.tutar) * 100) !== Math.round(tutar * 100))
          throw new RequestError("Hizmet veya fiyat değişti. Onaylamadan önce mutabakatı yeniden hesaplayın", 409);
      }
      if (body.action === "onayla") {
        await db.prepare("UPDATE firma_mutabakat SET durum = 'onaylandi', onay_tarihi = ?, updated_at = ? WHERE id = ?").run(now, now, id);
      } else if (body.action === "itiraz") {
        await db.prepare("UPDATE firma_mutabakat SET durum = 'itiraz', itiraz_aciklamasi = ?, updated_at = ? WHERE id = ?").run(body.itiraz_aciklamasi || null, now, id);
      } else {
        await db.prepare("UPDATE firma_mutabakat SET tutar = ?, durum = 'bekliyor', updated_at = ? WHERE id = ?").run(tutar, now, id);
      }
      if (services) await appendFinancialSnapshot(conn, "firma_mutabakat", id, body.action, user.id,
        { before: existing, tutar, currency: existing.para_birimi, services });
      await logAudit({ actorUserId: user.id, action: "firma_mutabakat." + body.action, entityType: "firma_mutabakat", entityId: id,
        details: { before: existing, tutar, services, itiraz_aciklamasi: body.itiraz_aciklamasi ?? null } }, conn);
      return NextResponse.json({ ok: true, ...(body.action === "yeniden-hesapla" ? { data: { tutar } } : {}) });
    });
  } catch (e) { return apiError(e); }
}
