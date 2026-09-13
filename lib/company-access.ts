import { RequestError } from "./request-error";
import type { DbClient } from "./db";

export function assertCompanyAccess(user: { allowed_companies: string | null }, companyId: string | null) {
  if (user.allowed_companies !== null) {
    let allowed: unknown;
    try { allowed = JSON.parse(user.allowed_companies); } catch { allowed = []; }
    if (!Array.isArray(allowed) || !companyId || !allowed.includes(companyId))
      throw new RequestError("Bu firmaya erişim yetkiniz yok", 403);
  }
}

/**
 * Çetele satırının firma kapsamını kontrol eder. Güzergahlı satırda kapsam
 * güzergahın firmasıdır (bir araç birden fazla firmaya hizmet verebildiği için
 * araç ortaklığı yeterli değil); güzergahsız satırda araç hangi firmalara
 * kayıtlıysa onlardan biri yeterli.
 */
export async function assertCeteleAccess(
  db: Pick<DbClient, "prepare">,
  user: { allowed_companies: string | null },
  row: { vehicle_id: string; route_id: string | null },
) {
  if (row.route_id) {
    const route = await db.prepare("SELECT company_id FROM routes WHERE id = ?").get<{ company_id: string | null }>(row.route_id);
    assertCompanyAccess(user, route?.company_id ?? null);
    return;
  }
  if (user.allowed_companies === null) return;
  const memberships = await db.prepare("SELECT company_id FROM company_vehicles WHERE vehicle_id = ?").all<{ company_id: string }>(row.vehicle_id);
  let allowed: unknown;
  try { allowed = JSON.parse(user.allowed_companies); } catch { allowed = []; }
  if (!Array.isArray(allowed) || !memberships.some(m => (allowed as unknown[]).includes(m.company_id)))
    throw new RequestError("Bu kayda erişim yetkiniz yok", 403);
}
