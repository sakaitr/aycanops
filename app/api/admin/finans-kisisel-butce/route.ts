import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_kisisel_butce:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const ay = searchParams.get("ay");
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (ay) { conditions.push("b.ay = ?"); params.push(ay); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const db = getDb();
    const rows = await db.prepare(
      `SELECT b.*, u.full_name AS user_ad,
              COALESCE((
                SELECT SUM(g.tutar) FROM finans_gider g
                WHERE g.created_by = b.user_id
                  AND g.durum <> 'taslak'
                  AND SUBSTRING(g.tarih, 1, 7) = b.ay
              ), 0) AS harcanan
       FROM finans_kisisel_butce b
       JOIN users u ON u.id = b.user_id
       ${where}
       ORDER BY b.ay DESC, u.full_name ASC`
    ).all(...params);

    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

// POST: upsert — aynı user_id+ay için tekrar gönderilirse tutarı günceller
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_kisisel_butce:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { user_id, ay, tutar } = await req.json();
    if (!user_id || !/^\d{4}-\d{2}$/.test(ay || "") || typeof tutar !== "number" || tutar < 0) {
      return NextResponse.json({ ok: false, error: "user_id, ay (YYYY-MM) ve tutar gerekli" }, { status: 400 });
    }

    const db = getDb();
    const now = nowIso();
    await db.prepare(
      `INSERT INTO finans_kisisel_butce (id, user_id, ay, tutar, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE tutar = VALUES(tutar), updated_at = VALUES(updated_at)`
    ).run(uuidv4(), user_id, ay, tutar, now, now);

    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
