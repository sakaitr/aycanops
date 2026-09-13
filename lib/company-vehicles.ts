import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import type { PoolConnection } from "mysql2/promise";
import { transactionStore } from "@/lib/transaction-store";

/**
 * Bir araç bir güzergaha atanınca, o güzergahın firmasında da "hizmet veriyor"
 * olarak kayıtlı olduğundan emin olur. Bunu otomatik yapmazsak, güzergaha
 * atanmış ama company_vehicles'a hiç eklenmemiş bir araç; firma bazlı
 * sayaçlarda/filtrelerde (Çetele üst sayaç, /api/cetele company_id filtresi
 * gibi company_vehicles'a dayanan her yer) görünmez. Bir araç birden fazla
 * firmaya hizmet verebildiğinden var olan satırları asla silmez/değiştirmez,
 * sadece eksikse ekler.
 */
export async function ensureCompanyVehicle(companyId: string | null | undefined, vehicleId: string | null | undefined, conn?: PoolConnection) {
  if (!companyId || !vehicleId) return;
  const db = conn ? transactionStore(conn) : getDb();

  const vehicle = await db.prepare(`SELECT plate FROM vehicles WHERE id = ?`).get<{ plate: string }>(vehicleId);
  if (!vehicle) return;

  const existing = await db
    .prepare(`SELECT id, is_active FROM company_vehicles WHERE company_id = ? AND (vehicle_id = ? OR plate = ?)`)
    .get<{ id: string; is_active: number }>(companyId, vehicleId, vehicle.plate);

  const now = nowIso();
  if (existing) {
    if (!existing.is_active) {
      await db
        .prepare(`UPDATE company_vehicles SET is_active = 1, vehicle_id = COALESCE(vehicle_id, ?), updated_at = ? WHERE id = ?`)
        .run(vehicleId, now, existing.id);
    }
    return;
  }

  const maxRow = await db
    .prepare(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM company_vehicles WHERE company_id = ? AND is_active = 1`)
    .get<{ next_order: number }>(companyId);

  await db.prepare(
    `INSERT INTO company_vehicles (id, company_id, plate, vehicle_id, sort_order, is_temporary, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?)`
  ).run(uuidv4(), companyId, vehicle.plate, vehicleId, maxRow?.next_order ?? 0, now, now);
}
