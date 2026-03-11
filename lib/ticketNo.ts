import { getDb } from "./db";
import type { PoolConnection } from "mysql2/promise";

export async function nextTicketNo(): Promise<string> {
  const db = getDb();
  return db.transaction(async (conn: PoolConnection) => {
    const [rows] = await conn.execute<import("mysql2/promise").RowDataPacket[]>(
      "SELECT value FROM counters WHERE name = 'ticket_no' FOR UPDATE"
    );
    const current: number = rows[0]?.value ?? 0;
    const next = current + 1;
    await conn.execute(
      "UPDATE counters SET value = ? WHERE name = 'ticket_no'",
      [next]
    );
    return `OPS-${String(next).padStart(6, "0")}`;
  });
}
