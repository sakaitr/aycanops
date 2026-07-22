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
    if (!hasPermission(user, "passengers:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get("active") !== "0";

    const db = getDb();
    const rows = await db.prepare(
      `SELECT p.*, (SELECT COUNT(*) FROM passengers WHERE odeme_plani_id = p.id) AS yolcu_sayisi
       FROM odeme_planlari p
       ${activeOnly ? "WHERE is_active = 1" : ""}
       ORDER BY p.plan_adi ASC`
    ).all();

    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "passengers:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    const planAdi = (body.plan_adi || "").trim();
    if (!planAdi) return NextResponse.json({ ok: false, error: "Plan adı zorunludur" }, { status: 400 });

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();

    await db.prepare(
      `INSERT INTO odeme_planlari (id, plan_adi, toplam_tutar, taksit_sayisi, aciklama, is_active, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(
      id, planAdi, body.toplam_tutar || null, body.taksit_sayisi || null,
      body.aciklama || null, 1, user.id, now, now,
    );

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
