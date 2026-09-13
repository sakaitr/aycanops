import type { PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";

/** Existing prepare interface, bound to one transaction connection. */
export function transactionStore(conn: PoolConnection) {
  return { prepare(sql: string) {
    return {
      async all<T = RowDataPacket>(...params: unknown[]): Promise<T[]> {
        const [rows] = await conn.execute<RowDataPacket[]>(sql, params as Parameters<PoolConnection["execute"]>[1]);
        return rows as T[];
      },
      async get<T = RowDataPacket>(...params: unknown[]): Promise<T | undefined> {
        const [rows] = await conn.execute<RowDataPacket[]>(sql, params as Parameters<PoolConnection["execute"]>[1]);
        return (rows as T[])[0];
      },
      async run(...params: unknown[]): Promise<ResultSetHeader> {
        const [result] = await conn.execute<ResultSetHeader>(sql, params as Parameters<PoolConnection["execute"]>[1]);
        return result;
      },
    };
  } };
}
