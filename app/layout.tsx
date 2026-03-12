import type { Metadata, Viewport } from "next";
import "./globals.css";
import OfflineBanner from "@/components/OfflineBanner";
import PWARegister from "@/components/PWARegister";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#09090b",
};

export const metadata: Metadata = {
  title: "Aycan",
  applicationName: "Aycan Operasyon",
  description: "Operasyon Yönetim Sistemi",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Aycan",
  },
  formatDetection: { telephone: false },
  other: {
    "mobile-web-app-capable": "yes",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body suppressHydrationWarning className="antialiased" style={{ background: '#09090b', color: '#fafafa', minHeight: '100vh' }}>
        {children}
        <OfflineBanner />
        <PWARegister />
      </body>
    </html>
  );
}
