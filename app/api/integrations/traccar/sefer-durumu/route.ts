import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { hasPermission } from "@/lib/permissions";
import { todayIstanbul } from "@/lib/time";

// GET /api/integrations/traccar/sefer-durumu?company_id=...
// Her aktif güzergah için bugünkü sefer durumu: geofence event'leri +
// canlı konumdan türetilir. bekliyor | yolda | vardi
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "map:live"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const companyId = new URL(req.url).searchParams.get("company_id") || "";
    if (!companyId) return NextResponse.json({ ok: false, error: "company_id zorunlu" }, { status: 400 });

    if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(companyId))
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
    }

    const db = getDb();
    const today = todayIstanbul();

    const routes = await db
      .prepare(
        `SELECT r.id, r.name, r.vehicle_id, v.plate,
                ll.speed, ll.ignition, ll.recorded_at AS konum_zamani
         FROM routes r
         LEFT JOIN vehicles v ON v.id = r.vehicle_id
         LEFT JOIN vehicle_last_locations ll ON ll.vehicle_id = r.vehicle_id
         WHERE r.company_id = ? AND r.is_active = 1`,
      )
      .all<{
        id: string;
        name: string;
        vehicle_id: string | null;
        plate: string | null;
        speed: number | null;
        ignition: number | null;
        konum_zamani: string | null;
      }>(companyId);

    // Bugünkü geofence event'leri (araç bazında son enter/exit)
    const events = await db
      .prepare(
        `SELECT vehicle_id, route_id, event_type, detected_at, details_json
         FROM route_adherence_events
         WHERE event_type IN ('geofence_enter','geofence_exit')
           AND detected_at >= ?
         ORDER BY detected_at ASC`,
      )
      .all<{ vehicle_id: string | null; route_id: string | null; event_type: string; detected_at: string; details_json: string | null }>(
        `${today}T00:00:00`,
      );

    const lastEventByVehicle = new Map<string, { type: string; at: string }>();
    for (const e of events) {
      if (!e.vehicle_id) continue;
      lastEventByVehicle.set(e.vehicle_id, { type: e.event_type, at: e.detected_at });
    }

    const data = routes.map((r) => {
      let durum: "bekliyor" | "yolda" | "vardi" = "bekliyor";
      const ev = r.vehicle_id ? lastEventByVehicle.get(r.vehicle_id) : undefined;
      if (ev?.type === "geofence_enter") durum = "vardi";
      else if (ev?.type === "geofence_exit") durum = "yolda";
      else if (r.ignition === 1 || (r.speed ?? 0) > 3) durum = "yolda";

      return {
        route_id: r.id,
        route_name: r.name,
        plate: r.plate,
        durum,
        son_konum_zamani: r.konum_zamani,
        hiz: r.speed,
        kontak: r.ignition,
        son_olay: ev ? { tip: ev.type, zaman: ev.at } : null,
      };
    });

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return apiError(e);
  }
}
