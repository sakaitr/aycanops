import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { hasPermission } from "@/lib/permissions";

const STATUSES = ["istek", "planlandı", "yapılıyor", "tamamlandı"] as const;
const ALLOWED_FIELDS = ["status", "title", "company_id", "vehicle_id", "driver_name", "driver_phone",
  "pickup_location", "dropoff_location", "transfer_date", "transfer_time", "passenger_count", "notes"];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "transfers:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();

    const row = await db.prepare(
      `SELECT t.id, t.status, t.title, t.company_id, t.vehicle_id, t.driver_id,
         t.driver_name, t.driver_phone,
         t.pickup_location, t.dropoff_location,
         DATE_FORMAT(t.transfer_date, '%Y-%m-%d') AS transfer_date,
         t.transfer_time, t.passenger_count, t.notes,
         t.planned_at, t.started_at, t.completed_at, t.cancelled_at,
         t.planned_by, t.started_by, t.completed_by, t.cancelled_by,
         t.actual_passenger_count, t.completion_notes, t.cancellation_reason,
         t.created_by, t.created_at, t.updated_at,
         c.name AS company_name,
         v.plate AS vehicle_plate,
         d.name AS driver_full_name,
         pb.full_name AS planned_by_name,
         sb.full_name AS started_by_name,
         cb.full_name AS completed_by_name,
         xb.full_name AS cancelled_by_name,
         u.full_name AS creator_name
       FROM transfers t
       LEFT JOIN companies c ON c.id = t.company_id
       LEFT JOIN vehicles v ON v.id = t.vehicle_id
       LEFT JOIN drivers d ON d.id = t.driver_id
       LEFT JOIN users pb ON pb.id = t.planned_by
       LEFT JOIN users sb ON sb.id = t.started_by
       LEFT JOIN users cb ON cb.id = t.completed_by
       LEFT JOIN users xb ON xb.id = t.cancelled_by
       LEFT JOIN users u ON u.id = t.created_by
       WHERE t.id = ?`
    ).get(id);

    if (!row) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });
    return NextResponse.json({ ok: true, data: row });
  } catch (e) { return apiError(e); }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "transfers:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();

    const db = getDb();
    const sets: string[] = [];
    const vals: any[] = [];

    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        if (field === "status" && !STATUSES.includes(body.status)) continue;
        sets.push(`${field} = ?`);
        vals.push(body[field] ?? null);
      }
    }

    if (sets.length === 0) return NextResponse.json({ ok: false, error: "Değişiklik yok" }, { status: 400 });
    vals.push(id);

    await db.prepare(`UPDATE transfers SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "transfers:delete"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    await db.prepare("DELETE FROM transfers WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
