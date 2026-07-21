import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { finansFisSchema } from "@/lib/schemas";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_fis:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const tip = searchParams.get("tip");
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (tip) { conditions.push("fs.tip = ?"); params.push(tip); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await getDb().prepare(
      `SELECT fs.*, kb.ad AS kasa_banka_hesabi_ad, kh.ad AS karsi_hesap_ad
       FROM finans_fis fs
       LEFT JOIN finans_kasa_banka_hesabi kb ON kb.id = fs.kasa_banka_hesabi_id
       LEFT JOIN finans_kasa_banka_hesabi kh ON kh.id = fs.karsi_hesap_id
       ${where}
       ORDER BY fs.tarih DESC, fs.created_at DESC`
    ).all(...params);
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_fis:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const raw = await req.json();
    const parsed = finansFisSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const d = parsed.data;

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();
    await db.prepare(
      `INSERT INTO finans_fis
         (id, tip, tarih, tutar, kasa_banka_hesabi_id, karsi_hesap_id, belge_id, aciklama, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, d.tip, d.tarih, d.tutar,
      d.kasa_banka_hesabi_id || null, d.karsi_hesap_id || null, d.belge_id || null,
      d.aciklama || null, user.id, now, now
    );

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
