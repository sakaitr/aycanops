import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";

// İsimle sürücü ara; yoksa otomatik yeni sürücü kaydı aç (sadece isim zorunlu).
// Sicil ve şikayet akışlarında "yaz veya seç" formlarının ortak backend mantığı.
export async function resolveOrCreateDriverId(name: string, createdBy: string): Promise<string> {
  const trimmed = name.trim();
  const db = getDb();
  const existing = await db.prepare(`SELECT id FROM drivers WHERE name = ? LIMIT 1`).get(trimmed) as { id: string } | undefined;
  if (existing) return existing.id;

  const id = uuidv4();
  const now = nowIso();
  await db.prepare(
    `INSERT INTO drivers (id, name, status, created_by, created_at, updated_at) VALUES (?, ?, 'aktif', ?, ?, ?)`
  ).run(id, trimmed, createdBy, now, now);
  return id;
}

export async function createDriverRecord(input: {
  driver_name: string;
  vehicle_id?: string | null;
  vehicle_plate?: string | null;
  incident_date: string;
  category?: string | null;
  severity: number;
  description: string;
  action_taken?: string | null;
  reported_by: string;
}): Promise<string> {
  const db = getDb();
  const driverName = input.driver_name.trim();
  const driverId = await resolveOrCreateDriverId(driverName, input.reported_by);
  const id = uuidv4();
  const now = nowIso();
  await db.prepare(
    `INSERT INTO driver_records (id, driver_name, driver_id, vehicle_id, vehicle_plate, incident_date, category, severity, description, action_taken, reported_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, driverName, driverId, input.vehicle_id || null, input.vehicle_plate || null,
    input.incident_date, input.category || "diger", input.severity,
    input.description.trim(), input.action_taken?.trim() || null,
    input.reported_by, now, now
  );
  return id;
}
