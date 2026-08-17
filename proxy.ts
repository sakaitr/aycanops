import { NextRequest, NextResponse } from "next/server";

// Public pages & API routes that do not require authentication
const PUBLIC_PATHS = new Set(["/login", "/api/auth/login", "/finans-giris"]);

// Finans/finans_yetkili/on_muhasebe rolleri sistemden bağımsız, ayrı bir
// kapıdan (/finans-giris) girer ve sadece bu çekirdek sayfaları görebilir.
const FINANS_ONLY_ROLES = new Set(["finans", "finans_yetkili", "on_muhasebe"]);
const FINANS_ALLOWED_PATHS = [
  "/finans/hareketler",
  "/finans/gider",
  "/finans/masraf-talebi",
  "/cari-tedarikci",
  "/yetkisiz",
];

function isAllowedForFinans(pathname: string): boolean {
  // "/finans" tam eşleşme — dashboard kökü. Prefix listesine eklenirse
  // "/finans/odemeler" gibi kaldırılmış sayfaları da yanlışlıkla
  // startsWith ile tekrar açardı, o yüzden ayrı kontrol ediliyor.
  if (pathname === "/finans") return true;
  return FINANS_ALLOWED_PATHS.some((p) => pathname.startsWith(p));
}

const PUBLIC_FILE_EXTENSIONS = [
  ".css",
  ".js",
  ".mjs",
  ".map",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".webp",
  ".avif",
  ".woff",
  ".woff2",
  ".ttf",
  ".txt",
  ".xml",
  ".json",
  ".webmanifest",
];

// Mutating HTTP methods that require CSRF protection on API routes
const CSRF_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Pages accessible only by the "personel" role
const PERSONEL_ALLOWED_PATHS = ["/giris-kontrol", "/yetkisiz", "/finans/masraf-talebi", "/is-giris", "/gunluk"];

function isAllowedForPersonel(pathname: string): boolean {
  return PERSONEL_ALLOWED_PATHS.some((p) => pathname.startsWith(p));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 1. CSRF protection – mutation methods on /api/ routes ──────────────────
  if (pathname.startsWith("/api/") && CSRF_METHODS.has(request.method)) {
    if (pathname !== "/api/auth/login") {
      const origin = request.headers.get("origin") || request.headers.get("referer");
      const host = request.headers.get("host");

      if (!origin) {
        return NextResponse.json(
          { ok: false, error: "CSRF: origin başlığı eksik" },
          { status: 403 }
        );
      }

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

  // ── 2. Skip static assets, all /api/ routes, and portal (separate auth) ────
  const staticPaths = [
    "/sw.js",
    "/workbox-",
    "/icons/",
    "/branding/",
    "/screenshots/",
    "/manifest",
    "/manifest.json",
    "/manifest.webmanifest",
    "/offline",
    "/favicon",
  ];
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/portal") ||
    staticPaths.some((p) => pathname.startsWith(p)) ||
    PUBLIC_FILE_EXTENSIONS.some((ext) => pathname.endsWith(ext))
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
      const landing = request.cookies.get("opsdesk_landing")?.value || "";
      const url = request.nextUrl.clone();
      if (landing && !FINANS_ONLY_ROLES.has(role) && role !== "personel") {
        url.pathname = landing;
      } else {
        url.pathname = FINANS_ONLY_ROLES.has(role) ? "/finans" : role === "personel" ? "/giris-kontrol" : "/";
      }
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
    url.pathname = "/yetkisiz";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // ── 5. Finans-only roller — sistemden bağımsız, sadece çekirdek finans
  // sayfalarına erişebilir (bkz. /finans-giris) ───────────────────────────────
  if (FINANS_ONLY_ROLES.has(role) && !isAllowedForFinans(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/finans";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};