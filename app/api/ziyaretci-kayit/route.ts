import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { ziyaretciKayitSchema } from "@/lib/schemas";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "ziyaretci_kaydi:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const aktif = searchParams.get("aktif");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (aktif === "1") conditions.push("z.cikis_zamani IS NULL");
    if (dateFrom) { conditions.push("z.giris_zamani >= ?"); params.push(dateFrom); }
    if (dateTo) { conditions.push("z.giris_zamani <= ?"); params.push(dateTo + "T23:59:59.999Z"); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await getDb().prepare(`
      SELECT z.*, u.full_name AS kaydeden
      FROM ziyaretci_kayitlari z
      LEFT JOIN users u ON u.id = z.created_by
      ${where}
      ORDER BY z.giris_zamani DESC
      LIMIT 1000
    `).all(...params);

    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "ziyaretci_kaydi:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const raw = await req.json();
    const parsed = ziyaretciKayitSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const d = parsed.data;

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();
    await db.prepare(
      `INSERT INTO ziyaretci_kayitlari (id, ziyaretci_adi, sebep, kime_geldi, giris_zamani, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, d.ziyaretci_adi, d.sebep, d.kime_geldi, now, user.id, now, now);

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
