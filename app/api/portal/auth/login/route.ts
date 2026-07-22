import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  verifyPortalPassword,
  createPortalSession,
  setPortalSessionCookie,
} from "@/lib/portal-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiError } from "@/lib/api-error";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: "E-posta ve şifre gerekli" },
        { status: 400 }
      );
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    // Brute-force koruması: 5 dakikada 10 deneme
    const rateCheck = await checkRateLimit(ip, "portal_login", 10, 5 * 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { ok: false, error: "Çok fazla başarısız giriş denemesi. Lütfen bekleyin." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(rateCheck.retryAfterMs / 1000)) },
        }
      );
    }

    const db = getDb();
    const user = await db
      .prepare(
        `SELECT id, password_hash, is_active, full_name
         FROM customer_users WHERE email = ? LIMIT 1`
      )
      .get<{ id: string; password_hash: string; is_active: number; full_name: string }>(
        email
      );

    if (!user || !verifyPortalPassword(password, user.password_hash)) {
      return NextResponse.json(
        { ok: false, error: "E-posta veya şifre hatalı" },
        { status: 401 }
      );
    }
    if (!user.is_active) {
      return NextResponse.json(
        { ok: false, error: "Hesabınız devre dışı. Yöneticinizle iletişime geçin." },
        { status: 403 }
      );
    }

    const { sessionId } = await createPortalSession(user.id);
    await setPortalSessionCookie(sessionId);
    return NextResponse.json({ ok: true, name: user.full_name });
  } catch (e) {
    return apiError(e);
  }
}
