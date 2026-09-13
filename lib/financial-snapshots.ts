import type { PoolConnection } from "mysql2/promise";
import type { DbClient } from "./db";
import { transactionStore } from "./transaction-store";
import { nowIso } from "./time";
import type { PricedService } from "./cetele-pricing";

type Entity = "hakedis" | "firma_mutabakat";
export type FinancialEvidence = {
  services: (PricedService & { tutar?: string | number | null })[];
  [key: string]: unknown;
};

/** Always participate in the document's transaction. Never replace existing evidence. */
export async function appendFinancialSnapshot(conn: PoolConnection, entity: Entity, id: string,
  event: string, actor: string, payload: FinancialEvidence) {
  await transactionStore(conn).prepare(`INSERT INTO financial_snapshots
    (entity_type, entity_id, event, schema_version, payload, created_by, created_at) VALUES (?,?,?,1,?,?,?)`)
    .run(entity, id, event, JSON.stringify(payload), actor, nowIso());
}

export async function readFinancialSnapshot(db: Pick<DbClient, "prepare">, entity: Entity,
  id: string, events: string[]): Promise<FinancialEvidence | null> {
  const row = await db.prepare(`SELECT payload FROM financial_snapshots
    WHERE entity_type=? AND entity_id=? AND event IN (${events.map(() => "?").join(",")})
    ORDER BY id DESC LIMIT 1`).get<{ payload: string | FinancialEvidence }>(entity, id, ...events);
  if (!row) return null;
  return typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
}
