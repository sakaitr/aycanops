import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { vehicleUpdateSchema } from "@/lib/schemas";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "vehicles:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { id } = await params;
    const db = getDb();
    const vehicle = await db.prepare(
      `SELECT v.*, u.full_name as creator_name FROM vehicles v
       LEFT JOIN users u ON u.id = v.created_by WHERE v.id = ?`
    ).get(id);
    if (!vehicle) return NextResponse.json({ ok: false, error: "Araç bulunamadı" }, { status: 404 });
    return NextResponse.json({ ok: true, data: vehicle });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "vehicles:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { id } = await params;
    const raw = await req.json();
    const parsed = vehicleUpdateSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const body = parsed.data;
    const db = getDb();
    const now = nowIso();

    // Fetch current vehicle to compare driver_id
    const current = await db.prepare(`SELECT driver_id FROM vehicles WHERE id = ?`).get(id) as { driver_id: string | null } | undefined;
    if (!current) return NextResponse.json({ ok: false, error: "Araç bulunamadı" }, { status: 404 });

    const fields = ["plate", "type", "capacity", "brand", "model", "year", "driver_id", "driver_name", "driver_phone", "route_name", "status_code", "notes", "ruhsat_sahibi_id"] as const;
    const sets = fields.filter(f => body[f] !== undefined).map(f => `${f} = ?`);
    const vals = fields.filter(f => body[f] !== undefined).map(f => {
      const v = body[f];
      // Normalize empty strings to NULL for FK/optional fields
      if (f === "driver_id" || f === "ruhsat_sahibi_id") return v || null;
      return v;
    });
    if (sets.length === 0) return NextResponse.json({ ok: false, error: "Güncellenecek alan yok" }, { status: 400 });
    await db.prepare(`UPDATE vehicles SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`).run(...vals, now, id);

    // Handle driver_assignments when driver_id changes
    if (body.driver_id !== undefined) {
      const newDriverId = body.driver_id || null;
      const oldDriverId = current.driver_id || null;
      if (newDriverId !== oldDriverId) {
        // Close previous assignment if any
        if (oldDriverId) {
          await db.prepare(
            `UPDATE driver_assignments SET unassigned_at = ? WHERE vehicle_id = ? AND driver_id = ? AND unassigned_at IS NULL`
          ).run(now, id, oldDriverId);
        }
        // Create new assignment if driver selected
        if (newDriverId) {
          await db.prepare(
            `INSERT INTO driver_assignments (vehicle_id, driver_id, assigned_at, created_by) VALUES (?, ?, ?, ?)`
          ).run(id, newDriverId, now, user.id);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "vehicles:deactivate"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { id } = await params;
    const db = getDb();
    await db.prepare("DELETE FROM vehicles WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
