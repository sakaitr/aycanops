import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { finansKategoriSchema } from "@/lib/schemas";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_kategori:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const isActive = searchParams.get("is_active");
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (isActive !== null && isActive !== "") {
      conditions.push("k.is_active = ?");
      params.push(isActive === "1" ? 1 : 0);
    }
    const tip = searchParams.get("tip");
    if (tip === "gelir" || tip === "gider") { conditions.push("k.tip = ?"); params.push(tip); }

    const db = getDb();

    // scope=me: Gider Ekle formu gibi giriş amaçlı kullanımlarda, isteği
    // yapan kullanıcı bir finans_kategori_grubu'na üyeyse SADECE o grup(lar)ın
    // kategorileri döner (bkz. migration 101, patron mail'indeki kişi bazlı
    // gider listeleri). Hiçbir gruba üye değilse (ör. admin, ya da grup
    // ataması yapılmamış biri) kısıtlama yok — mevcut davranış korunur.
    if (searchParams.get("scope") === "me") {
      const gruplar = await db.prepare(
        "SELECT grup_id FROM finans_kategori_grup_kullanici WHERE user_id = ?"
      ).all(user.id) as { grup_id: string }[];
      if (gruplar.length > 0) {
        const grupIds = gruplar.map(g => g.grup_id);
        conditions.push(
          `k.id IN (SELECT kategori_id FROM finans_kategori_grup_uyelik WHERE grup_id IN (${grupIds.map(() => "?").join(",")}))`
        );
        params.push(...grupIds);
      }
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Ağaç sırasında döner: her üst kategori, hemen ardından kendi altları —
    // UI parent_id ile ağacı kurabilsin (bkz. migration 087).
    const rows = await db.prepare(
      `SELECT k.*, ust.ad AS ust_ad
         FROM finans_kategori k
         LEFT JOIN finans_kategori ust ON ust.id = k.parent_id
         ${where}
         ORDER BY COALESCE(ust.sort_order, k.sort_order), COALESCE(ust.ad, k.ad),
                  k.parent_id IS NOT NULL, k.sort_order, k.ad`
    ).all(...params);
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_kategori:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const raw = await req.json();
    const parsed = finansKategoriSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const { ad, tip, hesap_id, parent_id } = parsed.data;

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();
    await db.prepare(
      `INSERT INTO finans_kategori (id, ad, tip, hesap_id, parent_id, is_active, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`
    ).run(id, ad, tip, hesap_id || null, parent_id || null, user.id, now, now);

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
