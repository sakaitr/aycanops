"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import ThemeSwitcher from "./ThemeSwitcher";
import GlobalSearch from "./GlobalSearch";
import GlobalCompanySelector from "./GlobalCompanySelector";
import {
  IconHome, IconClipboard, IconCheckSquare, IconClock, IconTrafficCone,
  IconStar, IconFileText, IconLightbulb, IconTruck, IconMap, IconSearch,
  IconClipboard2, IconBarChart, IconBuilding, IconZap, IconAlertTriangle,
  IconSettings, IconLogOut, IconBell, IconChevronLeft, IconChevronRight,
  IconX, IconMenu, IconCar, IconUsers, IconShield, IconActivity, IconWrench,
  IconCoin, IconKey, IconDocument, IconCalendar, IconHistory, IconMessageCircle,
} from "./Icons";
import { hasPermission, isAtLeast, type PermissionKey, type UserRole } from "@/lib/permissions";

type NavUser = {
  full_name: string;
  role: string;
  allowed_pages?: string | null;
};

// ── Link grupları ──────────────────────────────────────────────────────────────

const BUGUN_LINKS = [
  { href: "/", label: "Panel", Icon: IconHome },
  { href: "/gunluk", label: "Günlük", Icon: IconClipboard },
  { href: "/giris-kontrol", label: "Giriş Kontrol", Icon: IconTrafficCone },
  { href: "/transferler", label: "Transfer", Icon: IconClock },
  { href: "/cetele", label: "Çetele", Icon: IconClipboard2 },
];

const ARACLAR_LINKS = [
  { href: "/araclar", label: "Araçlar", Icon: IconCar },
  { href: "/bakim", label: "Araç Bakım", Icon: IconWrench },
  { href: "/belgeler", label: "Belgeler", Icon: IconDocument },
  { href: "/denetimler", label: "Denetimler", Icon: IconSearch },
  { href: "/filo/kazalar", label: "Kazalar", Icon: IconAlertTriangle },
  { href: "/filo/cezalar", label: "Cezalar", Icon: IconAlertTriangle },
  { href: "/filo/arizalar", label: "Arızalar", Icon: IconWrench },
  { href: "/filo/sigortalar", label: "Sigortalar", Icon: IconDocument },
  { href: "/filo/lastikler", label: "Lastikler", Icon: IconCar },
  { href: "/admin/gps-cihazlari", label: "GPS Cihazları", Icon: IconMap },
  { href: "/yakit-kartlari", label: "Yakıt Kartları", Icon: IconZap },
  { href: "/admin/hgs-ogs", label: "HGS/OGS", Icon: IconCoin },
];

const INSAN_LINKS = [
  { href: "/suruculer", label: "Sürücüler", Icon: IconUsers },
  { href: "/yolcular", label: "Yolcular", Icon: IconUsers },
  { href: "/izin-talepleri", label: "İzin Talepleri", Icon: IconCalendar },
  { href: "/sofor-degerlendirme", label: "Sürücü Değerlendirme", Icon: IconStar },
  { href: "/rehberler", label: "Rehberler", Icon: IconUsers },
];

const ROTA_LINKS = [
  { href: "/guzergahlar", label: "Güzergahlar", Icon: IconMap },
  { href: "/acik-guzergahlar", label: "Açık Güzergahlar", Icon: IconAlertTriangle },
  { href: "/rota-planlama", label: "Rota Planlama", Icon: IconCalendar },
  { href: "/operasyon-haritasi", label: "Operasyon Haritası", Icon: IconMap },
  { href: "/guzergah-fiyatlari", label: "Güzergah Fiyatları", Icon: IconCoin },
];

const FINANS_LINKS = [
  { href: "/isletenler", label: "İşletenler (Araç Tedarikçileri)", Icon: IconBuilding },
  { href: "/hakedis", label: "Hakediş", Icon: IconCoin },
  { href: "/mutabakat", label: "Firma Mutabakat", Icon: IconCoin },
  { href: "/kar-zarar", label: "Kâr-Zarar", Icon: IconBarChart },
  { href: "/butce", label: "Bütçe & Maliyet", Icon: IconCoin },
  { href: "/firmalar", label: "Firmalar (Müşteriler)", Icon: IconBuilding },
  { href: "/raporlar", label: "Raporlar", Icon: IconBarChart },
  { href: "/finans/gelir-gider", label: "Gelir-Gider", Icon: IconCoin },
  { href: "/finans/masraf-talebi", label: "Masraf Talebi", Icon: IconClipboard2 },
  { href: "/finans/faturalar", label: "Faturalar", Icon: IconDocument },
  { href: "/finans/fisler", label: "Fişler", Icon: IconClipboard2 },
  { href: "/finans/belgeler", label: "Finans Belgeleri", Icon: IconDocument },
  { href: "/finans/odemeler", label: "Ödemeler", Icon: IconCoin },
  { href: "/finans/banka-hareketleri", label: "Banka Hareketleri", Icon: IconActivity },
];

