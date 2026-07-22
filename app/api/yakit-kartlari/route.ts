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
    if (!hasPermission(user, "fuel_cards:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const vehicle_id = searchParams.get("vehicle_id") || "";
    const isleten_id = searchParams.get("isleten_id") || "";
    const is_active = searchParams.get("is_active");
    const limit = Math.min(500, parseInt(searchParams.get("limit") || "100"));

    const db = getDb();
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (vehicle_id) { conditions.push("k.vehicle_id = ?"); params.push(vehicle_id); }
    if (isleten_id) { conditions.push("k.isleten_id = ?"); params.push(isleten_id); }
    if (is_active !== null && is_active !== "") { conditions.push("k.is_active = ?"); params.push(is_active === "1" ? 1 : 0); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await db.prepare(
      `SELECT k.*, v.plate, i.unvan AS isleten_unvan,
         (SELECT COUNT(*) FROM yakit_dolumlar d WHERE d.kart_id = k.id) AS dolum_sayisi
       FROM yakit_kartlari k
       LEFT JOIN vehicles v ON v.id = k.vehicle_id
       LEFT JOIN isleten i ON i.id = k.isleten_id
       ${where}
       ORDER BY k.created_at DESC
       LIMIT ?`
    ).all(...params, limit);

    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "fuel_cards:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    if (!body.kart_no?.trim()) return NextResponse.json({ ok: false, error: "Kart no zorunludur" }, { status: 400 });

    const db = getDb();
    const existing = await db.prepare("SELECT id FROM yakit_kartlari WHERE kart_no = ?").get(body.kart_no.trim());
    if (existing) return NextResponse.json({ ok: false, error: "Bu kart no zaten kayıtlı" }, { status: 409 });

    const id = uuidv4();
    const now = nowIso();
    await db.prepare(
      `INSERT INTO yakit_kartlari
         (id, kart_no, firma, vehicle_id, isleten_id, limit_turu, limit_degeri, kart_tipi, notlar, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id, body.kart_no.trim(), body.firma || "Diger", body.vehicle_id || null, body.isleten_id || null,
      body.limit_turu || "sinirsiz", body.limit_degeri || null, body.kart_tipi || "normal", body.notlar || null,
      user.id, now, now,
    );

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
