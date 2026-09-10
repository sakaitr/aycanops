import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { nowIso } from "@/lib/time";

/**
 * POST /api/integrations/traccar/webhook?token=<TRACCAR_WEBHOOK_SECRET>
 *
 * Traccar "Forward" (forward.url) her konum ve olayda buraya JSON POST eder.
 * Konum → vehicle_locations insert + vehicle_last_locations upsert
 * (Arvento sync ile aynı tablo/kolonlar). geofenceEnter/geofenceExit →
 * route_adherence_events; firma geofence'ine giriş → otomatik vehicle_arrivals.
 *
 * Kimlik: query token. Kullanıcı oturumu yok (makine-makine).
 */

interface TraccarPayload {
  event?: {
    id?: number;
    type?: string; // "geofenceEnter" | "geofenceExit" | "deviceOnline" | ...
    eventTime?: string;
    geofenceId?: number;
    attributes?: Record<string, unknown>;
  } | null;
  device?: { id?: number; name?: string; uniqueId?: string };
  position?: {
    id?: number;
    deviceId?: number;
    latitude?: number;
    longitude?: number;
    speed?: number; // knots
    course?: number;
    fixTime?: string;
    deviceTime?: string;
    address?: string | null;
    attributes?: Record<string, unknown>;
  };
  geofence?: { id?: number; name?: string };
}

function knotsToKmh(kn: number | undefined | null): number | null {
  if (kn == null || !Number.isFinite(kn)) return null;
  return Math.round(kn * 1.852 * 10) / 10;
}

function normalizePlate(p: string | null | undefined): string {
  return String(p || "").trim().toLocaleUpperCase("tr-TR").replace(/\s+/g, " ");
}

function validCoord(lat: unknown, lng: unknown): boolean {
  const a = Number(lat);
  const b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && a >= -90 && a <= 90 && b >= -180 && b <= 180;
}

