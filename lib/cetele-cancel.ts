import { getDb } from "./db";
import { transactionStore } from "./transaction-store";
import { RequestError } from "./request-error";
import { assertCeteleAccess } from "./company-access";
import { logAudit } from "./audit";
import { nowIso } from "./time";

type CeteleRow = Record<string, unknown> & { vehicle_id: string; route_id: string | null; durum: string };

/** Birden çok kaydı TEK transaction'da iptal eder — biri reddedilirse hiçbiri iptal olmaz
 * (önceden her id kendi isteğinde ayrı iptal ediliyordu, kısmi başarı/kısmi hata mümkündü). */
export async function cancelCeteleMany(ids: string[], reason: unknown, user: { id: string; allowed_companies: string | null }) {
  if (typeof reason !== "string" || !reason.trim()) throw new RequestError("İptal gerekçesi zorunludur");
  if (ids.length === 0) throw new RequestError("Kayıt seçilmedi");
  await getDb().transaction(async conn => {
    const db = transactionStore(conn);
    for (const id of ids) {
      // Same service lock as financial creation: the winner determines the valid next state.
      const before = await db.prepare("SELECT * FROM cetele WHERE id = ? FOR UPDATE").get<CeteleRow>(id);
      if (!before) throw new RequestError("Bulunamadı", 404);
      await assertCeteleAccess(db, user, before);
      if (!["bekliyor", "onaylandi"].includes(before.durum)) throw new RequestError("Kayıt zaten iptal edilmiş veya iptale uygun değil", 409);
      const linked = await db.prepare("SELECT id FROM hakedis_cetele WHERE cetele_id = ? FOR UPDATE").get(id);
      if (linked) throw new RequestError("Hakedişe bağlı hizmet doğrudan iptal edilemez; finansal düzeltme incelemesi gerekir", 409);
      const now = nowIso();
      await db.prepare("UPDATE cetele SET durum = 'iptal', geri_alma_nedeni = ?, updated_at = ? WHERE id = ?")
        .run(reason.trim(), now, id);
      await logAudit({ actorUserId: user.id, action: "cetele.cancel", entityType: "cetele", entityId: id,
        details: { before, after: { ...before, durum: "iptal", geri_alma_nedeni: reason.trim(), updated_at: now } } }, conn);
    }
  });
}

export async function cancelCetele(id: string, reason: unknown, user: { id: string; allowed_companies: string | null }) {
  return cancelCeteleMany([id], reason, user);
}

/** Sadece hiç onaylanmamış taslak satırlar için — onaylanmış/bağlı kayıtlar iptal (soft) ile korunur, buradan silinemez. */
export async function deleteCetele(id: string, user: { id: string; allowed_companies: string | null }) {
  await getDb().transaction(async conn => {
    const db = transactionStore(conn);
    const before = await db.prepare("SELECT * FROM cetele WHERE id = ? FOR UPDATE").get<CeteleRow>(id);
    if (!before) throw new RequestError("Bulunamadı", 404);
    await assertCeteleAccess(db, user, before);
    if (before.durum !== "bekliyor") throw new RequestError("Sadece bekleyen kayıtlar silinebilir", 400);
    const linked = await db.prepare("SELECT id FROM hakedis_cetele WHERE cetele_id = ? FOR UPDATE").get(id);
    if (linked) throw new RequestError("Hakedişe bağlı hizmet silinemez", 409);
    await db.prepare("DELETE FROM cetele WHERE id = ?").run(id);
    await logAudit({ actorUserId: user.id, action: "cetele.delete", entityType: "cetele", entityId: id, details: { before } }, conn);
  });
}
