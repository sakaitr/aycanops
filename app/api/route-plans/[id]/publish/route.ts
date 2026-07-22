import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "routes:publish")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const targetStatus = body.activate === true ? "active" : "published";
    const db = getDb();
    const plan = await db.prepare("SELECT * FROM route_plans WHERE id = ? LIMIT 1").get<any>(id);
    if (!plan) return NextResponse.json({ ok: false, error: "Plan bulunamadı" }, { status: 404 });
    if (plan.company_id && user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(plan.company_id)) {
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
      }
    }
    if (!["draft", "published", "active"].includes(String(plan.status))) return NextResponse.json({ ok: false, error: "Plan yayınlanamaz" }, { status: 400 });

    const routeCount = await db.prepare("SELECT COUNT(*) AS total FROM route_plan_routes WHERE route_plan_id = ?").get<{ total: number }>(id);
    if ((routeCount?.total ?? 0) === 0) return NextResponse.json({ ok: false, error: "Yayınlamak için en az bir plan rotası gerekli" }, { status: 400 });

    const now = nowIso();
    await db.transaction(async (conn) => {
      if (targetStatus === "active") {
        await conn.execute(
          `UPDATE route_plans SET status='archived', updated_at=?
           WHERE id <> ? AND status='active'
             AND (company_id <=> ?) AND (shift_id <=> ?) AND direction = ?`,
          [now, id, plan.company_id || null, plan.shift_id || null, plan.direction || "morning"]
        );
      }
      await conn.execute(
        "UPDATE route_plans SET status=?, published_by=?, published_at=?, updated_at=? WHERE id=?",
        [targetStatus, user.id, now, now, id]
      );
    });

    await logAudit({ actorUserId: user.id, action: targetStatus === "active" ? "route_plan.activate" : "route_plan.publish", entityType: "route_plan", entityId: id, details: { previous_status: plan.status, version_no: plan.version_no } });
    return NextResponse.json({ ok: true, data: { id, status: targetStatus, published_at: now } });
  } catch (e) {
    return apiError(e);
  }
}
