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
    if (!hasPermission(user, "gps_devices:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const vehicle_id = searchParams.get("vehicle_id") || "";
    const is_active = searchParams.get("is_active");
    const limit = Math.min(500, parseInt(searchParams.get("limit") || "100"));

    const db = getDb();
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (vehicle_id) { conditions.push("g.vehicle_id = ?"); params.push(vehicle_id); }
    if (is_active !== null && is_active !== "") { conditions.push("g.is_active = ?"); params.push(is_active === "1" ? 1 : 0); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await db.prepare(
      `SELECT g.*, v.plate
       FROM gps_cihazlari g
       LEFT JOIN vehicles v ON v.id = g.vehicle_id
       ${where}
       ORDER BY g.created_at DESC
       LIMIT ?`
    ).all(...params, limit);

    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "gps_devices:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    if (!body.imei?.trim()) return NextResponse.json({ ok: false, error: "IMEI zorunludur" }, { status: 400 });

    const db = getDb();
    const existing = await db.prepare("SELECT id FROM gps_cihazlari WHERE imei = ?").get(body.imei.trim());
    if (existing) return NextResponse.json({ ok: false, error: "Bu IMEI zaten kayıtlı" }, { status: 409 });

    const id = uuidv4();
    const now = nowIso();
    await db.prepare(
      `INSERT INTO gps_cihazlari
         (id, gps_saglayici, gps_id, gsm_no, imei, vehicle_id, atama_tarihi, atama_turu, notlar, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id, body.gps_saglayici || null, body.gps_id || null, body.gsm_no || null, body.imei.trim(),
      body.vehicle_id || null, body.atama_tarihi || null, body.atama_turu || "kalici", body.notlar || null,
      user.id, now, now,
    );

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
