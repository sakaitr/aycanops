import type { DbClient } from "./db";
import { RequestError } from "./request-error";

export function optionalId(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > 36) throw new RequestError("Geçersiz seçim");
  return value.trim() || null;
}

export async function paymentPlanId(db: Pick<DbClient, "prepare">, value: unknown) {
  const id = optionalId(value);
  if (id && !await db.prepare("SELECT id FROM odeme_planlari WHERE id = ?").get(id))
    throw new RequestError("Seçilen ödeme planı bulunamadı. Planı yeniden seçin");
  return id;
}
