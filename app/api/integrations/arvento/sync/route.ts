import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { logAudit } from "@/lib/audit";

type IncomingLocation = {
  external_vehicle_id?: string;
  plate?: string;
  lat?: number;
  lng?: number;
  speed?: number | null;
  heading?: number | null;
  ignition?: boolean | number | null;
  odometer?: number | null;
  address?: string | null;
  recorded_at?: string | null;
  raw?: unknown;
};

function normalizePlate(plate: string | null | undefined) {
  return String(plate || "").trim().toLocaleUpperCase("tr-TR").replace(/\s+/g, " ");
}

function toBoolInt(value: IncomingLocation["ignition"]) {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return Number(value) ? 1 : 0;
}

function isValidCoordinate(lat: unknown, lng: unknown) {
  const nLat = Number(lat);
  const nLng = Number(lng);
  return Number.isFinite(nLat) && Number.isFinite(nLng) && nLat >= -90 && nLat <= 90 && nLng >= -180 && nLng <= 180;
}

function demoOffset(seed: string, scale: number) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % 9973;
  return ((hash % 200) - 100) / scale;
}

async function ensureProvider(db: ReturnType<typeof getDb>, now: string) {
  const existing = await db.prepare("SELECT id FROM gps_providers WHERE code = 'arvento' LIMIT 1").get<{ id: string }>();
  if (existing?.id) {
    await db.prepare("UPDATE gps_providers SET last_sync_at=?, updated_at=? WHERE id=?").run(now, now, existing.id);
    return existing.id;
  }
  const id = uuidv4();
  await db.prepare(
    `INSERT INTO gps_providers (id, code, name, provider_type, is_active, config_json, last_sync_at, created_at, updated_at)
     VALUES (?, 'arvento', 'Arvento', 'polling', 1, ?, ?, ?, ?)`
  ).run(id, JSON.stringify({ mode: "manual_or_mock", note: "Gerçek Arvento API bilgisi geldiğinde bu sağlayıcı config alanından bağlanacak." }), now, now, now);
  return id;
}

