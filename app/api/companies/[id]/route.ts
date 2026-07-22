import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { companyUpdateSchema } from "@/lib/schemas";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "companies:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { id } = await params;

    // A-3: allowed_companies enforcement
    if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(id)) {
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
      }
    }

    const db = getDb();
    const company = await db.prepare(
      `SELECT c.*, u.full_name as responsible_name FROM companies c LEFT JOIN users u ON u.id = c.responsible_id WHERE c.id = ?`
    ).get(id);
    if (!company) return NextResponse.json({ ok: false, error: "Firma bulunamadı" }, { status: 404 });
    const vehicles = await db.prepare("SELECT * FROM company_vehicles WHERE company_id = ? AND is_active = 1 ORDER BY plate ASC").all(id);
    return NextResponse.json({ ok: true, data: { ...company as object, vehicles } });
  } catch (e) { return apiError(e); }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "companies:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { id } = await params;

    if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(id)) {
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
      }
    }

    const body = await req.json();
    const parsed = companyUpdateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const { name, notes, is_active, responsible_id, sort_mode, phone, email, address, tax_id, tax_office, contract_start, contract_end, sector, website } = parsed.data;
    const db = getDb();
    const now = nowIso();
    await db.prepare(
      `UPDATE companies SET name = ?, notes = ?, is_active = ?, responsible_id = ?, sort_mode = ?,
       phone = ?, email = ?, address = ?, tax_id = ?, tax_office = ?,
       contract_start = ?, contract_end = ?, sector = ?, website = ?,
       updated_at = ? WHERE id = ?`
    ).run(name, notes || null, is_active ?? 1, responsible_id ?? null, sort_mode ?? "manual",
      phone || null, email || null, address || null, tax_id || null, tax_office || null,
      contract_start || null, contract_end || null, sector || null, website || null,
      now, id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "companies:deactivate"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { id } = await params;

    if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(id)) {
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
      }
    }

    const db = getDb();
    const now = nowIso();
    await db.prepare("UPDATE companies SET is_active = 0, updated_at = ? WHERE id = ?").run(now, id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