export async function POST(req: NextRequest) {
  try {
    const token = new URL(req.url).searchParams.get("token");
    const secret = process.env.TRACCAR_WEBHOOK_SECRET;
    if (!secret || token !== secret) {
      return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    }

    const payload = (await req.json().catch(() => ({}))) as TraccarPayload;
    const db = getDb();
    const now = nowIso();

    const deviceName = payload.device?.name || "";
    const plate = normalizePlate(deviceName);
    const vehicle = plate
      ? await db.prepare("SELECT id, plate FROM vehicles WHERE plate = ? LIMIT 1").get<{ id: string; plate: string }>(plate)
      : undefined;
    const vehicleId = vehicle?.id ?? null;

    let wroteLocation = false;
    let wroteEvent = false;
    let wroteArrival = false;

    // ── Konum ────────────────────────────────────────────────────────
    const pos = payload.position;
    if (pos && validCoord(pos.latitude, pos.longitude)) {
      const lat = Number(pos.latitude);
      const lng = Number(pos.longitude);
      const speed = knotsToKmh(pos.speed ?? null);
      const heading = pos.course ?? null;
      const ign = pos.attributes?.ignition;
      const ignition = ign == null ? null : (ign ? 1 : 0);
      const odometer =
        typeof pos.attributes?.odometer === "number"
          ? (pos.attributes.odometer as number)
          : typeof pos.attributes?.totalDistance === "number"
            ? (pos.attributes.totalDistance as number)
            : null;
      const recordedAt = pos.fixTime || pos.deviceTime || now;
      const rawJson = JSON.stringify(payload);
      const externalVehicleId = payload.device?.uniqueId || (pos.deviceId != null ? String(pos.deviceId) : null);

      await db
        .prepare(
          `INSERT INTO vehicle_locations
             (id, vehicle_id, device_id, provider_code, external_vehicle_id, plate, lat, lng, speed, heading, ignition, odometer, address, raw_json, recorded_at, received_at)
           VALUES (?, ?, NULL, 'traccar', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(uuidv4(), vehicleId, externalVehicleId, plate || null, lat, lng, speed, heading, ignition, odometer, pos.address || null, rawJson, recordedAt, now);

      if (vehicleId) {
        await db
          .prepare(
            `INSERT INTO vehicle_last_locations
               (vehicle_id, device_id, provider_code, external_vehicle_id, plate, lat, lng, speed, heading, ignition, odometer, address, raw_json, recorded_at, received_at)
             VALUES (?, NULL, 'traccar', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE provider_code=VALUES(provider_code), external_vehicle_id=VALUES(external_vehicle_id), plate=VALUES(plate),
               lat=VALUES(lat), lng=VALUES(lng), speed=VALUES(speed), heading=VALUES(heading), ignition=VALUES(ignition),
               odometer=VALUES(odometer), address=VALUES(address), raw_json=VALUES(raw_json), recorded_at=VALUES(recorded_at), received_at=VALUES(received_at)`,
          )
          .run(vehicleId, externalVehicleId, plate || null, lat, lng, speed, heading, ignition, odometer, pos.address || null, rawJson, recordedAt, now);
      }
      wroteLocation = true;
    }

    // ── Geofence olayı ───────────────────────────────────────────────
    const ev = payload.event;
    if (ev && (ev.type === "geofenceEnter" || ev.type === "geofenceExit") && ev.geofenceId != null) {
      // Traccar geofence id → aycanops geofences eşlemesi: geofences.polygon_json
      // içine {traccar_id} yazılıyor (geofence-sync). Eşleşme yoksa event yine
      // ham kaydedilir (route_id/company_id null).
      const gf = await db
        .prepare(
          `SELECT id, company_id, route_id, fence_type FROM geofences
           WHERE JSON_EXTRACT(polygon_json, '$.traccar_id') = ? LIMIT 1`,
        )
        .get<{ id: string; company_id: string | null; route_id: string | null; fence_type: string }>(ev.geofenceId);

      const eventType = ev.type === "geofenceEnter" ? "geofence_enter" : "geofence_exit";
      await db
        .prepare(
          `INSERT INTO route_adherence_events
             (id, route_plan_id, route_id, vehicle_id, event_type, severity, distance_m, duration_min, details_json, detected_at, created_at)
           VALUES (?, NULL, ?, ?, ?, 'info', NULL, NULL, ?, ?, ?)`,
        )
        .run(
          uuidv4(),
          gf?.route_id ?? null,
          vehicleId,
          eventType,
          JSON.stringify({ traccar_geofence_id: ev.geofenceId, geofence_id: gf?.id ?? null, device: deviceName }),
          ev.eventTime || now,
          now,
        );
      wroteEvent = true;

      // Firma geofence'ine giriş → otomatik yoklama (vehicle_arrivals)
      if (ev.type === "geofenceEnter" && gf?.fence_type === "company" && gf.company_id && vehicleId) {
        const arrivalDate = (ev.eventTime || now).slice(0, 10);
        // recorded_by NOT NULL — otomatik kayıt için sıfır-UUID sistem işareti
        const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000";
        await db
          .prepare(
            `INSERT INTO vehicle_arrivals (id, company_id, vehicle_id, arrival_date, arrived_at, recorded_by, latitude, longitude, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE arrived_at = VALUES(arrived_at), latitude = VALUES(latitude), longitude = VALUES(longitude)`,
          )
          .run(
            uuidv4(),
            gf.company_id,
            vehicleId,
            arrivalDate,
            ev.eventTime || now,
            SYSTEM_ACTOR,
            pos?.latitude ?? null,
            pos?.longitude ?? null,
            now,
          );
        wroteArrival = true;
      }
    }

    return NextResponse.json({
      ok: true,
      data: { plate: plate || null, matched_vehicle: !!vehicleId, location: wroteLocation, event: wroteEvent, arrival: wroteArrival },
    });
  } catch (e) {
    return apiError(e);
  }
}
