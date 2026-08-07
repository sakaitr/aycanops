"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ThemeSwitcher from "@/components/ThemeSwitcher";

const NAV = [
  {
    href: "/portal",
    label: "Özet",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="7" height="7" rx="1.5"/>
        <rect x="14" y="3" width="7" height="7" rx="1.5"/>
        <rect x="3" y="14" width="7" height="7" rx="1.5"/>
        <rect x="14" y="14" width="7" height="7" rx="1.5"/>
      </svg>
    ),
  },
  {
    href: "/portal/giris-kontrol",
    label: "Giriş Kontrol",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M9 12l2 2 4-4"/>
        <path d="M12 2a10 10 0 100 20A10 10 0 0012 2z"/>
      </svg>
    ),
  },
  {
    href: "/portal/guzergahlar",
    label: "Güzergahlar",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 12h18M3 6l9-3 9 3M3 18l9 3 9-3"/>
      </svg>
    ),
  },
  {
    href: "/portal/araclar",
    label: "Araçlar",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M5 17H3a2 2 0 01-2-2V9a2 2 0 012-2l3-2h11l3 2a2 2 0 012 2v6a2 2 0 01-2 2h-2"/>
        <circle cx="7.5" cy="17.5" r="2.5"/>
        <circle cx="16.5" cy="17.5" r="2.5"/>
      </svg>
    ),
  },
  {
    href: "/portal/denetimler",
    label: "Denetimler",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M9 11l3 3L22 4"/>
        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
      </svg>
    ),
  },
  {
    href: "/portal/belgeler",
    label: "Belgeler",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
      </svg>
    ),
  },
  {
    href: "/portal/personeller",
    label: "Personeller",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
      </svg>
    ),
  },
  {
    href: "/portal/destek",
    label: "Destek",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="9"/>
        <path d="M12 8v4l3 3"/>
      </svg>
    ),
  },
];

export default function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    fetch("/api/portal/me")
      .then(r => r.json())
      .then(d => {
        if (d.ok) setUser(d.data);
        else router.replace("/portal/giris");
      })
      .catch(() => router.replace("/portal/giris"));
  }, [router]);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/portal/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/portal/giris");
  }

  const isExact = (href: string) => href === "/portal" ? pathname === "/portal" : pathname.startsWith(href);

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col">
      {/* Top bar */}
      <header className="h-14 bg-[var(--t-800)] border-b border-[var(--t-border-800)] flex items-center justify-between px-4 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--t-accent)] flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M3 8l9-5 9 5v8l-9 5-9-5V8z" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="hidden sm:block">
            <p className="text-xs font-semibold text-[var(--foreground)] leading-none">Müşteri Portalı</p>
            {user && (
              <p className="text-[11px] text-[var(--t-text-500)] leading-none mt-0.5">{user.company_name}</p>
            )}
          </div>
        </div>

        <nav className="flex items-center gap-0.5 overflow-x-auto scrollbar-none flex-1 mx-2 min-w-0">
          {NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-shrink-0 items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all min-h-[36px] ${
                isExact(item.href)
                  ? "bg-[var(--t-accent)]/15 text-[var(--t-accent)]"
                  : "text-[var(--t-text-400)] hover:text-[var(--foreground)] hover:bg-[var(--t-hover-200)]"
              }`}
            >
              {item.icon}
              <span className="hidden md:block">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeSwitcher />
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="text-xs text-[var(--t-text-500)] hover:text-red-400 transition-colors px-2 py-1.5 min-h-[36px]"
          >
            Çıkış
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 p-4 sm:p-6 max-w-5xl mx-auto w-full">
        {!user ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 border-2 border-[var(--t-accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : children}
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--t-border-800)] px-4 py-3 text-center">
        <p className="text-[11px] text-[var(--t-text-600)]">
          © 2026 Aycan Turizm · Müşteri Portalı
        </p>
      </footer>
    </div>
  );
}
