"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";

type NavUser = {
  full_name: string;
  role: string;
};

const NAV_LINKS = [
  { href: "/", label: "Panel", icon: "⬛" },
  { href: "/gunluk", label: "Günlük", icon: "📋" },
  { href: "/gorevler", label: "İş Takibi", icon: "✓" },
  { href: "/seferler", label: "Ek Mesai", icon: "⏱️" },
  { href: "/giris-kontrol", label: "Giriş Kontrol", icon: "🚦" },
  { href: "/sofor-degerlendirme", label: "Şöför Değerlendirme", icon: "⭐" },
];

const MANAGER_LINKS = [
  { href: "/araclar", label: "Araçlar", icon: "🚗" },
  { href: "/guzergahlar", label: "Güzergahlar", icon: "🗺" },
  { href: "/denetimler", label: "Denetimler", icon: "🔍" },
  { href: "/surucu-sicil", label: "Sürücü Sicil", icon: "📋" },
  { href: "/raporlar", label: "Raporlar", icon: "↗" },
];

const ADMIN_LINKS = [
  { href: "/firmalar", label: "Firmalar", icon: "🏢" },
  { href: "/admin", label: "Yönetim", icon: "⚙️" },
];

const ROLE_LABELS: Record<string, string> = {
  personel: "Personel",
  yetkili: "Yetkili",
  yonetici: "Yönetici",
  admin: "Admin",
};

export default function Nav({ user }: { user: NavUser | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [badges, setBadges] = useState<{ denetimCount?: number }>({});

  const role = user?.role || "personel";
  const isManager = ["yetkili", "yonetici", "admin"].includes(role);

  useEffect(() => {
    if (!isManager) return;
    fetch("/api/stats/badges")
      .then(r => r.json())
      .then(d => { if (d.ok) setBadges(d.data); })
      .catch(() => {});
  }, [isManager]);
  const isAdmin = role === "admin";

  // Parse allowed_pages for non-admin users
  let allowedPages: string[] | null = null;
  if (role !== "admin" && (user as any)?.allowed_pages) {
    try { allowedPages = JSON.parse((user as any).allowed_pages); } catch {}
  }

  const filterByAllowed = (ls: typeof NAV_LINKS) =>
    allowedPages === null ? ls : ls.filter(l => allowedPages!.includes(l.href));

  const links = [
    ...filterByAllowed(NAV_LINKS),
    ...(isManager ? filterByAllowed(MANAGER_LINKS) : []),
    ...(isAdmin ? ADMIN_LINKS : []),
  ];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Logo + desktop nav */}
            <div className="flex items-center gap-8">
              <Link
                href="/"
                onClick={() => setMenuOpen(false)}
                className="text-white font-bold text-lg tracking-tight"
              >
                Aycan
              </Link>

              <nav className="hidden md:flex items-center gap-1">
                {links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`relative px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      isActive(link.href)
                        ? "bg-white text-zinc-950"
                        : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                    }`}
                  >
                    {link.label}
                    {link.href === "/denetimler" && badges.denetimCount != null && badges.denetimCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center bg-amber-500 text-zinc-900 text-[9px] font-bold rounded-full px-1 leading-none">
                        {badges.denetimCount > 99 ? "99+" : badges.denetimCount}
                      </span>
                    )}
                  </Link>
                ))}
              </nav>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2">
              <div className="hidden md:flex flex-col items-end">
                <span className="text-sm text-white font-medium leading-tight">{user?.full_name || "..."}</span>
                <span className="text-xs text-zinc-500">{ROLE_LABELS[role] || role}</span>
              </div>
              <button
                onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); router.push('/login'); }}
                className="text-xs text-zinc-500 hover:text-red-400 transition-colors px-3 py-2.5 min-h-[44px] rounded border border-zinc-800 hover:border-red-800 hidden md:inline-flex items-center"
              >
                Çıkış
              </button>
              {/* Hamburger – mobile only */}
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="md:hidden flex flex-col justify-center items-center w-10 h-10 gap-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
                aria-label="Menü"
                aria-expanded={menuOpen}
              >
                <span className={`block w-5 h-0.5 bg-zinc-300 transition-all duration-200 ${menuOpen ? "rotate-45 translate-y-2" : ""}`} />
                <span className={`block w-5 h-0.5 bg-zinc-300 transition-all duration-200 ${menuOpen ? "opacity-0" : ""}`} />
                <span className={`block w-5 h-0.5 bg-zinc-300 transition-all duration-200 ${menuOpen ? "-rotate-45 -translate-y-2" : ""}`} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      {menuOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 flex"
          onClick={() => setMenuOpen(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm" />

          {/* Drawer */}
          <div
            className="relative ml-auto w-72 h-full bg-zinc-900 border-l border-zinc-800 flex flex-col shadow-2xl overflow-y-auto"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-800">
              <div>
                <p className="text-sm font-semibold text-white">{user?.full_name || "..."}</p>
                <p className="text-xs text-zinc-500">{ROLE_LABELS[role] || role}</p>
              </div>
              <button
                onClick={() => setMenuOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-400"
              >
                ✕
              </button>
            </div>

            {/* Links */}
            <nav className="flex-1 px-3 py-3">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={`relative flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium mb-0.5 transition-colors ${
                    isActive(link.href)
                      ? "bg-white text-zinc-950"
                      : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
                  }`}
                >
                  <span className="text-base">{link.icon}</span>
                  {link.label}
                  {link.href === "/denetimler" && badges.denetimCount != null && badges.denetimCount > 0 && (
                    <span className="ml-auto min-w-[20px] h-5 flex items-center justify-center bg-amber-500 text-zinc-900 text-[10px] font-bold rounded-full px-1.5 leading-none">
                      {badges.denetimCount > 99 ? "99+" : badges.denetimCount}
                    </span>
                  )}
                </Link>
              ))}
            </nav>

            {/* Logout */}
            <div className="px-3 py-4 border-t border-zinc-800">
              <button
                onClick={async () => { setMenuOpen(false); await fetch('/api/auth/logout', { method: 'POST' }); router.push('/login'); }}
                className="w-full text-sm text-red-400 hover:text-red-300 hover:bg-zinc-800 transition-colors px-3 py-2.5 min-h-[44px] rounded-lg text-left"
              >
                🚪 Çıkış Yap
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
