import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { logAudit } from "@/lib/audit";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "routes:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await request.json();
    const { name, company_id, route_id, vehicle_id, vehicle_assignment_status, plate_note, distance_km, duration_min, price, notes, status } = body;

    const db = getDb();
    const now = nowIso();

    const existing = await db.prepare("SELECT id, route_id, name FROM open_routes WHERE id = ?").get(id) as { id: string; route_id: string | null; name: string } | undefined;
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    const targetRouteId = route_id ?? existing.route_id;
    await db.transaction(async (conn) => {
      await conn.execute(`
        UPDATE open_routes
        SET name = COALESCE(?, name),
            company_id = COALESCE(?, company_id),
            route_id = COALESCE(?, route_id),
            supplier_id = NULL,
            vehicle_id = COALESCE(?, vehicle_id),
            vehicle_assignment_status = COALESCE(?, vehicle_assignment_status),
            plate_note = COALESCE(?, plate_note),
            distance_km = COALESCE(?, distance_km),
            duration_min = COALESCE(?, duration_min),
            price = COALESCE(?, price),
            notes = COALESCE(?, notes),
            status = COALESCE(?, status),
            closed_at = CASE WHEN ? = 'closed' THEN ? ELSE closed_at END,
            updated_at = ?
        WHERE id = ?
      `, [
        name || null, company_id || null, targetRouteId || null,
        vehicle_id ?? null, vehicle_assignment_status || null, plate_note || null,
        distance_km ?? null, duration_min ?? null, price ?? null, notes ?? null,
        status || null, status, status === "closed" ? now : null, now, id,
      ]);

      if (targetRouteId) {
        if (status === "closed" && vehicle_id) {
          await conn.execute(
            "UPDATE routes SET supplier_id=NULL, vehicle_id=?, vehicle_assignment_status='fixed', updated_at=? WHERE id=?",
            [vehicle_id, now, targetRouteId]
          );
        } else if (vehicle_assignment_status === "temporary" || vehicle_assignment_status === "searching") {
          await conn.execute(
            "UPDATE routes SET supplier_id=NULL, vehicle_id=?, vehicle_assignment_status=?, updated_at=? WHERE id=?",
            [vehicle_id || null, vehicle_assignment_status, now, targetRouteId]
          );
        }
      }
    });

    await logAudit({
      actorUserId: user.id,
      action: "open_route.update",
      entityType: "open_routes",
      entityId: id,
      details: { status, route_id: targetRouteId, vehicle_id, vehicle_assignment_status },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[open-routes PUT]", e);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "routes:delete"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    await db.prepare("DELETE FROM open_routes WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[open-routes DELETE]", e);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
