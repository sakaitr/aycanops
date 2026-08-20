import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";
import { finansGiderSchema } from "@/lib/schemas";
import { createGiderRecord, validateGiderFields, checkPersonalBudget, checkDuplicateBelgeNo } from "@/lib/finans-gider";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_gider:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const kategori_id = searchParams.get("kategori_id");
    const durum = searchParams.get("durum");
    const tip = searchParams.get("tip");
    const date_from = searchParams.get("date_from");
    const date_to = searchParams.get("date_to");

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (kategori_id) { conditions.push("g.kategori_id = ?"); params.push(kategori_id); }
    if (durum) { conditions.push("g.durum = ?"); params.push(durum); }
    if (tip) { conditions.push("g.tip = ?"); params.push(tip); }
    if (date_from) { conditions.push("g.tarih >= ?"); params.push(date_from); }
    if (date_to) { conditions.push("g.tarih <= ?"); params.push(date_to); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const db = getDb();
    const rows = await db.prepare(
      `SELECT g.*, k.ad AS kategori_ad, c.unvan AS cari_ad, u.full_name AS created_by_ad,
              (SELECT COUNT(*) FROM finans_gider_kalem gk WHERE gk.gider_id = g.id) AS kalem_sayisi,
              (SELECT COUNT(*) FROM finans_belge b WHERE b.iliskili_tip = 'gider' AND b.iliskili_id = g.id) AS belge_sayisi
       FROM finans_gider g
       LEFT JOIN finans_kategori k ON k.id = g.kategori_id
       LEFT JOIN cari_tedarikci c ON c.id = g.cari_id
       LEFT JOIN users u ON u.id = g.created_by
       ${where}
       ORDER BY g.tarih DESC, g.created_at DESC
       LIMIT 500`
    ).all(...params);

    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_gider:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const raw = await req.json();
    const parsed = finansGiderSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const d = parsed.data;

    const fieldErrors = validateGiderFields(d);
    if (fieldErrors) return NextResponse.json({ ok: false, error: fieldErrors }, { status: 400 });

    const belgeNoUyarisi = await checkDuplicateBelgeNo(d.belge_no);
    const id = await createGiderRecord(user.id, d);
    const butceUyarisi = await checkPersonalBudget(user.id, d.tarih);
    return NextResponse.json({
      ok: true, data: { id },
      uyari: butceUyarisi?.asildi ? butceUyarisi : null,
      belge_no_uyari: belgeNoUyarisi,
    }, { status: 201 });
  } catch (e) { return apiError(e); }
}
