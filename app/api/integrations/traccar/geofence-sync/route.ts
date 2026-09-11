import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { logAudit } from "@/lib/audit";
import { traccar } from "@/lib/traccar-client";

// POST /api/integrations/traccar/geofence-sync
// Body: { company_id?, auto_company_stops?: boolean }
// aycanops geofences satırlarını Traccar'a çember geofence olarak push eder,
// dönen traccar id'sini polygon_json.traccar_id'ye yazar, tüm cihazlara bağlar.
// auto_company_stops=true ise firmanın güzergahlarındaki company-location
// duraklarından eksik firma geofence'i üretir (radius 250m).
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "integrations:sync"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    if (!traccar.isConfigured())
      return NextResponse.json({ ok: false, error: "Traccar yapılandırılmamış (TRACCAR_USER/PASS)" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const companyId: string | null = body?.company_id || null;
    const db = getDb();
    const now = nowIso();

    // Opsiyonel: firma güzergah company-location duraklarından eksik geofence üret
    if (body?.auto_company_stops && companyId) {
      const routes = await db
        .prepare(`SELECT stops_json FROM routes WHERE company_id = ? AND is_active = 1 AND stops_json IS NOT NULL`)
        .all<{ stops_json: string }>(companyId);
      const seen = new Set<string>();
      for (const r of routes) {
        let stops: unknown;
        try {
          stops = JSON.parse(r.stops_json || "[]");
        } catch {
          continue;
        }
        const cs = Array.isArray(stops)
          ? (stops as Array<Record<string, unknown>>).find((s) => s?.is_company_location && s?.lat && s?.lng)
          : null;
        if (!cs) continue;
        const key = `${cs.lat},${cs.lng}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const exists = await db
          .prepare(
            `SELECT id FROM geofences WHERE company_id = ? AND fence_type = 'company'
             AND ABS(center_lat - ?) < 0.0005 AND ABS(center_lng - ?) < 0.0005 LIMIT 1`,
          )
          .get<{ id: string }>(companyId, Number(cs.lat), Number(cs.lng));
        if (exists) continue;
        await db
          .prepare(
            `INSERT INTO geofences (id, company_id, route_id, name, fence_type, center_lat, center_lng, radius_m, is_active, created_by, created_at, updated_at)
             VALUES (?, ?, NULL, ?, 'company', ?, ?, 250, 1, ?, ?, ?)`,
          )
          .run(uuidv4(), companyId, `Firma bölgesi (${String(cs.name ?? "otomatik")})`, Number(cs.lat), Number(cs.lng), user.id, now, now);
      }
    }

    // Push edilecek geofence'ler
    const rows = await db
      .prepare(
        `SELECT id, name, center_lat, center_lng, radius_m, polygon_json
         FROM geofences
         WHERE is_active = 1 AND center_lat IS NOT NULL AND center_lng IS NOT NULL AND radius_m IS NOT NULL
         ${companyId ? "AND company_id = ?" : ""}`,
      )
      .all<{ id: string; name: string; center_lat: number; center_lng: number; radius_m: number; polygon_json: string | null }>(
        ...(companyId ? [companyId] : []),
      );

    let devices: Array<{ id: number }> = [];
    try {
      devices = await traccar.listDevices();
    } catch {
      devices = [];
    }

    let pushed = 0;
    let linked = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const g of rows) {
      let existingTraccarId: number | null = null;
      try {
        existingTraccarId = g.polygon_json ? (JSON.parse(g.polygon_json)?.traccar_id ?? null) : null;
      } catch {
        existingTraccarId = null;
      }
      if (existingTraccarId) {
        skipped += 1;
        continue;
      }
      try {
        const gf = await traccar.createCircleGeofence(g.name, g.center_lat, g.center_lng, g.radius_m);
        await db
          .prepare(`UPDATE geofences SET polygon_json = ?, updated_at = ? WHERE id = ?`)
          .run(JSON.stringify({ traccar_id: gf.id }), now, g.id);
        pushed += 1;
        for (const dev of devices) {
          try {
            await traccar.linkGeofenceToDevice(dev.id, gf.id);
            linked += 1;
          } catch {
            /* zaten bağlı olabilir */
          }
        }
      } catch (e) {
        errors.push(`${g.name}: ${e instanceof Error ? e.message : "hata"}`);
      }
    }

    await logAudit({
      actorUserId: user.id,
      action: "integrations.traccar.geofence_sync",
      entityType: "geofences",
      entityId: companyId,
      details: { pushed, linked, skipped, errors: errors.length },
    });

    return NextResponse.json({ ok: true, data: { pushed, linked, skipped, errors: errors.slice(0, 20) } });
  } catch (e) {
    return apiError(e);
  }
}
