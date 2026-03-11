import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isAtLeast } from "@/lib/permissions";
import { nowIso } from "@/lib/time";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    const { id } = await params;
    const db = getDb();
    const route = await db.prepare(
      `SELECT r.*, v.plate as vehicle_plate, v.driver_name FROM routes r LEFT JOIN vehicles v ON v.id = r.vehicle_id WHERE r.id = ?`
    ).get(id);
    if (!route) return NextResponse.json({ ok: false, error: "Güzergah bulunamadı" }, { status: 404 });
    return NextResponse.json({ ok: true, data: route });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!isAtLeast(user.role, "yetkili"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const now = nowIso();
    const fields = ["name", "code", "direction", "morning_departure", "morning_arrival", "evening_departure", "evening_arrival", "vehicle_id", "is_active", "notes"];
    const sets = fields.filter(f => body[f] !== undefined).map(f => `${f} = ?`);
    const vals = fields.filter(f => body[f] !== undefined).map(f => body[f]);
    if (body.stops_json !== undefined) { sets.push("stops_json = ?"); vals.push(JSON.stringify(body.stops_json)); }
    await db.prepare(`UPDATE routes SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`).run(...vals, now, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
