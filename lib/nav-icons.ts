import {
  IconHome, IconClipboard, IconCheckSquare, IconClock, IconTrafficCone,
  IconStar, IconFileText, IconLightbulb, IconTruck, IconMap, IconSearch,
  IconClipboard2, IconBarChart, IconBuilding, IconZap, IconAlertTriangle,
  IconSettings, IconLogOut, IconBell, IconChevronLeft, IconChevronRight,
  IconX, IconMenu, IconCar, IconUsers, IconShield, IconActivity, IconWrench,
  IconCoin, IconKey, IconDocument, IconCalendar, IconHistory, IconArrowUpRight,
  IconCopy, IconPlus, IconCheck, IconChevronDown, IconChevronUp, IconMessageCircle,
  IconArrowDownRight, IconWallet, IconBadge,
} from "@/components/Icons";

// Nav config'te bir link'in ikonu string isim olarak saklanır (örn.
// "IconCoin") — bu dosya o ismi gerçek React component'ine çevirir.
// Admin panelindeki ikon seçici de bu registry'nin anahtarlarını listeler.
export const ICON_REGISTRY: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  IconHome, IconClipboard, IconCheckSquare, IconClock, IconTrafficCone,
  IconStar, IconFileText, IconLightbulb, IconTruck, IconMap, IconSearch,
  IconClipboard2, IconBarChart, IconBuilding, IconZap, IconAlertTriangle,
  IconSettings, IconLogOut, IconBell, IconChevronLeft, IconChevronRight,
  IconX, IconMenu, IconCar, IconUsers, IconShield, IconActivity, IconWrench,
  IconCoin, IconKey, IconDocument, IconCalendar, IconHistory, IconArrowUpRight,
  IconCopy, IconPlus, IconCheck, IconChevronDown, IconChevronUp, IconMessageCircle,
  IconArrowDownRight, IconWallet, IconBadge,
};

// Şema doğrulaması (lib/schemas.ts) sadece bu isim listesine ihtiyaç duyar,
// component'lerin kendisine değil.
export const NAV_ICON_NAMES: string[] = Object.keys(ICON_REGISTRY);

// Registry'de olmayan bir isimle karşılaşılırsa (örn. ileride bir ikon
// component'i kod tabanından silinirse ama eski bir config satırı hâlâ
// o ismi referans ediyorsa) sessizce bu ikona düşülür, hata fırlatılmaz.
export const DEFAULT_NAV_ICON = IconActivity;
