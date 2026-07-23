"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import ThemeSwitcher from "./ThemeSwitcher";
import GlobalSearch from "./GlobalSearch";
import GlobalCompanySelector from "./GlobalCompanySelector";
import {
  IconHome, IconTrafficCone, IconClock, IconCheckSquare,
  IconLogOut, IconBell, IconChevronLeft, IconChevronRight, IconX, IconMenu,
} from "./Icons";
import { ICON_REGISTRY, DEFAULT_NAV_ICON } from "@/lib/nav-icons";
import { hasPermission, isAtLeast, type UserRole } from "@/lib/permissions";
import type { NavConfigType, NavGroupType, NavConfigItemType } from "@/lib/schemas";

type NavUser = {
  full_name: string;
  role: string;
  allowed_pages?: string | null;
};

// Mobil bottom nav — en sık kullanılan 4 link (kapsam dışı — bkz. plan)
const BOTTOM_NAV = [
  { href: "/", label: "Panel", Icon: IconHome },
  { href: "/giris-kontrol", label: "Giriş Takip", Icon: IconTrafficCone },
  { href: "/transferler", label: "Transfer", Icon: IconClock },
  { href: "/gorevler", label: "İş Takibi", Icon: IconCheckSquare },
];

const NAV_PERMISSION_BY_HREF_FOR_BOTTOM_NAV: Record<string, string> = {
  "/": "dashboard:read",
  "/giris-kontrol": "arrivals:read",
  "/transferler": "transfers:read",
  "/gorevler": "dashboard:read",
};

