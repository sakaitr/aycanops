import { v4 as uuidv4 } from "uuid";
import { nowIso } from "./time";
import { getDb } from "./db";

export async function logAudit(params: {
  actorUserId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
}) {
  const db = getDb();
  const id = uuidv4();
  const createdAt = nowIso();
  const detailsJson = params.details ? JSON.stringify(params.details) : null;

  await db.prepare(
    `INSERT INTO audit_log (id, actor_user_id, action, entity_type, entity_id, details_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.actorUserId,
    params.action,
    params.entityType,
    params.entityId ?? null,
    detailsJson,
    createdAt
  );
}
