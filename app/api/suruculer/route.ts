import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "drivers:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";
    const company_id = searchParams.get("company_id") || "";
    const status = searchParams.get("status") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") || "100")));
    const offset = (page - 1) * limit;

    const db = getDb();

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (q) { conditions.push("d.name LIKE ?"); params.push(`%${q}%`); }
    if (company_id) { conditions.push("d.company_id = ?"); params.push(company_id); }
    if (status) { conditions.push("d.status = ?"); params.push(status); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countRow = await db.prepare(
      `SELECT COUNT(*) as total FROM drivers d ${where}`
    ).get(...params) as { total: number };

    const drivers = await db.prepare(
      `SELECT d.*,
              c.name AS company_name,
              v.plate AS current_vehicle_plate,
              v.id   AS current_vehicle_id,
              COALESCE(SUM(dr.deduction_pts), 0) AS total_deduction
       FROM drivers d
       LEFT JOIN companies c ON c.id = d.company_id
       LEFT JOIN vehicles  v ON v.driver_id = d.id AND v.status_code = 'active'
       LEFT JOIN (
         SELECT driver_name,
                SUM(CASE severity WHEN 1 THEN 5 WHEN 2 THEN 15 WHEN 3 THEN 25 WHEN 4 THEN 40 ELSE 0 END) AS deduction_pts
         FROM driver_records
         GROUP BY driver_name
       ) dr ON dr.driver_name = d.name
       ${where}
       GROUP BY d.id
       ORDER BY d.name ASC
       LIMIT ? OFFSET ?`
    ).all(...params, limit, offset) as any[];

    const total = countRow?.total ?? 0;

    return NextResponse.json({
      ok: true,
      data: drivers,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "drivers:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    const name = (body.name || "").trim();
    if (!name) return NextResponse.json({ ok: false, error: "Sürücü adı zorunludur" }, { status: 400 });

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();

    await db.prepare(
      `INSERT INTO drivers
         (id, name, phone, email, tc_no, birth_date, license_number, license_class,
          license_expiry, src_expiry, psiko_expiry, health_expiry,
          photo_url, notes, status, company_id, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id, name,
      body.phone || null,
      body.email || null,
      body.tc_no || null,
      body.birth_date || null,
      body.license_number || null,
      body.license_class || null,
      body.license_expiry || null,
      body.src_expiry || null,
      body.psiko_expiry || null,
      body.health_expiry || null,
      body.photo_url || null,
      body.notes || null,
      body.status || "aktif",
      body.company_id || null,
      user.id,
      now, now,
    );

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
