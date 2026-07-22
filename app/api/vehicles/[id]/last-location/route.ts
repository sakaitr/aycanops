import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { hasPermission } from "@/lib/permissions";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "map:live")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    const row = await db.prepare(
      `SELECT vll.*, v.plate AS vehicle_plate, v.driver_name, v.driver_phone
       FROM vehicle_last_locations vll
       LEFT JOIN vehicles v ON v.id = vll.vehicle_id
       WHERE vll.vehicle_id = ?
       LIMIT 1`
    ).get(id);

    return NextResponse.json({ ok: true, data: row || null });
  } catch (e) {
    return apiError(e);
  }
}
