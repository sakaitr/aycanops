import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";

// Returns all active company vehicles with company name, for use in dropdowns
export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const db = getDb();

    // Respect allowed_companies restriction
    const allowedIds: string[] | null =
      user.role !== "admin" && user.allowed_companies
        ? JSON.parse(user.allowed_companies)
        : null;

    let sql = `
      SELECT cv.id, cv.plate, cv.notes, cv.driver_name, cv.company_id,
             c.name as company_name
      FROM company_vehicles cv
      JOIN companies c ON c.id = cv.company_id
      WHERE cv.is_active = 1 AND c.is_active = 1`;
    const params: unknown[] = [];

    if (allowedIds && allowedIds.length > 0) {
      sql += ` AND cv.company_id IN (${allowedIds.map(() => "?").join(",")})`;
      params.push(...allowedIds);
    } else if (allowedIds && allowedIds.length === 0) {
      return NextResponse.json({ ok: true, data: [] });
    }

    sql += " ORDER BY c.name ASC, cv.plate ASC";
    const data = await db.prepare(sql).all(...params);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
