import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { aracIsBasvuruSchema } from "@/lib/schemas";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "arac_is_basvuru:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const durum = searchParams.get("durum");
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (durum) { conditions.push("durum = ?"); params.push(durum); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await getDb().prepare(
      `SELECT b.*, u.full_name AS created_by_ad FROM arac_is_basvuru b
       LEFT JOIN users u ON u.id = b.created_by
       ${where} ORDER BY b.created_at DESC LIMIT 1000`
    ).all(...params);
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "arac_is_basvuru:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const raw = await req.json();
    const parsed = aracIsBasvuruSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const d = parsed.data;

    if (!d.plaka && !d.sofor_adi) {
      return NextResponse.json({ ok: false, error: "Plaka veya şoför adı girilmeli" }, { status: 400 });
    }

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();
    await db.prepare(
      `INSERT INTO arac_is_basvuru
         (id, plaka, sofor_adi, telefon, semt, bos_saat, uygun_guzergahlar, notlar, durum, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id, d.plaka || null, d.sofor_adi || null, d.telefon || null, d.semt || null,
      d.bos_saat || null, d.uygun_guzergahlar || null, d.notlar || null, d.durum || "yeni",
      user.id, now, now
    );

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
