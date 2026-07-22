import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { logAudit } from "@/lib/audit";
import { geocodeAddress } from "@/lib/geocode";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "map:geocode") || !hasPermission(user, "passengers:update")) {
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(100, Math.max(1, Number(body.limit || 25)));
    const companyId = body.company_id ? String(body.company_id) : "";
     const force = body.force === true;
    const db = getDb();
    const where = companyId ? "AND company_id = ?" : "";
    const rows = await db.prepare(
      `SELECT id, full_name, pickup_address FROM passengers
       WHERE status = 'aktif' AND pickup_address IS NOT NULL AND pickup_address <> '' AND (? = 1 OR pickup_lat IS NULL OR pickup_lng IS NULL) ${where}
       ORDER BY updated_at ASC
       LIMIT ?`
     ).all(...(companyId ? [force ? 1 : 0, companyId, limit] : [force ? 1 : 0, limit])) as Array<{ id: string; full_name: string; pickup_address: string }>;

    let updated = 0;
    let failed = 0;
    const results: Array<{ id: string; full_name: string; ok: boolean; error?: string }> = [];
    const now = nowIso();

    for (const row of rows) {
      const geo = await geocodeAddress(row.pickup_address).catch(() => null);
      if (!geo) {
        await db.prepare("UPDATE passengers SET updated_at = ? WHERE id = ?").run(now, row.id);
        failed++;
        results.push({ id: row.id, full_name: row.full_name, ok: false, error: "Adres bulunamadı" });
        continue;
      }
      await db.prepare("UPDATE passengers SET pickup_lat = ?, pickup_lng = ?, updated_at = ? WHERE id = ?").run(geo.lat, geo.lng, now, row.id);
      updated++;
      results.push({ id: row.id, full_name: row.full_name, ok: true });
    }

    await logAudit({ actorUserId: user.id, action: "passengers.geocode_batch", entityType: "passengers", details: { updated, failed, companyId: companyId || null } });
    return NextResponse.json({ ok: true, data: { total: rows.length, updated, failed, results } });
  } catch (e) { return apiError(e); }
}
