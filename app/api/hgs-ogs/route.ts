import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "hgs_ogs:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const vehicle_id = searchParams.get("vehicle_id") || "";
    const isleten_id = searchParams.get("isleten_id") || "";
    const is_active = searchParams.get("is_active");
    const limit = Math.min(500, parseInt(searchParams.get("limit") || "100"));

    const db = getDb();
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (vehicle_id) { conditions.push("h.vehicle_id = ?"); params.push(vehicle_id); }
    if (isleten_id) { conditions.push("h.isleten_id = ?"); params.push(isleten_id); }
    if (is_active !== null && is_active !== "") { conditions.push("h.is_active = ?"); params.push(is_active === "1" ? 1 : 0); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await db.prepare(
      `SELECT h.*, v.plate, i.unvan AS isleten_unvan
       FROM hgs_ogs h
       LEFT JOIN vehicles v ON v.id = h.vehicle_id
       LEFT JOIN isleten i ON i.id = h.isleten_id
       ${where}
       ORDER BY h.created_at DESC
       LIMIT ?`
    ).all(...params, limit);

    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "hgs_ogs:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    if (!body.etiket_no?.trim()) return NextResponse.json({ ok: false, error: "Etiket no zorunludur" }, { status: 400 });

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();
    await db.prepare(
      `INSERT INTO hgs_ogs
         (id, cinsi, musteri_no, vehicle_id, isleten_id, etiket_no, banka, bakiye, hesap_acilis_tarihi, notlar, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id, body.cinsi || "HGS", body.musteri_no || null, body.vehicle_id || null, body.isleten_id || null,
      body.etiket_no.trim(), body.banka || null, body.bakiye || 0, body.hesap_acilis_tarihi || null, body.notlar || null,
      user.id, now, now,
    );

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
