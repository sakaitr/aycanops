import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { v4 as uuidv4 } from "uuid";
import { nowIso, todayIstanbul } from "@/lib/time";
import { arrivalCreateSchema, arrivalNoteSchema } from "@/lib/schemas";
import { apiError } from "@/lib/api-error";
import { hasPermission } from "@/lib/permissions";

function previousDateString(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "arrivals:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const url = new URL(req.url);
    const company_id = url.searchParams.get("company_id");
    const date = url.searchParams.get("date") || todayIstanbul();
    const shift = url.searchParams.get("shift"); // optional filter
    if (!company_id) return NextResponse.json({ ok: false, error: "company_id gerekli" }, { status: 400 });

    // S-3: allowed_companies enforcement
    if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(company_id)) {
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
      }
    }

    const db = getDb();
    // All vehicles for this company + their arrival status for the given date
    const shiftClause = shift ? "AND va.shift = ?" : "";
    const shiftParam = shift ? [shift] : [];
    const previousDate = previousDateString(date);
    const previousShiftClause = shift ? "AND shift = ?" : "";
    const previousShiftParam = shift ? [shift] : [];
    const data = await db.prepare(`
      SELECT
        cv.id,
        cv.plate,
        cv.notes,
        cv.driver_name,
        cv.route_name,
        cv.route_id,
        cv.vehicle_id,
        cv.is_temporary,
        cv.added_date,
        cv.sort_order,
        va.id        AS arrival_id,
        va.shift     AS arrival_shift,
        va.arrived_at,
        va.latitude,
        va.longitude,
        va.note      AS arrival_note,
        prev.previous_arrived_at,
        u.full_name  AS recorded_by_name
      FROM company_vehicles cv
      LEFT JOIN vehicle_arrivals va ON va.vehicle_id = cv.id AND va.arrival_date = ? ${shiftClause}
      LEFT JOIN (
        SELECT vehicle_id, MIN(arrived_at) AS previous_arrived_at
        FROM vehicle_arrivals
        WHERE company_id = ? AND arrival_date = ? ${previousShiftClause}
        GROUP BY vehicle_id
      ) prev ON prev.vehicle_id = cv.id
      LEFT JOIN users u ON u.id = va.recorded_by
      WHERE cv.company_id = ? AND cv.is_active = 1
        AND (COALESCE(cv.is_temporary, 0) = 0 OR cv.added_date = ?)
      ORDER BY
        CASE WHEN prev.previous_arrived_at IS NULL THEN 1 ELSE 0 END ASC,
        prev.previous_arrived_at ASC,
        cv.sort_order ASC,
        cv.plate ASC
    `).all(date, ...shiftParam, company_id, previousDate, ...previousShiftParam, company_id, date);

    return NextResponse.json({ ok: true, data });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "arrivals:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const raw = await req.json();
    const parsed = arrivalCreateSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const { vehicle_id, company_id, date, shift, latitude, longitude, note } = parsed.data;
    if (!vehicle_id || !company_id || !date)
      return NextResponse.json({ ok: false, error: "vehicle_id, company_id ve date zorunlu" }, { status: 400 });

    const db = getDb();

    // S-4: verify vehicle belongs to company
    const vehicleCheck = await db.prepare(`
      SELECT cv.id
      FROM company_vehicles cv
      WHERE cv.id = ? AND cv.company_id = ? AND cv.is_active = 1
        AND (COALESCE(cv.is_temporary, 0) = 0 OR cv.added_date = ?)
    `).get(vehicle_id, company_id, date);
    if (!vehicleCheck) {
      return NextResponse.json({ ok: false, error: "Bu araç bu firmaya ait değil veya seçili tarihte geçerli değil" }, { status: 400 });
    }

    // S-3: allowed_companies enforcement
    if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(company_id as string)) {
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
      }
    }

    const now = nowIso();
    const id = uuidv4();

    await db.prepare(`
      INSERT INTO vehicle_arrivals (id, company_id, vehicle_id, arrival_date, shift, arrived_at, recorded_by, latitude, longitude, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, company_id, vehicle_id, date, shift, now, user.id, latitude ?? null, longitude ?? null, note ?? null, now);

    return NextResponse.json({ ok: true, data: { id, arrived_at: now } });
  } catch (e) { return apiError(e); }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "arrivals:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "id gerekli" }, { status: 400 });

    const raw = await req.json();
    const parsed = arrivalNoteSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });

    const db = getDb();
    // Verify the arrival belongs to a company the user has access to
    const arrival = await db.prepare("SELECT id, company_id FROM vehicle_arrivals WHERE id = ?").get(id) as any;
    if (!arrival) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(arrival.company_id)) {
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
      }
    }

    await db.prepare("UPDATE vehicle_arrivals SET note = ? WHERE id = ?").run(parsed.data.note, id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "arrivals:delete"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "id gerekli" }, { status: 400 });
    const db = getDb();
    await db.prepare("DELETE FROM vehicle_arrivals WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
