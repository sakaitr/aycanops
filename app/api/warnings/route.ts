import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { nowIso } from "@/lib/time";
import { nextWarningNo } from "@/lib/warningNo";
import { warningCreateSchema } from "@/lib/schemas";
import { sendWhatsAppToUser } from "@/lib/whatsapp";
import { apiError } from "@/lib/api-error";
import { hasPermission } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "warnings:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const db = getDb();
    const { searchParams } = new URL(req.url);
    const plate      = searchParams.get("plate");
    const driver     = searchParams.get("driver");
    const is_done    = searchParams.get("is_done");
    const page       = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit      = Math.min(9999, Math.max(1, parseInt(searchParams.get("limit") || "100")));
    const offset     = (page - 1) * limit;

    let sql = `SELECT w.*, u.full_name as creator_name
               FROM warnings w
               LEFT JOIN users u ON u.id = w.created_by
               WHERE 1=1`;
    const params: unknown[] = [];

    if (plate)    { sql += " AND w.plate LIKE ?";       params.push(`%${plate}%`); }
    if (driver)   { sql += " AND w.driver_name LIKE ?"; params.push(`%${driver}%`); }
    if (is_done !== null && is_done !== "") {
      sql += " AND w.is_done = ?";
      params.push(is_done === "1" ? 1 : 0);
    }

    const countRow = await db.prepare(`SELECT COUNT(*) as total FROM (${sql}) _t`).get(...params) as { total: number };
    const total = countRow.total;

    sql += " ORDER BY w.created_at DESC LIMIT ? OFFSET ?";
    const rows = await db.prepare(sql).all(...params, limit, offset);

    return NextResponse.json({ ok: true, data: rows, meta: { total, page, limit } });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "warnings:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    const parsed = warningCreateSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { plate, driver_name, reason, deadline } = parsed.data;
    const db    = getDb();
    const now   = nowIso();
    const id    = uuidv4();
    const warningNo = await nextWarningNo();

    await db.prepare(
      `INSERT INTO warnings (id, warning_no, plate, driver_name, reason, deadline, is_done, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
    ).run(id, warningNo, plate.trim().toUpperCase(), driver_name.trim(), reason.trim(), deadline || null, user.id, now, now);

    // Son 7 gün içinde aynı plaka veya şöföre kaç uyarı var kontrol et
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const plateCount = await db.prepare(
      "SELECT COUNT(*) as cnt FROM warnings WHERE plate = ? AND created_at >= ? AND id != ?"
    ).get(plate.trim().toUpperCase(), sevenDaysAgo, id) as { cnt: number };
    const driverCount = await db.prepare(
      "SELECT COUNT(*) as cnt FROM warnings WHERE driver_name = ? AND created_at >= ? AND id != ?"
    ).get(driver_name.trim(), sevenDaysAgo, id) as { cnt: number };

    const duplicateAlert = {
      plate:  (plateCount?.cnt ?? 0) >= 1 ? plateCount.cnt : 0,
      driver: (driverCount?.cnt ?? 0) >= 1 ? driverCount.cnt : 0,
    };

    // Notify all admin users about the new warning
    const admins = await db.prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1").all() as { id: string }[];
    for (const admin of admins) {
      sendWhatsAppToUser(admin.id, {
        title: `⚠️ Yeni Uyarı: ${plate.trim().toUpperCase()}`,
        body: `Söför: ${driver_name.trim()} | No: ${warningNo}`,
        url: "/admin/uyarilar",
      }).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      data: { id, warning_no: warningNo },
      duplicateAlert: (duplicateAlert.plate > 0 || duplicateAlert.driver > 0) ? duplicateAlert : null,
    }, { status: 201 });
  } catch (e) { return apiError(e); }
}
