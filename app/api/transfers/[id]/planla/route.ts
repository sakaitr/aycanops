import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "transfers:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const { vehicle_id, driver_id, driver_name, driver_phone } = body;

    if (!vehicle_id) return NextResponse.json({ ok: false, error: "Araç seçimi zorunludur" }, { status: 400 });

    const db = getDb();
    const transfer = await db.prepare("SELECT status FROM transfers WHERE id = ?").get(id) as any;
    if (!transfer) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });
    if (transfer.status !== "istek")
      return NextResponse.json({ ok: false, error: "Sadece 'istek' durumundaki transferler planlanabilir" }, { status: 409 });

    const now = nowIso();
    await db.prepare(
      `UPDATE transfers SET
         status = 'planlandı',
         vehicle_id = ?,
         driver_id = ?,
         driver_name = ?,
         driver_phone = ?,
         planned_at = ?,
         planned_by = ?
       WHERE id = ?`
    ).run(
      vehicle_id,
      driver_id || null,
      driver_name || null,
      driver_phone || null,
      now,
      user.id,
      id
    );

    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