const GOREVLER_LINKS = [
  { href: "/gorevler", label: "İş Takibi", Icon: IconCheckSquare },
  { href: "/oneriler", label: "Öneri/Talep", Icon: IconLightbulb },
  { href: "/notlar", label: "Notlar", Icon: IconFileText },
  { href: "/surucu-sicil", label: "Sürücü Sicil", Icon: IconClipboard2 },
];

// Günlük kullanılan yönetim araçları — işletme sahibinin sık ihtiyaç duyduğu
const YONETIM_LINKS = [
  { href: "/toplu-islem", label: "Toplu İşlem", Icon: IconClipboard2 },
  { href: "/admin/musteriler", label: "Müşteri Portalı", Icon: IconUsers },
  { href: "/musteri-destek", label: "Müşteri Destek", Icon: IconMessageCircle },
  { href: "/admin/hizli-gorev", label: "Hızlı Görev", Icon: IconZap },
  { href: "/admin/uyarilar", label: "Uyarılar", Icon: IconAlertTriangle },
  { href: "/admin/izin-onaylayicilar", label: "İzin Onaylayıcıları", Icon: IconShield },
  { href: "/admin/kara-liste", label: "Kara Liste", Icon: IconAlertTriangle },
  { href: "/admin/duyurular", label: "Duyurular", Icon: IconBell },
  { href: "/admin/anketler", label: "Anketler", Icon: IconClipboard },
  { href: "/admin/dogum-gunleri", label: "Doğum Günleri", Icon: IconStar },
];

// Teknik/sistem yönetimi — geliştirici veya sistem yöneticisi seviyesi
const YONETIM_TEKNIK_LINKS = [
  { href: "/admin/yakit-fiyatlari", label: "Yakıt Fiyatları", Icon: IconCoin },
  { href: "/admin/otoyol-fiyatlari", label: "Otoyol/Köprü Fiyatları", Icon: IconCoin },
  { href: "/admin/arac-gruplari", label: "Araç Grupları", Icon: IconCar },
  { href: "/admin/sigorta-sirketleri", label: "Sigorta Şirketleri", Icon: IconDocument },
  { href: "/admin/banka-tanimlari", label: "Banka Tanımları", Icon: IconBuilding },
  { href: "/admin/donem-tanimlari", label: "Dönem Tanımları", Icon: IconCalendar },
  { href: "/admin/api-keys", label: "API Anahtarları", Icon: IconKey },
  { href: "/admin/audit-log", label: "Aktivite Günlüğü", Icon: IconHistory },
  { href: "/admin/roller", label: "Roller ve Yetkiler", Icon: IconKey },
  { href: "/admin", label: "Yönetim Paneli", Icon: IconSettings },
];

// Mobil bottom nav — en sık kullanılan 4 link
const BOTTOM_NAV = [
  { href: "/", label: "Panel", Icon: IconHome },
  { href: "/giris-kontrol", label: "Giriş Takip", Icon: IconTrafficCone },
  { href: "/transferler", label: "Transfer", Icon: IconClock },
  { href: "/gorevler", label: "İş Takibi", Icon: IconCheckSquare },
];

