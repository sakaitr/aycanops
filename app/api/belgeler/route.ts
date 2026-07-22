import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { hasPermission } from "@/lib/permissions";

/**
 * GET /api/belgeler?days=60&company_id=...
 * Returns all vehicle documents expiring within `days` days, plus already expired.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    }
    if (!hasPermission(user, "documents:read")) {
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    }

    const sp = new URL(req.url).searchParams;
    const days = parseInt(sp.get("days") || "60", 10);
    const companyId = sp.get("company_id") || null;
    const filterType = sp.get("type") || null;

    const db = getDb();

    let query = `
      SELECT
        vd.id,
        vd.vehicle_id,
        vd.doc_type,
        vd.doc_label,
        vd.expiry_date,
        vd.notes,
        vd.created_at,
        v.plate,
        v.brand,
        v.model,
        c.name AS company_name,
        DATEDIFF(vd.expiry_date, CURDATE()) AS days_remaining
      FROM vehicle_documents vd
      JOIN vehicles v ON v.id = vd.vehicle_id
      LEFT JOIN company_vehicles cv ON cv.vehicle_id = v.id AND cv.is_active = 1
      LEFT JOIN companies c ON c.id = cv.company_id
      WHERE vd.expiry_date IS NOT NULL
        AND vd.expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
    `;
    const params: unknown[] = [days];

    if (companyId) {
      query += ` AND cv.company_id = ?`;
      params.push(companyId);
    }
    if (filterType) {
      query += ` AND vd.doc_type = ?`;
      params.push(filterType);
    }

    const statsQuery = `
      SELECT
        SUM(CASE WHEN DATEDIFF(vd.expiry_date, CURDATE()) < 0 THEN 1 ELSE 0 END) AS expired,
        SUM(CASE WHEN DATEDIFF(vd.expiry_date, CURDATE()) BETWEEN 0 AND 7 THEN 1 ELSE 0 END) AS urgent,
        SUM(CASE WHEN DATEDIFF(vd.expiry_date, CURDATE()) BETWEEN 8 AND 30 THEN 1 ELSE 0 END) AS warning,
        COUNT(*) AS total
      FROM vehicle_documents vd
      JOIN vehicles v ON v.id = vd.vehicle_id
      LEFT JOIN company_vehicles cv ON cv.vehicle_id = v.id AND cv.is_active = 1
      LEFT JOIN companies c ON c.id = cv.company_id
      WHERE vd.expiry_date IS NOT NULL
        AND vd.expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
        ${companyId ? "AND cv.company_id = ?" : ""}
        ${filterType ? "AND vd.doc_type = ?" : ""}
    `;
    const statsRow = await db.prepare(statsQuery).get(...params) as { expired: number; urgent: number; warning: number; total: number };

    query += ` ORDER BY vd.expiry_date ASC LIMIT 200`;

    const docs = await db.prepare(query).all(...params) as Record<string, unknown>[];

    return NextResponse.json({
      ok: true,
      data: docs,
      stats: {
        expired: Number(statsRow.expired) || 0,
        urgent: Number(statsRow.urgent) || 0,
        warning: Number(statsRow.warning) || 0,
        total: Number(statsRow.total) || 0,
      },
    });
  } catch (e) { return apiError(e); }
}
