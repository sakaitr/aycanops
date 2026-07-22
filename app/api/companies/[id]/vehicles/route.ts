import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso, todayIstanbul } from "@/lib/time";
import { companyVehicleCreateSchema } from "@/lib/schemas";
import { apiError } from "@/lib/api-error";

async function canManageCompanyVehicles(user: { id: string; role: any }, companyId: string, db: ReturnType<typeof getDb>) {
  if (hasPermission(user, "companies:update")) return true;
  if (!hasPermission(user, "vehicles:update")) return false;
  const cr = await db.prepare("SELECT id FROM company_responsible WHERE company_id = ? AND user_id = ?").get(companyId, user.id);
  return Boolean(cr);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "arrivals:read")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { id } = await params;

    if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(id)) {
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
      }
    }

    const db = getDb();
    const data = await db.prepare(
      "SELECT cv.* FROM company_vehicles cv WHERE cv.company_id = ? AND cv.is_active = 1 ORDER BY cv.sort_order ASC, cv.plate ASC"
    ).all(id);
    return NextResponse.json({ ok: true, data });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "companies:update")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { id } = await params;
    const raw = await req.json();
    const parsed = companyVehicleCreateSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const { plate, notes, driver_name, route_name, route_id, sort_order, is_temporary } = parsed.data;
    const db = getDb();
    const now = nowIso();
    const vid = uuidv4();
    // Determine sort_order: use provided value or place at end
    let finalSortOrder = sort_order ?? 0;
    if (sort_order == null) {
      const maxRow: any = await db.prepare(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM company_vehicles WHERE company_id = ? AND is_active = 1"
      ).get(id);
      finalSortOrder = maxRow?.next_order ?? 0;
    }
    // Aynı firmada aynı plaka var mı kontrol et
    const normalizedPlate = plate.trim().toUpperCase();
    const existing: any = await db.prepare(
      "SELECT id, is_active, is_temporary, vehicle_id FROM company_vehicles WHERE company_id = ? AND plate = ?"
    ).get(id, normalizedPlate);
    if (existing) {
      if (existing.is_active) {
        if (existing.is_temporary) {
          let vId = existing.vehicle_id || null;
          if (!vId) {
            const evehicle: any = await db.prepare("SELECT id FROM vehicles WHERE plate = ?").get(normalizedPlate);
            if (evehicle) {
              vId = evehicle.id;
            } else {
              vId = uuidv4();
              await db.prepare(
                "INSERT INTO vehicles (id, plate, type, capacity, driver_name, status_code, created_by, created_at, updated_at) VALUES (?, ?, 'minibus', 14, ?, 'active', ?, ?, ?)"
              ).run(vId, normalizedPlate, driver_name?.trim() || null, user.id, now, now);
            }
          }
          if (driver_name?.trim()) {
            await db.prepare("UPDATE vehicles SET driver_name = ?, updated_at = ? WHERE id = ?").run(driver_name.trim(), now, vId);
          }
          await db.prepare(
            "UPDATE company_vehicles SET is_temporary = 0, added_date = NULL, driver_name = COALESCE(?, driver_name), route_name = COALESCE(?, route_name), route_id = COALESCE(?, route_id), notes = COALESCE(?, notes), vehicle_id = COALESCE(vehicle_id, ?), updated_at = ? WHERE id = ?"
          ).run(driver_name?.trim() || null, route_name?.trim() || null, route_id || null, notes || null, vId, now, existing.id);
          return NextResponse.json({ ok: true, data: { id: existing.id, vehicle_id: vId, converted_to_permanent: true } });
        }
        return NextResponse.json({ ok: false, error: "Bu plaka bu firmada zaten kayıtlı" }, { status: 409 });
      }
      // Pasifse aktifleştir — ayrıca vehicle_id backfill yap
      const evehicle: any = await db.prepare("SELECT id FROM vehicles WHERE plate = ?").get(normalizedPlate);
      const vId = evehicle?.id || null;
      await db.prepare(
        "UPDATE company_vehicles SET is_active = 1, is_temporary = 0, added_date = NULL, driver_name = ?, route_name = ?, route_id = COALESCE(?, route_id), notes = ?, vehicle_id = COALESCE(vehicle_id, ?), updated_at = ? WHERE id = ?"
      ).run(driver_name?.trim() || null, route_name?.trim() || null, route_id || null, notes || null, vId, now, existing.id);
      return NextResponse.json({ ok: true, data: { id: existing.id } });
    }

    const isTemp = is_temporary ? 1 : 0;
    const addedDate = is_temporary ? todayIstanbul() : null;

    // Merkezi vehicles tablosuna upsert — plaka zaten varsa vehicle_id al, yoksa oluştur
    let vehiclesId: string;
    const existingVehicle: any = await db.prepare("SELECT id FROM vehicles WHERE plate = ?").get(normalizedPlate);
    if (existingVehicle) {
      vehiclesId = existingVehicle.id;
      // Şöför bilgisi varsa güncelle
      if (driver_name?.trim()) {
        await db.prepare("UPDATE vehicles SET driver_name = ?, updated_at = ? WHERE id = ?").run(driver_name.trim(), now, vehiclesId);
      }
    } else {
      vehiclesId = uuidv4();
      await db.prepare(
        "INSERT INTO vehicles (id, plate, type, capacity, driver_name, status_code, created_by, created_at, updated_at) VALUES (?, ?, 'minibus', 14, ?, 'active', ?, ?, ?)"
      ).run(vehiclesId, normalizedPlate, driver_name?.trim() || null, user.id, now, now);
    }

    await db.prepare(
      "INSERT INTO company_vehicles (id, company_id, plate, driver_name, route_name, route_id, sort_order, notes, is_temporary, added_date, vehicle_id, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)"
    ).run(vid, id, normalizedPlate, driver_name?.trim() || null, route_name?.trim() || null, route_id || null, finalSortOrder, notes || null, isTemp, addedDate, vehiclesId, now, now);
    return NextResponse.json({ ok: true, data: { id: vid, vehicle_id: vehiclesId } });
  } catch (e) { return apiError(e); }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    const { id } = await params;
    const db = getDb();
    if (!(await canManageCompanyVehicles(user, id, db))) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const url = new URL(req.url);
    const vehicleId = url.searchParams.get("vehicleId");
    if (!vehicleId) return NextResponse.json({ ok: false, error: "vehicleId gerekli" }, { status: 400 });
    const { plate, driver_name, notes, route_name, route_id, is_temporary } = await req.json();
    if (!plate?.trim()) return NextResponse.json({ ok: false, error: "Plaka zorunlu" }, { status: 400 });
    const now = nowIso();
    const isTemp = is_temporary ? 1 : 0;
    const addedDate = is_temporary ? (await db.prepare("SELECT added_date FROM company_vehicles WHERE id = ?").get(vehicleId) as any)?.added_date || nowIso().slice(0, 10) : null;
    const result = await db.prepare(
      "UPDATE company_vehicles SET plate = ?, driver_name = ?, route_name = ?, route_id = ?, notes = ?, is_temporary = ?, added_date = ?, updated_at = ? WHERE id = ? AND company_id = ?"
    ).run(plate.trim().toUpperCase(), driver_name?.trim() || null, route_name?.trim() || null, route_id || null, notes?.trim() || null, isTemp, addedDate, now, vehicleId, id);
    if (result.affectedRows === 0) return NextResponse.json({ ok: false, error: "Araç bulunamadı" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "arrivals:update")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { id } = await params;
    const body = await req.json();
    // body: [{ id: string, sort_order: number }]
    if (!Array.isArray(body)) return NextResponse.json({ ok: false, error: "Dizi bekleniyor" }, { status: 400 });
    const db = getDb();
    const now = nowIso();
    for (const item of body) {
      if (typeof item.id !== "string" || typeof item.sort_order !== "number") continue;
      await db.prepare(
        "UPDATE company_vehicles SET sort_order = ?, updated_at = ? WHERE id = ? AND company_id = ?"
      ).run(item.sort_order, now, item.id, id);
    }
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    const { id } = await params;
    const db = getDb();
    if (!(await canManageCompanyVehicles(user, id, db))) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const url = new URL(req.url);
    const vehicleId = url.searchParams.get("vehicleId");
    const hard = url.searchParams.get("hard") === "true";
    if (!vehicleId) return NextResponse.json({ ok: false, error: "vehicleId gerekli" }, { status: 400 });
    const now = nowIso();

    if (hard) {
      // Kalıcı silme yalnızca yonetici+ için
      if (!hasPermission(user, "vehicles:deactivate"))
        return NextResponse.json({ ok: false, error: "Kalıcı silmek için yönetici yetkisi gerekli" }, { status: 403 });
      const cvRow: any = await db.prepare("SELECT vehicle_id, plate FROM company_vehicles WHERE id = ? AND company_id = ?").get(vehicleId, id);
      if (!cvRow) return NextResponse.json({ ok: false, error: "Araç bulunamadı" }, { status: 404 });
      await db.prepare("DELETE FROM company_vehicles WHERE id = ? AND company_id = ?").run(vehicleId, id);
      if (cvRow.vehicle_id) {
        const otherRefs: any = await db.prepare("SELECT COUNT(*) as cnt FROM company_vehicles WHERE vehicle_id = ?").get(cvRow.vehicle_id);
        if ((otherRefs?.cnt ?? 0) === 0) {
          await db.prepare("DELETE FROM driver_assignments WHERE vehicle_id = ?").run(cvRow.vehicle_id);
          await db.prepare("DELETE FROM vehicle_documents WHERE vehicle_id = ?").run(cvRow.vehicle_id);
          await db.prepare("DELETE FROM vehicle_maintenance WHERE vehicle_id = ?").run(cvRow.vehicle_id);
          await db.prepare("DELETE FROM vehicles WHERE id = ?").run(cvRow.vehicle_id);
        }
      }
    } else {
      const result = await db.prepare("UPDATE company_vehicles SET is_active = 0, updated_at = ? WHERE id = ? AND company_id = ?").run(now, vehicleId, id);
      if (result.affectedRows === 0) return NextResponse.json({ ok: false, error: "Araç bulunamadı" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
