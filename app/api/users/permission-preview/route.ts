import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  PERMISSIONS,
  PermissionKey,
  UserRole,
  getEffectivePermissions,
  hasPermission,
} from "@/lib/permissions";

const RESOURCE_LABELS: Record<string, string> = {
  dashboard: "Panel",
  companies: "Firmalar",
  arrivals: "Giriş Kontrol",
  vehicles: "Araçlar",
  drivers: "Sürücüler",
  driver_records: "Sürücü Sicil",
  routes: "Güzergahlar",
  map: "Harita",
  passengers: "Yolcular",
  documents: "Belgeler",
  maintenance: "Bakım",
  reports: "Raporlar",
  budget: "Bütçe",
  portal_requests: "Portal Talepleri",
  notifications: "Bildirimler",
  warnings: "Uyarılar",
  suggestions: "Öneri/Talep",
  inspection_configs: "Denetim Konfigürasyonu",
  imports: "Import",
  bulk_actions: "Toplu İşlemler",
  users: "Kullanıcılar",
  departments: "Departmanlar",
  settings: "Ayarlar",
  integrations: "Entegrasyonlar",
  audit: "Audit",
};

const ACTION_LABELS: Record<string, string> = {
  read: "Görüntüle",
  create: "Oluştur",
  update: "Güncelle",
  delete: "Sil",
  deactivate: "Pasifleştir",
  bulk: "Toplu işlem",
  export: "Dışa aktar",
  publish: "Yayınla",
  optimize: "Optimize et",
  live: "Canlı takip",
  history: "Geçmiş",
  geocode: "Adres çöz",
  edit: "Düzenle",
  import: "İçe aktar",
  approve: "Onayla",
  close: "Kapat",
  subscribe: "Abone ol",
  share_portal: "Portalla paylaş",
  validate: "Doğrula",
  execute: "Çalıştır",
  rollback: "Geri al",
  preview: "Önizle",
  update_settings: "Ayar güncelle",
  sync: "Senkronize et",
  reject: "Reddet",
  comment: "Yorumla",
  send: "Gönder",
  assign: "Ata/Yönet",
};

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "users:permissions")) {
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    }

    const body = await req.json();
    const role = body?.role;
    if (typeof role !== "string" || !role) {
      return NextResponse.json({ ok: false, error: "Geçersiz rol" }, { status: 400 });
    }
    const db = getDb();
    const roleRow = await db.prepare("SELECT name, label FROM roles WHERE name = ?").get(role) as { name: string; label: string } | undefined;
    if (!roleRow) {
      return NextResponse.json({ ok: false, error: "Geçersiz rol" }, { status: 400 });
    }

    const allowedPages = normalizeStringArray(body?.allowed_pages);
    const allowedCompanies = normalizeStringArray(body?.allowed_companies);
    const effectivePermissions = new Set(getEffectivePermissions(role));
    const groups = Object.entries(PERMISSIONS).map(([resource, actions]) => {
      const permissions = actions.map((action) => {
        const key = `${resource}:${action}` as PermissionKey;
        return {
          key,
          label: ACTION_LABELS[action] ?? action,
          allowed: effectivePermissions.has(key),
        };
      });

      return {
        resource,
        label: RESOURCE_LABELS[resource] ?? resource,
        permissions,
        allowedCount: permissions.filter((permission) => permission.allowed).length,
        totalCount: permissions.length,
      };
    });

    return NextResponse.json({
      ok: true,
      data: {
        role,
        roleLabel: roleRow.label,
        totalPermissions: effectivePermissions.size,
        groups,
        restrictions: {
          pages: allowedPages
            ? { restricted: true, count: allowedPages.length, values: allowedPages }
            : { restricted: false, count: 0, values: [] },
          companies: allowedCompanies
            ? { restricted: true, count: allowedCompanies.length, values: allowedCompanies }
            : { restricted: false, count: 0, values: [] },
        },
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