const NAV_PERMISSION_BY_HREF: Record<string, PermissionKey> = {
  "/": "dashboard:read",
  "/gunluk": "dashboard:read",
  "/giris-kontrol": "arrivals:read",
  "/transferler": "transfers:read",
  "/araclar": "vehicles:read",
  "/bakim": "maintenance:read",
  "/belgeler": "documents:read",
  "/denetimler": "vehicles:read",
  "/filo/kazalar": "fleet_accidents:read",
  "/filo/cezalar": "fleet_penalties:read",
  "/filo/arizalar": "fleet_breakdowns:read",
  "/filo/sigortalar": "fleet_insurances:read",
  "/filo/lastikler": "fleet_tires:read",
  "/admin/gps-cihazlari": "gps_devices:read",
  "/yakit-kartlari": "fuel_cards:read",
  "/admin/hgs-ogs": "hgs_ogs:read",
  "/admin/yakit-fiyatlari": "yakit_fiyatlari:read",
  "/admin/otoyol-fiyatlari": "otoyol_fiyatlari:read",
  "/admin/arac-gruplari": "arac_gruplari:read",
  "/admin/sigorta-sirketleri": "sigorta_sirketleri:read",
  "/admin/banka-tanimlari": "banka_tanimlari:read",
  "/admin/donem-tanimlari": "donem_tanimlari:read",
  "/admin/duyurular": "duyurular:read",
  "/admin/anketler": "anketler:read",
  "/admin/dogum-gunleri": "drivers:read",
  "/suruculer": "drivers:read",
  "/yolcular": "passengers:read",
  "/izin-talepleri": "leave_requests:read",
  "/sofor-degerlendirme": "drivers:read",
  "/guzergahlar": "routes:read",
  "/acik-guzergahlar": "routes:read",
  "/rota-planlama": "routes:optimize",
  "/operasyon-haritasi": "map:read",
  "/cetele": "cetele:read",
  "/isletenler": "isleten:read",
  "/hakedis": "hakedis:read",
  "/mutabakat": "firma_mutabakat:read",
  "/kar-zarar": "reports:read",
  "/rehberler": "rehberler:read",
  "/admin/kara-liste": "kara_liste:read",
  "/guzergah-fiyatlari": "route_prices:read",
  "/butce": "budget:read",
  "/firmalar": "companies:read",
  "/raporlar": "reports:read",
  "/finans/gelir-gider": "finans_gelir_gider:read",
  "/finans/masraf-talebi": "finans_masraf_talebi:read",
  "/finans/faturalar": "finans_fatura:read",
  "/finans/fisler": "finans_fis:read",
  "/finans/belgeler": "finans_belge:read",
  "/finans/odemeler": "finans_odeme:read",
  "/finans/banka-hareketleri": "finans_banka_hareketi:read",
  "/gorevler": "dashboard:read",
  "/oneriler": "suggestions:read",
  "/notlar": "dashboard:read",
  "/surucu-sicil": "driver_records:read",
  "/toplu-islem": "bulk_actions:preview",
  "/admin/musteriler": "portal_requests:read",
  "/musteri-destek": "musteri_destek:read",
  "/admin/uyarilar": "warnings:read",
  "/admin/izin-onaylayicilar": "users:read",
  "/admin/api-keys": "integrations:update",
  "/admin/audit-log": "audit:read",
  "/admin/roller": "users:permissions",
  "/admin": "users:read",
};

const ROLE_LABELS: Record<string, string> = {
  personel: "Personel",
  yetkili: "Yetkili",
  yonetici: "Yönetici",
  admin: "Admin",
};

const ROLE_COLORS: Record<string, string> = {
  personel: "text-zinc-400",
  yetkili: "text-blue-400",
  yonetici: "text-violet-400",
  admin: "text-amber-400",
};

const ROLE_BG: Record<string, string> = {
  personel: "bg-zinc-700",
  yetkili: "bg-blue-500/20 border border-blue-500/30",
  yonetici: "bg-violet-500/20 border border-violet-500/30",
  admin: "bg-amber-500/20 border border-amber-500/30",
};

