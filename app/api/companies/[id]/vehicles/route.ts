import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isAtLeast } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { companyVehicleCreateSchema } from "@/lib/schemas";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    const { id } = await params;
    const db = getDb();
    const data = await db.prepare(
      "SELECT * FROM company_vehicles WHERE company_id = ? AND is_active = 1 ORDER BY plate ASC"
    ).all(id);
    return NextResponse.json({ ok: true, data });
  } catch {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    const { id } = await params;
    const raw = await req.json();
    const parsed = companyVehicleCreateSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const { plate, notes, driver_name } = parsed.data;
    const db = getDb();
    const now = nowIso();
    const vid = uuidv4();
    await db.prepare(
      "INSERT INTO company_vehicles (id, company_id, plate, driver_name, notes, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)"
    ).run(vid, id, plate.trim().toUpperCase(), driver_name?.trim() || null, notes || null, now, now);
    return NextResponse.json({ ok: true, data: { id: vid } });
  } catch (e: any) {
    if (e?.message?.includes("UNIQUE")) return NextResponse.json({ ok: false, error: "Bu plaka bu firmada zaten kayıtlı" }, { status: 409 });
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!isAtLeast(user.role, "yonetici"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { id } = await params;
    const url = new URL(req.url);
    const vehicleId = url.searchParams.get("vehicleId");
    if (!vehicleId) return NextResponse.json({ ok: false, error: "vehicleId gerekli" }, { status: 400 });
    const { plate, driver_name, notes } = await req.json();
    if (!plate?.trim()) return NextResponse.json({ ok: false, error: "Plaka zorunlu" }, { status: 400 });
    const db = getDb();
    const now = nowIso();
    const result = await db.prepare(
      "UPDATE company_vehicles SET plate = ?, driver_name = ?, notes = ?, updated_at = ? WHERE id = ? AND company_id = ?"
    ).run(plate.trim().toUpperCase(), driver_name?.trim() || null, notes?.trim() || null, now, vehicleId, id);
    if (result.affectedRows === 0) return NextResponse.json({ ok: false, error: "Araç bulunamadı" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message?.includes("UNIQUE")) return NextResponse.json({ ok: false, error: "Bu plaka bu firmada zaten kayıtlı" }, { status: 409 });
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!isAtLeast(user.role, "yonetici"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { id } = await params;
    const url = new URL(req.url);
    const vehicleId = url.searchParams.get("vehicleId");
    if (!vehicleId) return NextResponse.json({ ok: false, error: "vehicleId gerekli" }, { status: 400 });
    const db = getDb();
    const now = nowIso();
    const result = await db.prepare("UPDATE company_vehicles SET is_active = 0, updated_at = ? WHERE id = ? AND company_id = ?").run(now, vehicleId, id);
    if (result.affectedRows === 0) return NextResponse.json({ ok: false, error: "Araç bulunamadı" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
