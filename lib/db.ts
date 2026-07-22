import mysql from "mysql2/promise";
import type { RowDataPacket, ResultSetHeader, PoolConnection } from "mysql2/promise";

let pool: mysql.Pool | null = null;

// All tables use utf8mb4_unicode_ci. We must tell MariaDB to use the same
// collation for connection parameters so string comparisons don't mismatch.
const SET_NAMES_SQL = "SET NAMES 'utf8mb4' COLLATE 'utf8mb4_unicode_ci'";

function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host:     process.env.DB_HOST     || "localhost",
      port:     Number(process.env.DB_PORT || 3306),
      user:     process.env.DB_USER     || "root",
      password: process.env.DB_PASS     || "",
      database: process.env.DB_NAME     || "ops",
      timezone: "+03:00",
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }
  return pool;
}

// Her bağlantıda SET NAMES çalıştıran connection yardımcısı.
// MariaDB 11.4 collation uyumsuzluğunu önler.
async function withConn<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.query(SET_NAMES_SQL);
    return await fn(conn);
  } finally {
    conn.release();
  }
}

// Hazırlanmış sorgu benzeri arayüz — SQLite API'sine benzer syntax, ancak async
function prepareFn(sql: string) {
  return {
    /** Tek satır döndürür, bulunamazsa undefined */
    async get<T = RowDataPacket>(...params: unknown[]): Promise<T | undefined> {
      return withConn(async (conn) => {
        const [rows] = await conn.execute<RowDataPacket[]>(sql, params as any[]);
        return (rows as T[])[0];
      });
    },
    /** Tüm satırları dizi olarak döndürür */
    async all<T = RowDataPacket>(...params: unknown[]): Promise<T[]> {
      return withConn(async (conn) => {
        const [rows] = await conn.execute<RowDataPacket[]>(sql, params as any[]);
        return rows as T[];
      });
    },
    /** INSERT / UPDATE / DELETE */
    async run(...params: unknown[]): Promise<ResultSetHeader> {
      return withConn(async (conn) => {
        const [result] = await conn.execute<ResultSetHeader>(sql, params as any[]);
        return result;
      });
    },
  };
}

/** Tek SQL cümlesi yürüt */
async function exec(sql: string): Promise<void> {
  await withConn((conn) => conn.execute(sql).then(() => undefined));
}

/**
 * Çok ifadeli SQL script yürüt (migration dosyaları için).
 * Ayrı bir bağlantıda multipleStatements modunda çalışır.
 */
async function execScript(sql: string): Promise<void> {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST     || "localhost",
    port:     Number(process.env.DB_PORT || 3306),
    user:     process.env.DB_USER     || "root",
    password: process.env.DB_PASS     || "",
    database: process.env.DB_NAME     || "ops",
    charset:  "utf8mb4",
    timezone: "+00:00",
    multipleStatements: true,
  });
  try {
    await conn.query(sql);
  } finally {
    await conn.end();
  }
}

/** Transaction yardımcısı — hata olursa otomatik rollback */
async function transaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection();
  await conn.query(SET_NAMES_SQL);
  await conn.beginTransaction();
  try {
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

const dbObj = {
  prepare: prepareFn,
  exec,
  execScript,
  transaction,
  get pool() { return getPool(); },
};

export function getDb() {
  return dbObj;
}

export type DbClient = typeof dbObj;
