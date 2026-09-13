import type { PoolConnection } from "mysql2/promise";
import { transactionStore } from "./transaction-store";
import { RequestError } from "./request-error";

/** Slow optimizer/manual edits may only replace the exact draft/version they read. */
export async function lockEditablePlan(conn: PoolConnection, id: string, expected: {
  company_id: string | null; status: string; version_no: number;
}) {
  const current = await transactionStore(conn).prepare("SELECT company_id,status,version_no FROM route_plans WHERE id=? FOR UPDATE")
    .get<typeof expected>(id);
  if (!current || !["draft", "published"].includes(current.status) || current.status !== expected.status ||
      current.company_id !== expected.company_id || Number(current.version_no) !== Number(expected.version_no))
    throw new RequestError("Plan bu sırada değiştirildi veya aktifleştirildi. Yeniden yükleyip deneyin", 409);
}
