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
  await db
    .prepare(
      "INSERT INTO portal_sessions (id, customer_user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
    )
    .run(id, customerId, expiresAt, now);
  // Son giriş zamanını güncelle
  await db
    .prepare("UPDATE customer_users SET last_login_at = ? WHERE id = ?")
    .run(now, customerId);
  return { sessionId: id, expiresAt };
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
      `SELECT cu.id, cu.company_id, cu.email, cu.full_name, cu.is_active,
              c.name as company_name, ps.expires_at
       FROM portal_sessions ps
       JOIN customer_users cu ON cu.id = ps.customer_user_id
       JOIN companies c ON c.id = cu.company_id
       WHERE ps.id = ?`
    )
    .get<PortalUser & { expires_at: string }>(sessionId);

  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await deletePortalSession(sessionId);
    return null;
  }
  if (!row.is_active) return null;

  const { expires_at, ...user } = row;
  void expires_at;
  return user;
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
