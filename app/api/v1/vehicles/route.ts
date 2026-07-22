import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { validateApiKey } from "@/lib/api-key";
import { apiError } from "@/lib/api-error";

// GET /api/v1/vehicles — Public API: araç listesi
export async function GET(req: NextRequest) {
  try {
    const key = await validateApiKey(req);
    if (!key) {
      return NextResponse.json({ error: "Geçersiz veya eksik API anahtarı" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("company_id");
    const status = searchParams.get("status"); // aktif | pasif

    const db = getDb();
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (companyId) { conditions.push("v.company_id = ?"); params.push(companyId); }
    if (status) { conditions.push("v.status = ?"); params.push(status); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await db.prepare(`
      SELECT
        v.id, v.plate, v.brand, v.model, v.year, v.capacity,
        v.status, v.type, v.color, v.notes,
        c.name AS company_name
      FROM vehicles v
      LEFT JOIN companies c ON c.id = v.company_id
      ${where}
      ORDER BY v.plate ASC
      LIMIT 500
    `).all(...params);

    return NextResponse.json({
      ok: true,
      count: (rows as unknown[]).length,
      data: rows,
    });
  } catch (e) {
    return apiError(e);
  }
}
