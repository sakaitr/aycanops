import { NextRequest, NextResponse } from "next/server";
import { requirePortalUser } from "@/lib/portal-auth";
import { getDb } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";

export async function GET(req: NextRequest) {
  try {
    const portalUser = await requirePortalUser();
    if (!portalUser) {
      return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = 20;
    const offset = (page - 1) * limit;
    const durumFilter = searchParams.get("durum") || "";

    const db = getDb();
    let sql = `
      SELECT pt.*, cu.full_name as olusturan
      FROM portal_tickets pt
      JOIN customer_users cu ON cu.id = pt.customer_user_id
      WHERE pt.company_id = ?`;
    const params: unknown[] = [portalUser.company_id];

    if (durumFilter) {
      sql += " AND pt.durum = ?";
      params.push(durumFilter);
    }

    const countRow = await db
      .prepare(`SELECT COUNT(*) as total FROM (${sql}) _t`)
      .get<{ total: number }>(...params);

    sql += " ORDER BY pt.created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const data = await db.prepare(sql).all<any>(...params);
    return NextResponse.json({
      ok: true,
      data,
      meta: { total: countRow?.total ?? 0, page, limit },
    });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const portalUser = await requirePortalUser();
    if (!portalUser) {
      return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    }

    const { konu, icerik, oncelik } = await req.json();
    if (!konu?.trim() || !icerik?.trim()) {
      return NextResponse.json(
        { ok: false, error: "Konu ve içerik zorunludur" },
        { status: 400 }
      );
    }

    const validPriorities = ["dusuk", "normal", "yuksek", "kritik"];
    const oncelikVal = validPriorities.includes(oncelik) ? oncelik : "normal";

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();
    await db
      .prepare(
        `INSERT INTO portal_tickets (id, company_id, customer_user_id, konu, icerik, durum, oncelik, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'acik', ?, ?, ?)`
      )
      .run(id, portalUser.company_id, portalUser.id, konu.trim(), icerik.trim(), oncelikVal, now, now);

    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return apiError(e);
  }
}