async function buildDemoLocations(db: ReturnType<typeof getDb>, limit: number): Promise<IncomingLocation[]> {
  const vehicles = await db.prepare(
    `SELECT v.id, v.plate, r.id AS route_id, r.stops_json
     FROM vehicles v
     LEFT JOIN routes r ON r.vehicle_id = v.id AND r.is_active = 1
     WHERE v.status_code = 'active'
     ORDER BY v.plate ASC
     LIMIT ?`
  ).all<any>(limit);

  return vehicles.map((vehicle, index) => {
    let baseLat = 41.015;
    let baseLng = 28.979;
    try {
      const stops = JSON.parse(vehicle.stops_json || "[]");
      const first = Array.isArray(stops) ? stops.find((s: any) => s?.lat && s?.lng) : null;
      if (first) {
        baseLat = Number(first.lat);
        baseLng = Number(first.lng);
      }
    } catch {}
    return {
      external_vehicle_id: `demo-${vehicle.id}`,
      plate: vehicle.plate,
      lat: baseLat + demoOffset(`${vehicle.plate}-lat`, 10000),
      lng: baseLng + demoOffset(`${vehicle.plate}-lng`, 10000),
      speed: index % 3 === 0 ? 0 : 32 + (index % 35),
      heading: (index * 37) % 360,
      ignition: index % 4 !== 0,
      odometer: null,
      address: "Demo Arvento konumu",
      recorded_at: nowIso(),
      raw: { source: "demo", route_id: vehicle.route_id || null },
    };
  });
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "integrations:sync")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const db = getDb();
    const now = nowIso();
    const providerId = await ensureProvider(db, now);
    const incoming: IncomingLocation[] = Array.isArray(body.locations)
      ? body.locations
      : body.demo === true
        ? await buildDemoLocations(db, Math.min(50, Math.max(1, Number(body.limit || 12))))
        : [];

    if (incoming.length === 0) {
      return NextResponse.json({ ok: false, error: "Konum verisi yok. Gerçek Arvento payload'u için locations gönderin veya demo=true kullanın." }, { status: 400 });
    }

    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const item of incoming) {
      const plate = normalizePlate(item.plate);
      const externalVehicleId = String(item.external_vehicle_id || plate || "").trim();
      if (!externalVehicleId && !plate) { skipped++; errors.push("Plaka veya external_vehicle_id yok"); continue; }
      if (!isValidCoordinate(item.lat, item.lng)) { skipped++; errors.push(`${plate || externalVehicleId}: koordinat geçersiz`); continue; }

      const vehicle = plate
        ? await db.prepare("SELECT id, plate FROM vehicles WHERE plate = ? LIMIT 1").get<{ id: string; plate: string }>(plate)
        : undefined;
      const vehicleId = vehicle?.id ?? null;
      const deviceExisting = await db.prepare(
        "SELECT id FROM vehicle_gps_devices WHERE provider_id = ? AND external_vehicle_id = ? LIMIT 1"
      ).get<{ id: string }>(providerId, externalVehicleId || plate);
      const deviceId = deviceExisting?.id ?? uuidv4();
      if (deviceExisting?.id) {
        await db.prepare(
          `UPDATE vehicle_gps_devices SET vehicle_id=?, plate=?, is_active=1, last_seen_at=?, updated_at=? WHERE id=?`
        ).run(vehicleId, plate || vehicle?.plate || null, now, now, deviceId);
      } else {
        await db.prepare(
          `INSERT INTO vehicle_gps_devices (id, vehicle_id, provider_id, external_vehicle_id, imei, plate, is_active, last_seen_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
        ).run(deviceId, vehicleId, providerId, externalVehicleId || plate, null, plate || vehicle?.plate || null, now, now, now);
      }

      const locationId = uuidv4();
      const recordedAt = item.recorded_at || now;
      const lat = Number(item.lat);
      const lng = Number(item.lng);
      const rawJson = JSON.stringify(item.raw ?? item);
      await db.prepare(
        `INSERT INTO vehicle_locations
         (id, vehicle_id, device_id, provider_code, external_vehicle_id, plate, lat, lng, speed, heading, ignition, odometer, address, raw_json, recorded_at, received_at)
         VALUES (?, ?, ?, 'arvento', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(locationId, vehicleId, deviceId, externalVehicleId || null, plate || vehicle?.plate || null, lat, lng, item.speed ?? null, item.heading ?? null, toBoolInt(item.ignition), item.odometer ?? null, item.address || null, rawJson, recordedAt, now);

      if (vehicleId) {
        await db.prepare(
          `INSERT INTO vehicle_last_locations
           (vehicle_id, device_id, provider_code, external_vehicle_id, plate, lat, lng, speed, heading, ignition, odometer, address, raw_json, recorded_at, received_at)
           VALUES (?, ?, 'arvento', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE device_id=VALUES(device_id), provider_code=VALUES(provider_code), external_vehicle_id=VALUES(external_vehicle_id), plate=VALUES(plate), lat=VALUES(lat), lng=VALUES(lng), speed=VALUES(speed), heading=VALUES(heading), ignition=VALUES(ignition), odometer=VALUES(odometer), address=VALUES(address), raw_json=VALUES(raw_json), recorded_at=VALUES(recorded_at), received_at=VALUES(received_at)`
        ).run(vehicleId, deviceId, externalVehicleId || null, plate || vehicle?.plate || null, lat, lng, item.speed ?? null, item.heading ?? null, toBoolInt(item.ignition), item.odometer ?? null, item.address || null, rawJson, recordedAt, now);
      }
      inserted++;
    }

    await logAudit({ actorUserId: user.id, action: "integrations.arvento.sync", entityType: "gps_provider", entityId: providerId, details: { inserted, skipped, demo: body.demo === true } });

    return NextResponse.json({ ok: true, data: { provider: "arvento", inserted, skipped, errors: errors.slice(0, 20) } });
  } catch (e) {
    return apiError(e);
  }
}
