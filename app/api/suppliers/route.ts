import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";
import { supplierCreateSchema } from "@/lib/schemas";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "route_suppliers:read")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("company_id");
    const active = searchParams.get("active");
    const db = getDb();
    const params: unknown[] = [];
    let where = "WHERE 1=1";
    let join = "";

    if (companyId) {
      join = "JOIN company_suppliers cs_filter ON cs_filter.supplier_id = s.id AND cs_filter.company_id = ? AND cs_filter.status = 'active'";
      params.push(companyId);
    }
    if (active === "1") where += " AND s.is_active = 1";

    const data = await db.prepare(
      `SELECT s.*,
              COUNT(DISTINCT v.id) AS vehicle_count,
              COUNT(DISTINCT cs.company_id) AS company_count
       FROM suppliers s
       ${join}
       LEFT JOIN vehicles v ON v.supplier_id = s.id
       LEFT JOIN company_suppliers cs ON cs.supplier_id = s.id AND cs.status = 'active'
       ${where}
       GROUP BY s.id
       ORDER BY s.title ASC`
    ).all(...params);

    return NextResponse.json({ ok: true, data });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "route_suppliers:create")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const parsed = supplierCreateSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const data = parsed.data;
    const db = getDb();
    const id = uuidv4();
    const now = nowIso();

    await db.transaction(async (conn) => {
      await conn.execute(
        `INSERT INTO suppliers (id, title, contact_name, phone, email, tax_id, tax_office, notes, is_active, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, data.title.trim(), data.contact_name || null, data.phone || null, data.email || null, data.tax_id || null, data.tax_office || null, data.notes || null, data.is_active === false ? 0 : 1, user.id, now, now]
      );
      for (const companyId of data.company_ids || []) {
        await conn.execute(
          `INSERT INTO company_suppliers (id, company_id, supplier_id, status, created_by, created_at, updated_at)
           VALUES (?, ?, ?, 'active', ?, ?, ?)
           ON DUPLICATE KEY UPDATE status='active', updated_at=VALUES(updated_at)`,
          [uuidv4(), companyId, id, user.id, now, now]
        );
      }
    });

    await logAudit({ actorUserId: user.id, action: "supplier.create", entityType: "suppliers", entityId: id, details: { title: data.title } });
    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
