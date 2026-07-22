import type { Metadata } from "next";
import ThemeProvider from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "Aycan Müşteri Portalı",
  description: "Firma servis takip ve yönetim portalı",
};

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <body suppressHydrationWarning className="antialiased">
        <ThemeProvider />
        {children}
      </body>
    </html>
  );
}
