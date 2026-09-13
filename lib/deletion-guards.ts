import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { RequestError } from "./request-error";

/** Run inside the SAME transaction as deletion. Lock parent and dependencies. */
export async function assertMasterDeletable(conn: PoolConnection, kind: "vehicles" | "routes", id: string) {
  const [parent] = await conn.execute<RowDataPacket[]>(`SELECT id FROM ${kind} WHERE id = ? FOR UPDATE`, [id]);
  if (!parent.length) throw new RequestError("Kayıt bulunamadı", 404);
  const column = kind === "vehicles" ? "vehicle_id" : "route_id";
  const dependencies = ["cetele", "route_plan_routes", "guzergah_atama_gecmisi"];
  if (kind === "vehicles") dependencies.push("hakedis", "routes", "driver_assignments", "vehicle_documents", "vehicle_maintenance");
  for (const table of dependencies) {
    const [rows] = await conn.execute<RowDataPacket[]>(`SELECT ${column} FROM ${table} WHERE ${column} = ? LIMIT 1 FOR UPDATE`, [id]);
    if (rows.length) {
      throw new RequestError("Bu kayıt hizmet, hesap, atama veya plan geçmişine bağlı olduğu için silinemez. Kaydı pasifleştirin.", 409);
    }
  }
}
