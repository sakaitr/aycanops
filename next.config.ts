import type { NextConfig } from "next";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://ops.aycanturizm.com.tr";

// BUILD_TARGET=mobile → static export for Capacitor
// BUILD_TARGET=web (default) → standalone for Docker/VPS
const isMobile = process.env.BUILD_TARGET === "mobile";

const securityHeaders = [
  { key: "X-Frame-Options",          value: "DENY" },
  { key: "X-Content-Type-Options",   value: "nosniff" },
  { key: "Referrer-Policy",          value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",       value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
      "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://cdnjs.cloudflare.com",
      "font-src 'self'",
      "connect-src 'self' https://nominatim.openstreetmap.org https://router.project-osrm.org",
      "frame-ancestors 'none'",
    ].join("; "),
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  output: isMobile ? "export" : "standalone",
  // Denetim fotoğraf yükleme (birden fazla dosya, her biri 8MB'a kadar)
  // Next'in middleware body-buffer varsayılanını (10MB) aşıyor — nginx'in
  // zaten izin verdiği client_max_body_size 20m ile eşleştiriyoruz.
  experimental: {
    middlewareClientMaxBodySize: "20mb",
  },
  // Static export (mobile) doesn’t support image optimisation
  ...(isMobile && { images: { unoptimized: true } }),
  // Prevent webpack from bundling Node.js-only server packages
  serverExternalPackages: [
    "whatsapp-web.js",
    "puppeteer",
    "puppeteer-core",
    "puppeteer-real-browser",
    "@puppeteer/browsers",
    "qrcode",
    "firebase-admin",
  ],
  env: {
    NEXT_PUBLIC_APP_URL: appUrl,
  },
  async headers() {
    return [
      {
        // Service worker: no cache, correct content-type
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Manifest: allow browser to cache
        source: "/manifest.webmanifest",
        headers: [
          { key: "Content-Type", value: "application/manifest+json" },
          { key: "Cache-Control", value: "public, max-age=86400" },
        ],
      },
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

// Wrap with Sentry only when DSN is configured (no-op otherwise)
const hasSentry = !!(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);

let finalConfig: NextConfig = nextConfig;

if (hasSentry && !isMobile) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { withSentryConfig } = require("@sentry/nextjs");
  finalConfig = withSentryConfig(nextConfig, {
    silent: true,
    hideSourceMaps: true,
    disableLogger: true,
    automaticVercelMonitors: false,
  });
}

export default finalConfig;

