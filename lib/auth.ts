import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { addHours, nowIso } from "./time";
import { getDb } from "./db";

export type SafeUser = {
  id: string;
  username: string;
  full_name: string;
  role: "personel" | "yetkili" | "yonetici" | "admin";
  department_id: string;
  is_active: number;
  allowed_pages: string | null;    // JSON array of href strings, null = unrestricted
  allowed_companies: string | null; // JSON array of company IDs, null = unrestricted
};

export function getSessionCookieName() {
  const name = process.env.COOKIE_NAME || "opsdesk_session";
  if (!name || name.trim().length === 0) {
    throw new Error("COOKIE_NAME environment variable is invalid");
  }
  return name;
}

export function getSessionTtlHours() {
  const raw = process.env.SESSION_TTL_HOURS || "168";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(`Invalid SESSION_TTL_HOURS: ${raw}, using default 168 hours`);
    return 168;
  }
  return parsed;
}

export function isCookieSecure() {
  return String(process.env.COOKIE_SECURE || "false").toLowerCase() === "true";
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compareSync(password, hash);
}

export function hashPassword(password: string) {
  return bcrypt.hashSync(password, 10);
}

export async function createSession(userId: string) {
  const db = getDb();
  const sessionId = uuidv4();
  const expiresAt = addHours(new Date(), getSessionTtlHours()).toISOString();
  await db.prepare(
    "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
  ).run(sessionId, userId, expiresAt, nowIso());
  return { sessionId, expiresAt };
}

export async function deleteSession(sessionId: string) {
  const db = getDb();
  await db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

export async function getUserBySession(sessionId: string): Promise<SafeUser | null> {
  const db = getDb();
  const row = await db
    .prepare(
      `SELECT users.id, users.username, users.full_name, users.role, users.department_id, users.is_active,
              users.allowed_pages, users.allowed_companies, sessions.expires_at
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.id = ?`
    )
    .get<SafeUser & { expires_at: string }>(sessionId);

  if (!row) {
    return null;
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await deleteSession(sessionId);
    return null;
  }

  const { expires_at, ...user } = row;
  void expires_at; // acknowledged
  return user;
}

export async function getSessionFromCookies() {
  const cookieName = getSessionCookieName();
  const cookieStore = await cookies();
  return cookieStore.get(cookieName)?.value || null;
}

export async function setSessionCookie(sessionId: string) {
  const cookieName = getSessionCookieName();
  const cookieStore = await cookies();
  cookieStore.set(cookieName, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: isCookieSecure(),
    path: "/",
  });
}

export async function clearSessionCookie() {
  const cookieName = getSessionCookieName();
  const cookieStore = await cookies();
  cookieStore.set(cookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isCookieSecure(),
    path: "/",
    maxAge: 0,
  });
}

export async function setRoleCookie(role: string) {
  const cookieStore = await cookies();
  cookieStore.set("opsdesk_role", role, {
    httpOnly: true,
    sameSite: "lax",
    secure: isCookieSecure(),
    path: "/",
  });
}

export async function clearRoleCookie() {
  const cookieStore = await cookies();
  cookieStore.set("opsdesk_role", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isCookieSecure(),
    path: "/",
    maxAge: 0,
  });
}

export async function requireUser() {
  const sessionId = await getSessionFromCookies();
  if (!sessionId) {
    return null;
  }
  return getUserBySession(sessionId);
}
