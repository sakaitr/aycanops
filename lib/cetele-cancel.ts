import { getDb } from "./db";
import { transactionStore } from "./transaction-store";
import { RequestError } from "./request-error";
import { assertCompanyAccess } from "./company-access";
import { logAudit } from "./audit";
import { nowIso } from "./time";

export async function cancelCetele(id: string, reason: unknown, user: { id: string; allowed_companies: string | null }) {
  if (typeof reason !== "string" || !reason.trim()) throw new RequestError("İptal gerekçesi zorunludur");
  await getDb().transaction(async conn => {
    const db = transactionStore(conn);
    // Same service lock as financial creation: the winner determines the valid next state.
    const before = await db.prepare("SELECT * FROM cetele WHERE id = ? FOR UPDATE")
      .get<Record<string, unknown> & { vehicle_id: string; route_id: string | null; durum: string }>(id);
    if (!before) throw new RequestError("Bulunamadı", 404);
    if (before.route_id) {
      const route = await db.prepare("SELECT company_id FROM routes WHERE id = ?")
        .get<{ company_id: string | null }>(before.route_id);
      assertCompanyAccess(user, route?.company_id ?? null);
    } else if (user.allowed_companies !== null) {
      const memberships = await db.prepare("SELECT company_id FROM company_vehicles WHERE vehicle_id = ?")
        .all<{ company_id: string }>(before.vehicle_id);
      let allowed: unknown;
      try { allowed = JSON.parse(user.allowed_companies); } catch { allowed = []; }
      if (!Array.isArray(allowed) || !memberships.some(m => (allowed as unknown[]).includes(m.company_id)))
        throw new RequestError("Bu kayda erişim yetkiniz yok", 403);
    }
    if (!["bekliyor", "onaylandi"].includes(before.durum)) throw new RequestError("Kayıt zaten iptal edilmiş veya iptale uygun değil", 409);
    const linked = await db.prepare("SELECT id FROM hakedis_cetele WHERE cetele_id = ? FOR UPDATE").get(id);
    if (linked) throw new RequestError("Hakedişe bağlı hizmet doğrudan iptal edilemez; finansal düzeltme incelemesi gerekir", 409);
    const now = nowIso();
    await db.prepare("UPDATE cetele SET durum = 'iptal', geri_alma_nedeni = ?, updated_at = ? WHERE id = ?")
      .run(reason.trim(), now, id);
    await logAudit({ actorUserId: user.id, action: "cetele.cancel", entityType: "cetele", entityId: id,
      details: { before, after: { ...before, durum: "iptal", geri_alma_nedeni: reason.trim(), updated_at: now } } }, conn);
  });
}
