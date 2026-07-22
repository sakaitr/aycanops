import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";
import { supplierUpdateSchema } from "@/lib/schemas";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "route_suppliers:read")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { id } = await params;
    const db = getDb();
    const supplier = await db.prepare("SELECT * FROM suppliers WHERE id = ? LIMIT 1").get(id);
    if (!supplier) return NextResponse.json({ ok: false, error: "Tedarikçi bulunamadı" }, { status: 404 });
    const companies = await db.prepare(
      `SELECT cs.*, c.name AS company_name FROM company_suppliers cs JOIN companies c ON c.id = cs.company_id WHERE cs.supplier_id = ? ORDER BY c.name ASC`
    ).all(id);
    return NextResponse.json({ ok: true, data: { ...(supplier as object), companies } });
  } catch (e) { return apiError(e); }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "route_suppliers:update")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { id } = await params;
    const parsed = supplierUpdateSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const data = parsed.data;
    const now = nowIso();
    const db = getDb();
    const existing = await db.prepare("SELECT id, title FROM suppliers WHERE id = ? LIMIT 1").get(id) as { id: string; title: string } | undefined;
    if (!existing) return NextResponse.json({ ok: false, error: "Tedarikçi bulunamadı" }, { status: 404 });

    const fields = ["title", "contact_name", "phone", "email", "tax_id", "tax_office", "notes", "is_active"];
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const field of fields) {
      if ((data as any)[field] !== undefined) {
        sets.push(`${field} = ?`);
        vals.push(field === "is_active" ? ((data as any)[field] ? 1 : 0) : ((data as any)[field] || null));
      }
    }
    await db.transaction(async (conn) => {
      if (sets.length) await conn.execute(`UPDATE suppliers SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`, [...vals, now, id] as any[]);
      if (data.company_ids) {
        await conn.execute("UPDATE company_suppliers SET status='inactive', updated_at=? WHERE supplier_id=?", [now, id]);
        for (const companyId of data.company_ids) {
          await conn.execute(
            `INSERT INTO company_suppliers (id, company_id, supplier_id, status, created_by, created_at, updated_at)
             VALUES (?, ?, ?, 'active', ?, ?, ?)
             ON DUPLICATE KEY UPDATE status='active', updated_at=VALUES(updated_at)`,
            [uuidv4(), companyId, id, user.id, now, now]
          );
        }
      }
    });
    await logAudit({ actorUserId: user.id, action: "supplier.update", entityType: "suppliers", entityId: id, details: { before_title: existing.title } });
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "route_suppliers:deactivate")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { id } = await params;
    const now = nowIso();
    const result = await getDb().prepare("UPDATE suppliers SET is_active=0, updated_at=? WHERE id=?").run(now, id);
    await logAudit({ actorUserId: user.id, action: "supplier.deactivate", entityType: "suppliers", entityId: id });
    return NextResponse.json({ ok: true, data: { affected: result.affectedRows } });
  } catch (e) { return apiError(e); }
}