// ── Nav config (DB'den fetch edilir, bu sabit sadece fetch başarısız
// olursa fallback olarak kullanılır — nav hiçbir durumda boş kalmaz) ──
const DEFAULT_NAV_CONFIG: NavConfigType = {
  groups: [
    {
      key: "bugun", label: "Bugün", sortOrder: 0, isActive: true, minRole: null,
      items: [
        { id: "bugun-1", href: "/", label: "Panel", icon: "IconHome", permission: "dashboard:read", isActive: true, sortOrder: 0, isCustom: false },
        { id: "bugun-2", href: "/gunluk", label: "Günlük", icon: "IconClipboard", permission: "dashboard:read", isActive: true, sortOrder: 1, isCustom: false },
        { id: "bugun-3", href: "/giris-kontrol", label: "Giriş Kontrol", icon: "IconTrafficCone", permission: "arrivals:read", isActive: true, sortOrder: 2, isCustom: false },
        { id: "bugun-4", href: "/transferler", label: "Transfer", icon: "IconClock", permission: "transfers:read", isActive: true, sortOrder: 3, isCustom: false },
        { id: "bugun-5", href: "/cetele", label: "Çetele", icon: "IconClipboard2", permission: "cetele:read", isActive: true, sortOrder: 4, isCustom: false },
      ],
    },
    {
      key: "araclar", label: "Araçlar", sortOrder: 1, isActive: true, minRole: "yetkili",
      items: [
        { id: "araclar-1", href: "/araclar", label: "Araçlar", icon: "IconCar", permission: "vehicles:read", isActive: true, sortOrder: 0, isCustom: false },
        { id: "araclar-2", href: "/bakim", label: "Araç Bakım", icon: "IconWrench", permission: "maintenance:read", isActive: true, sortOrder: 1, isCustom: false },
        { id: "araclar-3", href: "/belgeler", label: "Belgeler", icon: "IconDocument", permission: "documents:read", isActive: true, sortOrder: 2, isCustom: false },
        { id: "araclar-4", href: "/denetimler", label: "Denetimler", icon: "IconSearch", permission: "vehicles:read", isActive: true, sortOrder: 3, isCustom: false },
        { id: "araclar-5", href: "/filo/kazalar", label: "Kazalar", icon: "IconAlertTriangle", permission: "fleet_accidents:read", isActive: true, sortOrder: 4, isCustom: false },
        { id: "araclar-6", href: "/filo/cezalar", label: "Cezalar", icon: "IconAlertTriangle", permission: "fleet_penalties:read", isActive: true, sortOrder: 5, isCustom: false },
        { id: "araclar-7", href: "/filo/arizalar", label: "Arızalar", icon: "IconWrench", permission: "fleet_breakdowns:read", isActive: true, sortOrder: 6, isCustom: false },
        { id: "araclar-8", href: "/filo/sigortalar", label: "Sigortalar", icon: "IconDocument", permission: "fleet_insurances:read", isActive: true, sortOrder: 7, isCustom: false },
        { id: "araclar-9", href: "/filo/lastikler", label: "Lastikler", icon: "IconCar", permission: "fleet_tires:read", isActive: true, sortOrder: 8, isCustom: false },
        { id: "araclar-10", href: "/admin/gps-cihazlari", label: "GPS Cihazları", icon: "IconMap", permission: "gps_devices:read", isActive: true, sortOrder: 9, isCustom: false },
        { id: "araclar-11", href: "/yakit-kartlari", label: "Yakıt Kartları", icon: "IconZap", permission: "fuel_cards:read", isActive: true, sortOrder: 10, isCustom: false },
        { id: "araclar-12", href: "/admin/hgs-ogs", label: "HGS/OGS", icon: "IconCoin", permission: "hgs_ogs:read", isActive: true, sortOrder: 11, isCustom: false },
      ],
    },
    {
      key: "insan", label: "İnsan", sortOrder: 2, isActive: true, minRole: "yetkili",
      items: [
        { id: "insan-1", href: "/suruculer", label: "Sürücüler", icon: "IconUsers", permission: "drivers:read", isActive: true, sortOrder: 0, isCustom: false },
        { id: "insan-2", href: "/yolcular", label: "Yolcular", icon: "IconUsers", permission: "passengers:read", isActive: true, sortOrder: 1, isCustom: false },
        { id: "insan-3", href: "/izin-talepleri", label: "İzin Talepleri", icon: "IconCalendar", permission: "leave_requests:read", isActive: true, sortOrder: 2, isCustom: false },
        { id: "insan-4", href: "/sofor-degerlendirme", label: "Sürücü Değerlendirme", icon: "IconStar", permission: "drivers:read", isActive: true, sortOrder: 3, isCustom: false },
        { id: "insan-5", href: "/rehberler", label: "Rehberler", icon: "IconUsers", permission: "rehberler:read", isActive: true, sortOrder: 4, isCustom: false },
      ],
    },
    {
      key: "rota", label: "Rota", sortOrder: 3, isActive: true, minRole: "yetkili",
      items: [
        { id: "rota-1", href: "/guzergahlar", label: "Güzergahlar", icon: "IconMap", permission: "routes:read", isActive: true, sortOrder: 0, isCustom: false },
        { id: "rota-2", href: "/acik-guzergahlar", label: "Açık Güzergahlar", icon: "IconAlertTriangle", permission: "routes:read", isActive: true, sortOrder: 1, isCustom: false },
        { id: "rota-3", href: "/rota-planlama", label: "Rota Planlama", icon: "IconCalendar", permission: "routes:optimize", isActive: true, sortOrder: 2, isCustom: false },
        { id: "rota-4", href: "/operasyon-haritasi", label: "Operasyon Haritası", icon: "IconMap", permission: "map:read", isActive: true, sortOrder: 3, isCustom: false },
        { id: "rota-5", href: "/guzergah-fiyatlari", label: "Güzergah Fiyatları", icon: "IconCoin", permission: "route_prices:read", isActive: true, sortOrder: 4, isCustom: false },
      ],
    },
    {
      key: "finans", label: "Finans", sortOrder: 4, isActive: true, minRole: null,
      items: [
        { id: "finans-1", href: "/isletenler", label: "İşletenler (Araç Tedarikçileri)", icon: "IconBuilding", permission: "isleten:read", isActive: true, sortOrder: 0, isCustom: false },
        { id: "finans-2", href: "/hakedis", label: "Hakediş", icon: "IconCoin", permission: "hakedis:read", isActive: true, sortOrder: 1, isCustom: false },
        { id: "finans-3", href: "/mutabakat", label: "Firma Mutabakat", icon: "IconCoin", permission: "firma_mutabakat:read", isActive: true, sortOrder: 2, isCustom: false },
        { id: "finans-4", href: "/kar-zarar", label: "Kâr-Zarar", icon: "IconBarChart", permission: "reports:read", isActive: true, sortOrder: 3, isCustom: false },
        { id: "finans-5", href: "/butce", label: "Bütçe & Maliyet", icon: "IconCoin", permission: "budget:read", isActive: true, sortOrder: 4, isCustom: false },
        { id: "finans-6", href: "/firmalar", label: "Firmalar (Müşteriler)", icon: "IconBuilding", permission: "companies:read", isActive: true, sortOrder: 5, isCustom: false },
        { id: "finans-7", href: "/raporlar", label: "Raporlar", icon: "IconBarChart", permission: "reports:read", isActive: true, sortOrder: 6, isCustom: false },
        { id: "finans-8", href: "/finans/gelir-gider", label: "Gelir-Gider", icon: "IconCoin", permission: "finans_gelir_gider:read", isActive: true, sortOrder: 7, isCustom: false },
        { id: "finans-9", href: "/finans/masraf-talebi", label: "Masraf Talebi", icon: "IconClipboard2", permission: "finans_masraf_talebi:read", isActive: true, sortOrder: 8, isCustom: false },
        { id: "finans-10", href: "/finans/faturalar", label: "Faturalar", icon: "IconDocument", permission: "finans_fatura:read", isActive: true, sortOrder: 9, isCustom: false },
        { id: "finans-11", href: "/finans/fisler", label: "Fişler", icon: "IconClipboard2", permission: "finans_fis:read", isActive: true, sortOrder: 10, isCustom: false },
        { id: "finans-12", href: "/finans/belgeler", label: "Finans Belgeleri", icon: "IconDocument", permission: "finans_belge:read", isActive: true, sortOrder: 11, isCustom: false },
        { id: "finans-13", href: "/finans/odemeler", label: "Ödemeler", icon: "IconCoin", permission: "finans_odeme:read", isActive: true, sortOrder: 12, isCustom: false },
        { id: "finans-14", href: "/finans/banka-hareketleri", label: "Banka Hareketleri", icon: "IconActivity", permission: "finans_banka_hareketi:read", isActive: true, sortOrder: 13, isCustom: false },
      ],
    },
    {
      key: "gorevler", label: "Görevler", sortOrder: 5, isActive: true, minRole: null,
      items: [
        { id: "gorevler-1", href: "/gorevler", label: "İş Takibi", icon: "IconCheckSquare", permission: "dashboard:read", isActive: true, sortOrder: 0, isCustom: false },
        { id: "gorevler-2", href: "/oneriler", label: "Öneri/Talep", icon: "IconLightbulb", permission: "suggestions:read", isActive: true, sortOrder: 1, isCustom: false },
        { id: "gorevler-3", href: "/notlar", label: "Notlar", icon: "IconFileText", permission: "dashboard:read", isActive: true, sortOrder: 2, isCustom: false },
        { id: "gorevler-4", href: "/surucu-sicil", label: "Sürücü Sicil", icon: "IconClipboard2", permission: "driver_records:read", isActive: true, sortOrder: 3, isCustom: false },
      ],
    },
    {
      key: "yonetim", label: "Yönetim", sortOrder: 6, isActive: true, minRole: null,
      items: [
        { id: "yonetim-1", href: "/toplu-islem", label: "Toplu İşlem", icon: "IconClipboard2", permission: "bulk_actions:preview", isActive: true, sortOrder: 0, isCustom: false, minRole: "yetkili" },
        { id: "yonetim-2", href: "/admin/musteriler", label: "Müşteri Portalı", icon: "IconUsers", permission: "portal_requests:read", isActive: true, sortOrder: 1, isCustom: false, minRole: "admin" },
        { id: "yonetim-10", href: "/musteri-destek", label: "Müşteri Destek", icon: "IconMessageCircle", permission: "musteri_destek:read", isActive: true, sortOrder: 2, isCustom: false, minRole: "yetkili" },
        { id: "yonetim-3", href: "/admin/hizli-gorev", label: "Hızlı Görev", icon: "IconZap", permission: "dashboard:read", isActive: true, sortOrder: 3, isCustom: false, minRole: "admin" },
        { id: "yonetim-4", href: "/admin/uyarilar", label: "Uyarılar", icon: "IconAlertTriangle", permission: "warnings:read", isActive: true, sortOrder: 4, isCustom: false, minRole: "admin" },
        { id: "yonetim-5", href: "/admin/izin-onaylayicilar", label: "İzin Onaylayıcıları", icon: "IconShield", permission: "users:read", isActive: true, sortOrder: 5, isCustom: false, minRole: "admin" },
        { id: "yonetim-6", href: "/admin/kara-liste", label: "Kara Liste", icon: "IconAlertTriangle", permission: "kara_liste:read", isActive: true, sortOrder: 6, isCustom: false, minRole: "admin" },
        { id: "yonetim-7", href: "/admin/duyurular", label: "Duyurular", icon: "IconBell", permission: "duyurular:read", isActive: true, sortOrder: 7, isCustom: false, minRole: "admin" },
        { id: "yonetim-8", href: "/admin/anketler", label: "Anketler", icon: "IconClipboard", permission: "anketler:read", isActive: true, sortOrder: 8, isCustom: false, minRole: "admin" },
        { id: "yonetim-9", href: "/admin/dogum-gunleri", label: "Doğum Günleri", icon: "IconStar", permission: "drivers:read", isActive: true, sortOrder: 9, isCustom: false, minRole: "admin" },
      ],
    },
    {
      key: "yonetim-teknik", label: "Yönetim (Teknik)", sortOrder: 7, isActive: true, minRole: "admin",
      items: [
        { id: "teknik-1", href: "/admin/yakit-fiyatlari", label: "Yakıt Fiyatları", icon: "IconCoin", permission: "yakit_fiyatlari:read", isActive: true, sortOrder: 0, isCustom: false },
        { id: "teknik-2", href: "/admin/otoyol-fiyatlari", label: "Otoyol/Köprü Fiyatları", icon: "IconCoin", permission: "otoyol_fiyatlari:read", isActive: true, sortOrder: 1, isCustom: false },
        { id: "teknik-3", href: "/admin/arac-gruplari", label: "Araç Grupları", icon: "IconCar", permission: "arac_gruplari:read", isActive: true, sortOrder: 2, isCustom: false },
        { id: "teknik-4", href: "/admin/sigorta-sirketleri", label: "Sigorta Şirketleri", icon: "IconDocument", permission: "sigorta_sirketleri:read", isActive: true, sortOrder: 3, isCustom: false },
        { id: "teknik-5", href: "/admin/banka-tanimlari", label: "Banka Tanımları", icon: "IconBuilding", permission: "banka_tanimlari:read", isActive: true, sortOrder: 4, isCustom: false },
        { id: "teknik-6", href: "/admin/donem-tanimlari", label: "Dönem Tanımları", icon: "IconCalendar", permission: "donem_tanimlari:read", isActive: true, sortOrder: 5, isCustom: false },
        { id: "teknik-7", href: "/admin/api-keys", label: "API Anahtarları", icon: "IconKey", permission: "integrations:update", isActive: true, sortOrder: 6, isCustom: false },
        { id: "teknik-8", href: "/admin/audit-log", label: "Aktivite Günlüğü", icon: "IconHistory", permission: "audit:read", isActive: true, sortOrder: 7, isCustom: false },
        { id: "teknik-9", href: "/admin/roller", label: "Roller ve Yetkiler", icon: "IconKey", permission: "users:permissions", isActive: true, sortOrder: 8, isCustom: false },
        { id: "teknik-10", href: "/admin", label: "Yönetim Paneli", icon: "IconSettings", permission: "users:read", isActive: true, sortOrder: 9, isCustom: false },
      ],
    },
  ],
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
  const [navConfig, setNavConfig] = useState<NavConfigType>(DEFAULT_NAV_CONFIG);
  // Sidebar grup açık/kapalı durumu
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    bugun: true,
    araclar: true,
    insan: false,
    rota: false,
    finans: false,
    gorevler: false,
    yonetim: false,
    "yonetim-teknik": false,
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

  // Nav yapısını DB'den çek — başarısız olursa DEFAULT_NAV_CONFIG (yukarıda
  // tanımlı, bugünkü sabit yapının birebir aynısı) kullanılmaya devam eder,
  // sidebar hiçbir zaman boş kalmaz.
  useEffect(() => {
    fetch("/api/admin/nav-config")
      .then((r) => { if (!r.ok) throw new Error("nav-config fetch failed"); return r.json(); })
      .then((d) => { if (d.ok && d.data) setNavConfig(d.data); })
      .catch(() => {});
  }, []);

  const role = user?.role || "personel";
  const isManager = isAtLeast(role, "yetkili");

  // Mevcut sayfanın hangi gruba ait olduğunu bul ve o grubu aç
  useEffect(() => {
    const updates: Record<string, boolean> = {};
    for (const group of navConfig.groups) {
      if (group.items.some((it) => (it.href === "/" ? pathname === "/" : pathname.startsWith(it.href)))) {
        updates[group.key] = true;
      }
    }
    if (Object.keys(updates).length > 0) {
      setOpenGroups((prev) => ({ ...prev, ...updates }));
    }
  }, [pathname, navConfig]);

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

  const canShowItem = (item: NavConfigItemType, group: NavGroupType) => {
    if (!item.isActive || !group.isActive) return false;
    if (allowedPages !== null && !allowedPages.includes(item.href)) return false;
    const requiredMinRole = item.minRole ?? group.minRole;
    if (requiredMinRole === "admin" && role !== "admin") return false;
    if (requiredMinRole === "yetkili" && !isAtLeast(role as UserRole, "yetkili")) return false;
    return hasPermission({ role: role as UserRole, permissions: (user as any)?.permissions }, item.permission as any);
  };

  const getGroupItems = (key: string) => {
    const group = navConfig.groups.find((g) => g.key === key);
    if (!group || !group.isActive) return [];
    return [...group.items]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .filter((it) => canShowItem(it, group))
      .map((it) => ({ href: it.href, label: it.label, Icon: ICON_REGISTRY[it.icon] ?? DEFAULT_NAV_ICON }));
  };

  const filterByAllowed = <T extends { href: string }>(ls: T[]) =>
    ls.filter((l) => {
      const permission = NAV_PERMISSION_BY_HREF_FOR_BOTTOM_NAV[l.href];
      if (!permission) return role !== "personel";
      return hasPermission({ role: role as UserRole, permissions: (user as any)?.permissions }, permission);
    });

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

  // Veri hazırlığı — artık DB'den gelen navConfig'ten türetiliyor
  const bugunLinks = getGroupItems("bugun");
  const araclarLinks = getGroupItems("araclar");
  const insanLinks = getGroupItems("insan");
  const rotaLinks = getGroupItems("rota");
  const finansLinks = getGroupItems("finans");
  const gorevlerLinks = getGroupItems("gorevler");
  const yonetimLinks = getGroupItems("yonetim");
  const yonetimTeknikLinks = getGroupItems("yonetim-teknik");

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

          {([
            { key: "bugun", label: "Bugün", links: bugunLinks },
            { key: "araclar", label: "Araçlar", links: araclarLinks },
            { key: "insan", label: "İnsan", links: insanLinks },
            { key: "rota", label: "Rota", links: rotaLinks },
            { key: "finans", label: "Finans", links: finansLinks },
            { key: "gorevler", label: "Görevler", links: gorevlerLinks },
            { key: "yonetim", label: "Yönetim", links: yonetimLinks },
            { key: "yonetim-teknik", label: "Yönetim (Teknik)", links: yonetimTeknikLinks },
          ] as const).map((g, idx) => g.links.length > 0 && (
            <div key={g.key}>
              {idx === 0
                ? <GroupHeader label={g.label} groupKey={g.key} show={!collapsed} />
                : (collapsed ? <CollapsedDivider /> : <GroupHeader label={g.label} groupKey={g.key} show />)}
              {(collapsed || openGroups[g.key]) &&
                g.links.map((link) => <NavLink key={link.href} link={link} showLabel={!collapsed} />)
              }
            </div>
          ))}
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

              {([
                { key: "bugun", label: "Bugün", links: drawerBugunLinks },
                { key: "araclar", label: "Araçlar", links: araclarLinks },
                { key: "insan", label: "İnsan", links: insanLinks },
                { key: "rota", label: "Rota", links: rotaLinks },
                { key: "finans", label: "Finans", links: finansLinks },
                { key: "gorevler", label: "Görevler", links: gorevlerLinks },
                { key: "yonetim", label: "Yönetim", links: yonetimLinks },
                { key: "yonetim-teknik", label: "Yönetim (Teknik)", links: yonetimTeknikLinks },
              ] as const).map((g) => g.links.length > 0 && (
                <div key={g.key}>
                  <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest px-2.5 pt-4 pb-1.5">{g.label}</p>
                  {g.links.map((link) => (
                    <NavLink key={link.href} link={link} showLabel onClick={() => setMobileOpen(false)} />
                  ))}
                </div>
              ))}

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