// ── Chevron icon ──────────────────────────────────────────────────────────────
function ChevronDown({ size = 12, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

// Nav her sayfada tek tek import edilip render edildiği için (ortak layout yok),
// sayfa değişiminde tamamen unmount/remount oluyor ve sidebar'ın kendi scroll
// pozisyonu kayboluyor. sessionStorage'da saklayıp yeni instance'ta geri yüklüyoruz
// (modül seviyesinde değişken kullanmıyoruz çünkü route'lar arası ayrı chunk'larda
// farklı modül instance'ına düşebiliyor).
const SIDEBAR_SCROLL_KEY = "aycan-sidebar-scroll";

export default function Nav({ user: userProp }: { user: NavUser | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<NavUser | null>(userProp);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const sidebarNavRef = useRef<HTMLElement>(null);
  const [badges, setBadges] = useState<{ denetimCount?: number }>({});
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  // Sidebar grup açık/kapalı durumu
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    bugun: true,
    araclar: true,
    insan: false,
    rota: false,
    finans: false,
    gorevler: false,
    yonetim: false,
  });
  const notifPanelRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // userProp null gelirse kendi fetch et
  useEffect(() => {
    if (userProp) { setUser(userProp); return; }
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(d => { if (d.ok) setUser(d.data); })
      .catch(() => {});
  }, [userProp]);

  const role = user?.role || "personel";
  const isManager = isAtLeast(role, "yetkili");
  const isAdmin = role === "admin";

  // Mevcut sayfanın hangi gruba ait olduğunu bul ve o grubu aç
  useEffect(() => {
    const allGroups: Record<string, { href: string }[]> = {
      bugun: BUGUN_LINKS,
      araclar: ARACLAR_LINKS,
      insan: INSAN_LINKS,
      rota: ROTA_LINKS,
      finans: FINANS_LINKS,
      gorevler: GOREVLER_LINKS,
      yonetim: YONETIM_LINKS,
    };
    const updates: Record<string, boolean> = {};
    for (const [key, links] of Object.entries(allGroups)) {
      if (links.some(l => l.href === "/" ? pathname === "/" : pathname.startsWith(l.href))) {
        updates[key] = true;
      }
    }
    if (Object.keys(updates).length > 0) {
      setOpenGroups(prev => ({ ...prev, ...updates }));
    }
  }, [pathname]);

  useEffect(() => {
    if (!isManager) return;
    fetch("/api/stats/badges").then(r => r.json()).then(d => { if (d.ok) setBadges(d.data); }).catch(() => {});
  }, [isManager]);

  useEffect(() => {
    if (!user) return;
    const fetchNotifs = () => {
      fetch("/api/notifications")
        .then(r => r.json())
        .then(d => { if (d.ok) { setNotifications(d.data); setUnreadCount(d.unreadCount); } })
        .catch(() => {});
    };
    fetchNotifs();
    const id = setInterval(fetchNotifs, 30_000);
    return () => clearInterval(id);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const trigger = () => fetch("/api/notifications/remind").catch(() => {});
    trigger();
    const id = setInterval(trigger, 15 * 60_000);
    return () => clearInterval(id);
  }, [user]);

  useEffect(() => {
    document.body.setAttribute("data-sidebar", "1");
    document.body.setAttribute("data-topbar", "1");
    return () => {
      document.body.removeAttribute("data-sidebar");
      document.body.removeAttribute("data-sidebar-collapsed");
      document.body.removeAttribute("data-topbar");
    };
  }, []);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Sayfa geçişinde Nav yeniden mount olduğu için sidebar'ın scroll pozisyonu
  // kaybolur. Grup açılma durumu birkaç render'a yayılıp içerik yüksekliği
  // birkaç kez değiştiğinden (bkz. openGroups efekti), tek seferlik bir restore
  // yeterli olmuyor — ResizeObserver ile yükseklik her değiştiğinde tekrar
  // uyguluyoruz, ta ki kullanıcı elle scroll edene kadar.
  useEffect(() => {
    const el = sidebarNavRef.current;
    if (!el) return;
    const saved = Number(sessionStorage.getItem(SIDEBAR_SCROLL_KEY) || 0);
    if (!saved) return;
    let userScrolled = false;
    const onUserScroll = () => { userScrolled = true; };
    el.addEventListener("wheel", onUserScroll, { passive: true, once: true });
    el.addEventListener("touchmove", onUserScroll, { passive: true, once: true });
    const ro = new ResizeObserver(() => {
      if (!userScrolled && el.scrollHeight > el.clientHeight) el.scrollTop = saved;
    });
    ro.observe(el);
    const stop = setTimeout(() => ro.disconnect(), 1000);
    return () => {
      ro.disconnect();
      clearTimeout(stop);
      el.removeEventListener("wheel", onUserScroll);
      el.removeEventListener("touchmove", onUserScroll);
    };
  }, []);

  useEffect(() => {
    if (collapsed) document.body.setAttribute("data-sidebar-collapsed", "1");
    else document.body.removeAttribute("data-sidebar-collapsed");
  }, [collapsed]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifPanelRef.current && !notifPanelRef.current.contains(e.target as Node))
        setShowNotifPanel(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node))
        setShowUserMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  let allowedPages: string[] | null = null;
  if (role !== "admin" && (user as any)?.allowed_pages) {
    try { allowedPages = JSON.parse((user as any).allowed_pages); } catch {}
  }

  const canShowLink = (href: string) => {
    if (allowedPages !== null && !allowedPages.includes(href)) return false;
    const permission = NAV_PERMISSION_BY_HREF[href];
    if (!permission) return role !== "personel";
    return hasPermission({ role: role as UserRole, permissions: (user as any)?.permissions }, permission);
  };

  const filterByAllowed = <T extends { href: string }>(ls: T[]) =>
    ls.filter(l => canShowLink(l.href));

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const toggleGroup = (key: string) =>
    setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }));

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}`, { method: "PATCH" });
    setNotifications(ns => ns.map(n => n.id === id ? { ...n, is_read: 1 } : n));
    setUnreadCount(c => Math.max(0, c - 1));
  }

  async function markAllRead() {
    const unread = notifications.filter(n => n.is_read === 0);
    for (const n of unread) await fetch(`/api/notifications/${n.id}`, { method: "PATCH" });
    setNotifications(ns => ns.map(n => ({ ...n, is_read: 1 })));
    setUnreadCount(0);
  }

  // ── Notification panel ────────────────────────────────────────────────────
  const NotifBell = ({ dropUp = false }: { dropUp?: boolean }) => (
    <div className="relative" ref={notifPanelRef}>
      <button
        onClick={() => setShowNotifPanel(p => !p)}
        className="relative w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-all"
        title="Bildirimler"
        aria-label="Bildirimler"
      >
        <IconBell size={17} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[14px] h-[14px] flex items-center justify-center bg-[var(--t-accent)] text-zinc-950 text-[8px] font-bold rounded-full px-0.5 leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {showNotifPanel && (
        <div className={`absolute ${dropUp ? "bottom-full mb-2" : "top-full mt-2"} right-0 w-[min(340px,calc(100vw-2rem))] bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/60 rounded-2xl shadow-2xl z-50 overflow-hidden`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/80">
            <div>
              <span className="text-sm font-semibold text-white">Bildirimler</span>
              {unreadCount > 0 && <span className="ml-2 text-xs bg-[var(--t-accent)]/20 text-[var(--t-accent)] px-1.5 py-0.5 rounded-full font-medium">{unreadCount} yeni</span>}
            </div>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                Tümünü oku
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center py-10 gap-2">
                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                  <IconBell size={18} className="text-zinc-600" />
                </div>
                <p className="text-zinc-600 text-sm">Bildirim yok</p>
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => { markRead(n.id); if (n.link) router.push(n.link); setShowNotifPanel(false); }}
                  className={`px-4 py-3 border-b border-zinc-800/40 last:border-0 cursor-pointer hover:bg-zinc-800/40 transition-colors ${n.is_read === 0 ? "bg-[var(--t-accent)]/5" : ""}`}
                >
                  <div className="flex items-start gap-2.5">
                    {n.is_read === 0 && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--t-accent)] shrink-0" />}
                    <div className={n.is_read === 0 ? "" : "ml-4"}>
                      <p className="text-sm text-white leading-snug">{n.title}</p>
                      {n.body && <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{n.body}</p>}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );

  // ── Tek nav link ──────────────────────────────────────────────────────────
  const NavLink = ({
    link,
    showLabel,
    onClick,
  }: {
    link: { href: string; label: string; Icon: any };
    showLabel: boolean;
    onClick?: () => void;
  }) => {
    const active = isActive(link.href);
    const hasBadge = link.href === "/denetimler" && (badges.denetimCount ?? 0) > 0;
    return (
      <Link
        href={link.href}
        onClick={onClick}
        title={!showLabel ? link.label : undefined}
        className={`group relative flex items-center gap-3 px-2.5 py-2.5 min-h-[44px] rounded-xl mb-0.5 text-sm font-medium transition-all duration-150 ${
          active
            ? "bg-[var(--t-accent)]/10 text-[var(--t-accent)]"
            : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60"
        } ${!showLabel ? "justify-center" : ""}`}
      >
        {active && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[var(--t-accent)] rounded-r-full" />
        )}
        <link.Icon
          size={16}
          className={active ? "text-[var(--t-accent)] shrink-0" : "text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0"}
        />
        {showLabel && <span className="truncate">{link.label}</span>}
        {hasBadge && (
          <span className={`${showLabel ? "ml-auto" : "absolute -top-0.5 -right-0.5"} min-w-[16px] h-4 flex items-center justify-center bg-amber-500 text-zinc-900 text-[9px] font-bold rounded-full px-1 leading-none`}>
            {(badges.denetimCount ?? 0) > 99 ? "99+" : badges.denetimCount}
          </span>
        )}
      </Link>
    );
  };

  // ── Collapsible grup başlığı (sadece desktop expanded) ───────────────────
  const GroupHeader = ({
    label,
    groupKey,
    show,
  }: {
    label: string;
    groupKey: string;
    show: boolean;
  }) => {
    if (!show) return <div className="h-3" />;
    const open = openGroups[groupKey];
    return (
      <button
        onClick={() => toggleGroup(groupKey)}
        className="w-full flex items-center justify-between px-2.5 pt-4 pb-1.5 group"
      >
        <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest group-hover:text-zinc-400 transition-colors">
          {label}
        </p>
        <ChevronDown
          size={10}
          className={`text-zinc-600 group-hover:text-zinc-400 transition-all duration-200 ${open ? "" : "-rotate-90"}`}
        />
      </button>
    );
  };

  // ── Collapsed sidebar — sadece ikonlar, tooltip ile ───────────────────────
  const CollapsedDivider = () => <div className="h-3 border-t border-zinc-800/40 mx-2 mt-2 mb-1" />;

  // Veri hazırlığı
  const bugunLinks = filterByAllowed(BUGUN_LINKS);
  const araclarLinks = isManager ? filterByAllowed(ARACLAR_LINKS) : [];
  const insanLinks = isManager ? filterByAllowed(INSAN_LINKS) : [];
  const rotaLinks = isManager ? filterByAllowed(ROTA_LINKS) : [];
  // isManager ön-kapısı yok — canShowLink zaten her linki kendi iznine göre
  // filtreliyor (finans_masraf_talebi:read personel'de de var, diğer finans
  // linkleri personel için varsayılan olarak kapalı kalıyor).
  const finansLinks = filterByAllowed(FINANS_LINKS);
  const gorevlerLinks = filterByAllowed(GOREVLER_LINKS);
  const yonetimLinks = [
    ...(isManager ? filterByAllowed([{ href: "/toplu-islem", label: "Toplu İşlem", Icon: IconClipboard2 }]) : []),
    ...(isAdmin ? filterByAllowed(YONETIM_LINKS.filter(l => l.href !== "/toplu-islem")) : []),
  ];
  const yonetimTeknikLinks = isAdmin ? filterByAllowed(YONETIM_TEKNIK_LINKS) : [];

  const bottomNavLinks = filterByAllowed(BOTTOM_NAV);

  // Mobil "Daha Fazla" drawer — bottom nav'da olmayan tüm linkler
  const bottomNavHrefs = new Set(BOTTOM_NAV.map(l => l.href));
  const drawerBugunLinks = bugunLinks.filter(l => !bottomNavHrefs.has(l.href));

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TOP BAR                                                        */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <header
        className="fixed top-0 left-0 right-0 z-50 flex flex-col border-b border-zinc-800/60 bg-zinc-950/95 backdrop-blur-xl"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="h-14 flex items-center w-full">
          {/* Logo — sidebar genişliğiyle hizalı */}
          <div className={`hidden md:flex items-center h-full border-r border-zinc-800/60 shrink-0 transition-all duration-200 ${collapsed ? "w-[52px] justify-center" : "w-[220px] px-4 gap-2"}`}>
            {!collapsed ? (
              <Link href="/" className="flex items-center min-w-0">
                <img src="/branding/aycan-logo.png" alt="Aycan" className="h-8 w-auto object-contain" />
              </Link>
            ) : (
              <Link href="/">
                <img src="/branding/aycan-logo.png" alt="Aycan" className="h-7 w-7 object-contain" />
              </Link>
            )}
          </div>

          {/* Mobile logo */}
          <div className="md:hidden flex items-center pl-4">
            <Link href="/">
              <img src="/branding/aycan-logo.png" alt="Aycan" className="h-8 w-auto object-contain" />
            </Link>
          </div>

          {/* Arama */}
          <div className="flex-1 flex items-center px-4">
            <GlobalSearch />
          </div>

          {/* Sağ: Firma + Bildirim + Tema + Kullanıcı */}
          <div className="flex items-center gap-1 pr-4">
            <GlobalCompanySelector />
            <NotifBell dropUp={false} />
            <ThemeSwitcher />

            <div className="relative ml-1" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(p => !p)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-zinc-800/80 transition-all"
                aria-label="Kullanıcı menüsü"
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${ROLE_BG[role] || "bg-zinc-800"}`}>
                  <span className={ROLE_COLORS[role] || "text-zinc-300"}>
                    {user?.full_name?.charAt(0)?.toUpperCase() || "?"}
                  </span>
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-semibold text-zinc-200 leading-none truncate max-w-[100px]">{user?.full_name || "—"}</p>
                  <p className={`text-[10px] font-medium mt-0.5 ${ROLE_COLORS[role] || "text-zinc-500"}`}>{ROLE_LABELS[role] || role}</p>
                </div>
                <svg className="w-3 h-3 text-zinc-600 hidden sm:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {showUserMenu && (
                <div className="absolute top-full right-0 mt-2 w-52 bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/60 rounded-2xl shadow-2xl z-[60] overflow-hidden">
                  <div className="px-4 py-3 border-b border-zinc-800/60">
                    <p className="text-sm font-semibold text-white truncate">{user?.full_name || "—"}</p>
                    <p className={`text-xs mt-0.5 font-medium ${ROLE_COLORS[role] || "text-zinc-500"}`}>{ROLE_LABELS[role] || role}</p>
                  </div>
                  <button
                    onClick={() => { setShowUserMenu(false); handleLogout(); }}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-zinc-400 hover:text-red-400 hover:bg-zinc-800/60 transition-colors"
                  >
                    <IconLogOut size={15} />
                    Çıkış Yap
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* DESKTOP SIDEBAR                                                */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <aside
        className={`hidden md:flex fixed left-0 flex-col z-40 border-r border-zinc-800/60 bg-zinc-950 transition-all duration-200 ${collapsed ? "w-[52px]" : "w-[220px]"}`}
        style={{ top: "calc(56px + env(safe-area-inset-top, 0px))", height: "calc(100dvh - 56px - env(safe-area-inset-top, 0px))" }}
      >
        <nav
          ref={sidebarNavRef}
          onScroll={e => { sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(e.currentTarget.scrollTop)); }}
          className="flex-1 overflow-y-auto py-3 px-2 scrollbar-thin"
        >

          {/* BUGÜN */}
          {bugunLinks.length > 0 && (
            <>
              <GroupHeader label="Bugün" groupKey="bugun" show={!collapsed} />
              {(collapsed || openGroups.bugun) &&
                bugunLinks.map(link => <NavLink key={link.href} link={link} showLabel={!collapsed} />)
              }
            </>
          )}

          {/* ARAÇLAR */}
          {araclarLinks.length > 0 && (
            <>
              {collapsed ? <CollapsedDivider /> : <GroupHeader label="Araçlar" groupKey="araclar" show />}
              {(collapsed || openGroups.araclar) &&
                araclarLinks.map(link => <NavLink key={link.href} link={link} showLabel={!collapsed} />)
              }
            </>
          )}

          {/* İNSAN */}
          {insanLinks.length > 0 && (
            <>
              {collapsed ? <CollapsedDivider /> : <GroupHeader label="İnsan" groupKey="insan" show />}
              {(collapsed || openGroups.insan) &&
                insanLinks.map(link => <NavLink key={link.href} link={link} showLabel={!collapsed} />)
              }
            </>
          )}

          {/* ROTA */}
          {rotaLinks.length > 0 && (
            <>
              {collapsed ? <CollapsedDivider /> : <GroupHeader label="Rota" groupKey="rota" show />}
              {(collapsed || openGroups.rota) &&
                rotaLinks.map(link => <NavLink key={link.href} link={link} showLabel={!collapsed} />)
              }
            </>
          )}

          {/* FİNANS */}
          {finansLinks.length > 0 && (
            <>
              {collapsed ? <CollapsedDivider /> : <GroupHeader label="Finans" groupKey="finans" show />}
              {(collapsed || openGroups.finans) &&
                finansLinks.map(link => <NavLink key={link.href} link={link} showLabel={!collapsed} />)
              }
            </>
          )}

          {/* GÖREVLER */}
          {gorevlerLinks.length > 0 && (
            <>
              {collapsed ? <CollapsedDivider /> : <GroupHeader label="Görevler" groupKey="gorevler" show />}
              {(collapsed || openGroups.gorevler) &&
                gorevlerLinks.map(link => <NavLink key={link.href} link={link} showLabel={!collapsed} />)
              }
            </>
          )}

          {/* YÖNETİM */}
          {yonetimLinks.length > 0 && (
            <>
              {collapsed ? <CollapsedDivider /> : <GroupHeader label="Yönetim" groupKey="yonetim" show />}
              {(collapsed || openGroups.yonetim) && (
                <>
                  {yonetimLinks.map(link => <NavLink key={link.href} link={link} showLabel={!collapsed} />)}
                  {yonetimTeknikLinks.length > 0 && !collapsed && (
                    <p className="text-[9px] font-semibold text-zinc-700 uppercase tracking-widest px-2.5 pt-2 pb-1">Teknik</p>
                  )}
                  {yonetimTeknikLinks.map(link => <NavLink key={link.href} link={link} showLabel={!collapsed} />)}
                </>
              )}
            </>
          )}
        </nav>

        {/* Daralt butonu */}
        <div className="border-t border-zinc-800/60 px-2 py-3 shrink-0">
          <button
            onClick={() => setCollapsed(c => !c)}
            className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-xl text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/60 transition-all text-xs font-medium ${collapsed ? "justify-center" : ""}`}
            title={collapsed ? "Genişlet" : "Daralt"}
            aria-label={collapsed ? "Kenar çubuğunu genişlet" : "Kenar çubuğunu daralt"}
          >
            {collapsed ? <IconChevronRight size={14} /> : <><IconChevronLeft size={14} /><span>Daralt</span></>}
          </button>
        </div>
      </aside>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* MOBİL — Bottom Navigation Bar                                 */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-zinc-950/95 backdrop-blur-xl border-t border-zinc-800/60"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        aria-label="Alt gezinme"
      >
        <div className="flex items-stretch h-16">
          {/* Bottom nav linkleri */}
          {bottomNavLinks.map(link => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex-1 flex flex-col items-center justify-center gap-1 min-w-0 transition-colors ${
                  active ? "text-[var(--t-accent)]" : "text-zinc-500 active:text-zinc-200"
                }`}
                aria-label={link.label}
                aria-current={active ? "page" : undefined}
              >
                <link.Icon size={20} />
                <span className="text-[10px] font-medium leading-none truncate">{link.label}</span>
              </Link>
            );
          })}

          {/* "Daha Fazla" butonu */}
          <button
            onClick={() => setMobileOpen(o => !o)}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
              mobileOpen ? "text-[var(--t-accent)]" : "text-zinc-500 active:text-zinc-200"
            }`}
            aria-label="Daha fazla"
            aria-expanded={mobileOpen}
          >
            <IconMenu size={20} />
            <span className="text-[10px] font-medium leading-none">Daha Fazla</span>
          </button>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* MOBİL — "Daha Fazla" Drawer                                   */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-[60] flex items-end"
          onClick={() => setMobileOpen(false)}
          aria-modal="true"
          role="dialog"
          aria-label="Gezinme menüsü"
        >
          {/* Arka plan */}
          <div className="absolute inset-0 bg-zinc-950/70 backdrop-blur-sm" />

          {/* Drawer — aşağıdan yukarı */}
          <div
            className="relative w-full bg-zinc-950 border-t border-zinc-800/60 rounded-t-2xl shadow-2xl overflow-y-auto"
            style={{
              maxHeight: "calc(85dvh - env(safe-area-inset-bottom, 0px))",
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)",
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Başlık + kapat */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <div className="flex-1 flex justify-center">
                <div className="w-10 h-1 rounded-full bg-zinc-700" />
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="w-9 h-9 flex items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/70 transition-all"
                aria-label="Menüyü kapat"
              >
                <IconX size={18} />
              </button>
            </div>

            {/* Drawer içeriği */}
            <div className="px-3 py-2">

              {/* Bugün — bottom nav'da olmayan linkler */}
              {drawerBugunLinks.length > 0 && (
                <>
                  <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest px-2.5 pt-3 pb-1.5">Bugün</p>
                  {drawerBugunLinks.map(link => (
                    <NavLink key={link.href} link={link} showLabel onClick={() => setMobileOpen(false)} />
                  ))}
                </>
              )}

              {/* Araçlar */}
              {araclarLinks.length > 0 && (
                <>
                  <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest px-2.5 pt-4 pb-1.5">Araçlar</p>
                  {araclarLinks.map(link => (
                    <NavLink key={link.href} link={link} showLabel onClick={() => setMobileOpen(false)} />
                  ))}
                </>
              )}

              {/* İnsan */}
              {insanLinks.length > 0 && (
                <>
                  <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest px-2.5 pt-4 pb-1.5">İnsan</p>
                  {insanLinks.map(link => (
                    <NavLink key={link.href} link={link} showLabel onClick={() => setMobileOpen(false)} />
                  ))}
                </>
              )}

              {/* Rota */}
              {rotaLinks.length > 0 && (
                <>
                  <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest px-2.5 pt-4 pb-1.5">Rota</p>
                  {rotaLinks.map(link => (
                    <NavLink key={link.href} link={link} showLabel onClick={() => setMobileOpen(false)} />
                  ))}
                </>
              )}

              {/* Finans */}
              {finansLinks.length > 0 && (
                <>
                  <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest px-2.5 pt-4 pb-1.5">Finans</p>
                  {finansLinks.map(link => (
                    <NavLink key={link.href} link={link} showLabel onClick={() => setMobileOpen(false)} />
                  ))}
                </>
              )}

              {/* Görevler */}
              {gorevlerLinks.length > 0 && (
                <>
                  <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest px-2.5 pt-4 pb-1.5">Görevler</p>
                  {gorevlerLinks.map(link => (
                    <NavLink key={link.href} link={link} showLabel onClick={() => setMobileOpen(false)} />
                  ))}
                </>
              )}

              {/* Yönetim */}
              {yonetimLinks.length > 0 && (
                <>
                  <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest px-2.5 pt-4 pb-1.5">Yönetim</p>
                  {yonetimLinks.map(link => (
                    <NavLink key={link.href} link={link} showLabel onClick={() => setMobileOpen(false)} />
                  ))}
                  {yonetimTeknikLinks.length > 0 && (
                    <p className="text-[9px] font-semibold text-zinc-700 uppercase tracking-widest px-2.5 pt-2 pb-1">Teknik</p>
                  )}
                  {yonetimTeknikLinks.map(link => (
                    <NavLink key={link.href} link={link} showLabel onClick={() => setMobileOpen(false)} />
                  ))}
                </>
              )}

              {/* Çıkış */}
              <div className="mt-4 pt-4 border-t border-zinc-800/60">
                <button
                  onClick={async () => { setMobileOpen(false); await handleLogout(); }}
                  className="w-full flex items-center gap-2.5 text-sm text-zinc-500 hover:text-red-400 hover:bg-zinc-800/70 transition-colors px-2.5 py-2.5 rounded-xl"
                >
                  <IconLogOut size={16} />
                  Çıkış Yap
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
