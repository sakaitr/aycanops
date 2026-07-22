import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { supplierVehicleCreateSchema } from "@/lib/schemas";

function normalizePlate(plate: string) {
  return plate.replace(/\s+/g, " ").trim().toLocaleUpperCase("tr-TR");
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "route_suppliers:read")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { id } = await params;
    const rows = await getDb().prepare("SELECT * FROM vehicles WHERE supplier_id = ? ORDER BY plate ASC").all(id);
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "route_suppliers:update")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { id: supplierId } = await params;
    const parsed = supplierVehicleCreateSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const data = parsed.data;
    const db = getDb();
    const supplier = await db.prepare("SELECT id FROM suppliers WHERE id = ? AND is_active = 1 LIMIT 1").get(supplierId);
    if (!supplier) return NextResponse.json({ ok: false, error: "Aktif tedarikçi bulunamadı" }, { status: 404 });
    const plate = normalizePlate(data.plate);
    const now = nowIso();
    const existing = await db.prepare("SELECT id, supplier_id FROM vehicles WHERE plate = ? LIMIT 1").get(plate) as { id: string; supplier_id: string | null } | undefined;
    if (existing?.supplier_id && existing.supplier_id !== supplierId) {
      return NextResponse.json({ ok: false, error: "Bu plaka başka bir tedarikçiye bağlı" }, { status: 409 });
    }
    if (existing) {
      await db.prepare(
        `UPDATE vehicles SET supplier_id=?, type=COALESCE(?, type), capacity=COALESCE(?, capacity), brand=COALESCE(?, brand), model=COALESCE(?, model), year=COALESCE(?, year), driver_name=COALESCE(?, driver_name), driver_phone=COALESCE(?, driver_phone), status_code=COALESCE(?, status_code), notes=COALESCE(?, notes), updated_at=? WHERE id=?`
      ).run(supplierId, data.type || null, data.capacity ?? null, data.brand || null, data.model || null, data.year ?? null, data.driver_name || null, data.driver_phone || null, data.status_code || null, data.notes || null, now, existing.id);
      return NextResponse.json({ ok: true, data: { id: existing.id, mode: "updated" } });
    }
    const vehicleId = uuidv4();
    await db.prepare(
      `INSERT INTO vehicles (id, supplier_id, plate, type, capacity, brand, model, year, driver_name, driver_phone, status_code, notes, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(vehicleId, supplierId, plate, data.type || "minibus", data.capacity || 14, data.brand || null, data.model || null, data.year || null, data.driver_name || null, data.driver_phone || null, data.status_code || "active", data.notes || null, user.id, now, now);
    return NextResponse.json({ ok: true, data: { id: vehicleId, mode: "inserted" } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
