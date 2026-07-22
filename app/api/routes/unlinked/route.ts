import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";

// company_vehicles.route_name serbest metin olarak girilmiş ama routes tablosunda
// karşılığı yok (route_id boş) olan kayıtları firma+isim bazında gruplayıp listeler.
// Güzergahlar sayfasında "bunu güzergah olarak ekle" akışı için kullanılır.
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "routes:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("company_id");

    const db = getDb();
    let companyClause = "";
    const params: string[] = [];
    if (companyId) {
      companyClause = "AND cv.company_id = ?";
      params.push(companyId);
    } else if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (allowed.length === 0) return NextResponse.json({ ok: true, data: [] });
      companyClause = `AND cv.company_id IN (${allowed.map(() => "?").join(",")})`;
      params.push(...allowed);
    }

    const data = await db.prepare(
      `SELECT cv.company_id, c.name AS company_name, cv.route_name,
              COUNT(*) AS vehicle_count,
              GROUP_CONCAT(cv.plate ORDER BY cv.plate SEPARATOR ', ') AS plates
       FROM company_vehicles cv
       JOIN companies c ON c.id = cv.company_id
       WHERE cv.route_id IS NULL
         AND cv.route_name IS NOT NULL
         AND cv.route_name != ''
         AND cv.is_active = 1
         ${companyClause}
       GROUP BY cv.company_id, cv.route_name
       ORDER BY c.name ASC, cv.route_name ASC`
    ).all(...params) as any[];

    return NextResponse.json({ ok: true, data });
  } catch (e) { return apiError(e); }
}
