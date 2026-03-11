import { NextRequest, NextResponse } from "next/server";

// Public routes that do not require authentication
const PUBLIC_PATHS = new Set(["/login", "/api/auth/login"]);

// Mutating HTTP methods that require CSRF protection on API routes
const CSRF_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 1. CSRF koruması — /api/ altındaki mutasyon metotları için ──────────────
  if (pathname.startsWith("/api/") && CSRF_METHODS.has(request.method)) {
    // Login endpoint'i CSRF token gerektirmez (ayrıca rate limiting uygulanıyor)
    if (pathname !== "/api/auth/login") {
      const origin = request.headers.get("origin");
      const host = request.headers.get("host");

      if (origin) {
        try {
          const originHostname = new URL(origin).hostname;
          const hostHostname = (host || "").split(":")[0];
          if (originHostname !== hostHostname) {
            return NextResponse.json(
              { ok: false, error: "CSRF: geçersiz origin" },
              { status: 403 }
            );
          }
        } catch {
          return NextResponse.json(
            { ok: false, error: "CSRF: hatalı origin başlığı" },
            { status: 403 }
          );
        }
      }
    }
  }

  // ── 2. Oturum koruması — sayfa rotaları için yönlendirme ───────────────────
  // Statik dosyalar ve public API'ler atlanır
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/api/")
  ) {
    return NextResponse.next();
  }

  // Public sayfa rotaları
  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // Cookie adını env'den al (middleware'de process.env doğrudan okunabilir)
  const cookieName = process.env.COOKIE_NAME || "opsdesk_session";
  const sessionCookie = request.cookies.get(cookieName);

  if (!sessionCookie?.value) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * /_next/static, /_next/image, /favicon.ico dışındaki tüm rotaları eşleştir
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
