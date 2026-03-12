import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isAtLeast } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user)
      return NextResponse.json({ ok: false, error: "Yetkisiz erişim" }, { status: 401 });

    if (!isAtLeast(user.role, "yonetici"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const company_ids = searchParams.getAll("company_id");
    const date_from   = searchParams.get("date_from");
    const date_to     = searchParams.get("date_to");

    const params: string[] = [];
    let where = "";
    if (company_ids.length > 0) {
      where += ` AND va.company_id IN (${company_ids.map(() => "?").join(",")})`;
      params.push(...company_ids);
    }
    if (date_from)  { where += " AND va.arrival_date >= ?"; params.push(date_from); }
    if (date_to)    { where += " AND va.arrival_date <= ?"; params.push(date_to); }

    const db = getDb();
    const rows = await db.prepare(`
      SELECT
        c.name                              AS firma,
        cv.plate                            AS plaka,
        COALESCE(r.name, '')                AS guzergah,
        COALESCE(cv.notes, '')              AS notlar,
        va.arrival_date                     AS tarih,
        DATE_FORMAT(DATE_ADD(STR_TO_DATE(SUBSTRING(va.arrived_at, 1, 19), '%Y-%m-%dT%H:%i:%s'), INTERVAL 3 HOUR), '%H:%i') AS giris_saati,
        u.full_name                         AS kaydeden,
        ROUND(COALESCE(va.latitude,  0), 6) AS enlem,
        ROUND(COALESCE(va.longitude, 0), 6) AS boylam
      FROM vehicle_arrivals va
      JOIN company_vehicles cv ON cv.id = va.vehicle_id
      JOIN companies c         ON c.id  = va.company_id
      LEFT JOIN routes r       ON r.id  = cv.route_id
      LEFT JOIN users u        ON u.id  = va.recorded_by
      WHERE 1=1 ${where}
      ORDER BY va.arrived_at DESC
      LIMIT 500
    `).all(...params);

    return NextResponse.json({ ok: true, data: rows });
  } catch (error) {
    console.error("giris-kontrol report error:", error);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
