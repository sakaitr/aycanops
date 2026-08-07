import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "./db";
import { addHours, nowIso } from "./time";

const PORTAL_COOKIE = "portal_session";
const SESSION_TTL_HOURS = 168; // 7 gün

export type PortalUser = {
  id: string;
  company_id: string;
  email: string;
  full_name: string;
  is_active: number;
  company_name: string;
  companies: { id: string; name: string }[];
};

export function hashPortalPassword(password: string) {
  return bcrypt.hashSync(password, 10);
}

export function verifyPortalPassword(password: string, hash: string) {
  return bcrypt.compareSync(password, hash);
}

export async function createPortalSession(customerId: string) {
  const db = getDb();
  const id = uuidv4();
  const expiresAt = addHours(new Date(), SESSION_TTL_HOURS).toISOString();
  const now = nowIso();

  // Aktif firma: kullanıcının varsayılan (customer_users.company_id)
  // firması — junction tabloda yoksa (eski kayıt) ona düşer.
  const primary = await db
    .prepare(
      `SELECT company_id FROM customer_user_companies WHERE customer_user_id = ? ORDER BY created_at ASC LIMIT 1`
    )
    .get<{ company_id: string }>(customerId);
  const activeCompanyId = primary?.company_id
    ?? (await db.prepare("SELECT company_id FROM customer_users WHERE id = ?").get<{ company_id: string }>(customerId))?.company_id
    ?? null;

  await db
    .prepare(
      "INSERT INTO portal_sessions (id, customer_user_id, active_company_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(id, customerId, activeCompanyId, expiresAt, now);
  // Son giriş zamanını güncelle
  await db
    .prepare("UPDATE customer_users SET last_login_at = ? WHERE id = ?")
    .run(now, customerId);
  return { sessionId: id, expiresAt };
}

/** Oturumun aktif firmasını değiştirir — sadece kullanıcının erişimi olan bir firmaya geçilebilir. */
export async function switchPortalCompany(sessionId: string, companyId: string, customerId: string): Promise<boolean> {
  const db = getDb();
  const allowed = await db
    .prepare(`SELECT 1 FROM customer_user_companies WHERE customer_user_id = ? AND company_id = ?`)
    .get(customerId, companyId);
  if (!allowed) return false;
  await db.prepare("UPDATE portal_sessions SET active_company_id = ? WHERE id = ?").run(companyId, sessionId);
  return true;
}

export async function deletePortalSession(sessionId: string) {
  const db = getDb();
  await db.prepare("DELETE FROM portal_sessions WHERE id = ?").run(sessionId);
}

export async function getPortalUserBySession(
  sessionId: string
): Promise<PortalUser | null> {
  const db = getDb();
  const row = await db
    .prepare(
      `SELECT cu.id, COALESCE(ps.active_company_id, cu.company_id) AS company_id,
              cu.email, cu.full_name, cu.is_active,
              c.name as company_name, ps.expires_at
       FROM portal_sessions ps
       JOIN customer_users cu ON cu.id = ps.customer_user_id
       JOIN companies c ON c.id = COALESCE(ps.active_company_id, cu.company_id)
       WHERE ps.id = ?`
    )
    .get<Omit<PortalUser, "companies"> & { expires_at: string }>(sessionId);

  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await deletePortalSession(sessionId);
    return null;
  }
  if (!row.is_active) return null;

  const companies = await db
    .prepare(
      `SELECT c.id, c.name FROM customer_user_companies cuc
       JOIN companies c ON c.id = cuc.company_id
       WHERE cuc.customer_user_id = ? ORDER BY c.name ASC`
    )
    .all<{ id: string; name: string }>(row.id);

  const { expires_at, ...user } = row;
  void expires_at;
  return { ...user, companies };
}

export async function getPortalSession(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(PORTAL_COOKIE)?.value ?? null;
}

export async function setPortalSessionCookie(sessionId: string) {
  const cookieStore = await cookies();
  cookieStore.set(PORTAL_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_HOURS * 3600,
  });
}

export async function clearPortalSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(PORTAL_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

/** API rotalarında kullanım: session yoksa null döner */
export async function requirePortalUser(): Promise<PortalUser | null> {
  const sid = await getPortalSession();
  if (!sid) return null;
  return getPortalUserBySession(sid);
}
