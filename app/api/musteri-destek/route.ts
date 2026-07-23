import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "musteri_destek:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("company_id");
    const durum = searchParams.get("durum");

    const db = getDb();
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (companyId) { conditions.push("pt.company_id = ?"); params.push(companyId); }
    if (durum) { conditions.push("pt.durum = ?"); params.push(durum); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const data = await db.prepare(`
      SELECT pt.*, c.name AS company_name, cu.full_name AS olusturan
      FROM portal_tickets pt
      JOIN companies c ON c.id = pt.company_id
      JOIN customer_users cu ON cu.id = pt.customer_user_id
      ${where}
      ORDER BY pt.created_at DESC
      LIMIT 500
    `).all(...params);

    return NextResponse.json({ ok: true, data });
  } catch (e) { return apiError(e); }
}
