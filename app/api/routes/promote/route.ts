import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";

// Bir firmanın serbest metin route_name'ini gerçek bir routes kaydına çevirir
// ve o isme sahip tüm company_vehicles satırlarını yeni route_id'ye bağlar.
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "routes:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    const companyId: string = body?.company_id;
    const routeName: string = (body?.route_name || "").trim();
    if (!companyId || !routeName) {
      return NextResponse.json({ ok: false, error: "company_id ve route_name gerekli" }, { status: 400 });
    }

    if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(companyId)) {
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
      }
    }

    const db = getDb();

    // Aynı firmada bu isimde zaten bağlı bir route varsa ona bağla, yoksa yenisini oluştur.
    const existing = await db.prepare(
      "SELECT id FROM routes WHERE company_id = ? AND name = ?"
    ).get(companyId, routeName) as { id: string } | undefined;

    let routeId = existing?.id;
    if (!routeId) {
      const now = nowIso();
      routeId = uuidv4();
      await db.prepare(
        `INSERT INTO routes (id, name, direction, company_id, is_active, created_by, created_at, updated_at)
         VALUES (?, ?, 'both', ?, 1, ?, ?, ?)`
      ).run(routeId, routeName, companyId, user.id, now, now);
    }

    const result = await db.prepare(
      `UPDATE company_vehicles SET route_id = ?
       WHERE company_id = ? AND route_name = ? AND route_id IS NULL`
    ).run(routeId, companyId, routeName);

    return NextResponse.json({ ok: true, data: { route_id: routeId, linked_vehicles: result.affectedRows } });
  } catch (e) { return apiError(e); }
}
