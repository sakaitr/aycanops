import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { logAudit } from "@/lib/audit";
import { RequestError } from "@/lib/request-error";
import { transactionStore } from "@/lib/transaction-store";
import { assertCompanyAccess } from "@/lib/company-access";
import { validatePlanForPublication, assertNoResourceConflict, type RoutePlan } from "@/lib/route-plan-validation";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "routes:publish")) throw new RequestError("Yetersiz yetki", 403);
    const { id } = await params;
    const body = await req.json();
    const target = body.archive === true ? "archived" : body.activate === true ? "active" : "published";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (target === "archived" && !reason) throw new RequestError("Arşivleme gerekçesi gerekli");
    const initial = await getDb().prepare("SELECT company_id FROM route_plans WHERE id=?").get<{ company_id: string | null }>(id);
    if (!initial) throw new RequestError("Plan bulunamadı", 404);
    assertCompanyAccess(user, initial.company_id);
    return await getDb().transaction(async conn => {
      const db = transactionStore(conn);
      // Serialize company activations before locking competing plans.
      const company = await db.prepare("SELECT is_active FROM companies WHERE id=? FOR UPDATE")
        .get<{ is_active: number }>(initial.company_id);
      const plan = await db.prepare("SELECT * FROM route_plans WHERE id=? FOR UPDATE").get<RoutePlan>(id);
      if (!plan) throw new RequestError("Plan bulunamadı", 404);
      if (plan.company_id !== initial.company_id) throw new RequestError("Plan değişti; yeniden yükleyin", 409);
      if (!["draft", "published", "active"].includes(plan.status)) throw new RequestError("Bu durumdaki plan değiştirilemez", 409);
      const now = nowIso();
      if (target === "archived") {
        await db.prepare("UPDATE route_plans SET status='archived', updated_at=? WHERE id=?").run(now, id);
        await logAudit({ actorUserId: user.id, action: "route_plan.archive", entityType: "route_plan", entityId: id,
          details: { before: plan, after: { ...plan, status: target, updated_at: now }, reason } }, conn);
      } else {
        if (!company || Number(company.is_active) !== 1) throw new RequestError("Yayın için aktif firma gerekli", 409);
        if (plan.status === "active" && target === "published") throw new RequestError("Aktif plan geri yayın durumuna alınamaz; arşivleyin", 409);
        const evidence = await validatePlanForPublication(db, plan);
        if (target === "active") {
          await assertNoResourceConflict(db, plan, evidence.routes.map(r => r.route));
          const previous = await db.prepare("SELECT * FROM route_plans WHERE id<>? AND status='active' AND company_id=? AND shift_id <=> ? AND direction=? FOR UPDATE")
            .all<RoutePlan>(id, plan.company_id, plan.shift_id, plan.direction);
          for (const old of previous) {
            await db.prepare("UPDATE route_plans SET status='archived', updated_at=? WHERE id=?").run(now, old.id);
            await logAudit({ actorUserId: user.id, action: "route_plan.archive", entityType: "route_plan", entityId: old.id,
              details: { before: old, after: { ...old, status: "archived", updated_at: now }, reason: "Yeni plan aktifleştirildi", replacement_id: id } }, conn);
          }
        }
        await db.prepare("UPDATE route_plans SET status=?, published_by=?, published_at=?, updated_at=? WHERE id=?")
          .run(target, user.id, now, now, id);
        await logAudit({ actorUserId: user.id, action: target === "active" ? "route_plan.activate" : "route_plan.publish",
          entityType: "route_plan", entityId: id, details: { before: plan,
            after: { ...plan, status: target, published_by: user.id, published_at: now, updated_at: now }, evidence } }, conn);
      }
      return NextResponse.json({ ok: true, data: { id, status: target } });
    });
  } catch (e) { return apiError(e); }
}
