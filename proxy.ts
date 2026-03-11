import { NextRequest, NextResponse } from "next/server";

// Public pages & API routes that do not require authentication
const PUBLIC_PATHS = new Set(["/login", "/api/auth/login"]);

// Mutating HTTP methods that require CSRF protection on API routes
const CSRF_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Pages accessible only by the "personel" role
const PERSONEL_ALLOWED_PATHS = ["/giris-kontrol"];

function isAllowedForPersonel(pathname: string): boolean {
  return PERSONEL_ALLOWED_PATHS.some((p) => pathname.startsWith(p));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 1. CSRF protection – mutation methods on /api/ routes ──────────────────
  if (pathname.startsWith("/api/") && CSRF_METHODS.has(request.method)) {
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

  // ── 2. Skip static assets and all /api/ routes ─────────────────────────────
  const staticPaths = ["/sw.js", "/workbox-", "/icons/", "/manifest.json", "/offline", "/favicon"];
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    staticPaths.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  // ── 3. Session / auth protection ───────────────────────────────────────────
  if (PUBLIC_PATHS.has(pathname)) {
    // Already on a public page – redirect logged-in users to their dashboard
    const cookieName = process.env.COOKIE_NAME || "opsdesk_session";
    const sessionId = request.cookies.get(cookieName)?.value;
    if (sessionId) {
      const role = request.cookies.get("opsdesk_role")?.value || "";
      const url = request.nextUrl.clone();
      url.pathname = role === "personel" ? "/giris-kontrol" : "/";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  const cookieName = process.env.COOKIE_NAME || "opsdesk_session";
  const sessionId = request.cookies.get(cookieName)?.value;

  if (!sessionId) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // ── 4. Role-based access for "personel" ────────────────────────────────────
  const role = request.cookies.get("opsdesk_role")?.value || "";
  if (role === "personel" && !isAllowedForPersonel(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/giris-kontrol";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};