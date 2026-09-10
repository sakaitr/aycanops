import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { logAudit } from "@/lib/audit";
import { normalizeName } from "@/lib/vardiya";

interface SaveRow {
  ham_ad: string;
  passenger_id: string | null;
  route_id: string | null;
  durum: "exact" | "alias" | "fuzzy_onaylandi" | "yeni_yolcu" | "atlandi";
  alias_kaydet?: boolean;
}

// POST /api/vardiya-eslestirme/save
// Sadece onaylanan satırları uygular: passengers.route_id günceller,
// yeni onaylanan isim↔yolcu çiftlerini vardiya_alias'a yazar, liste geçmişini kaydeder.
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "passengers:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    const companyId: string = body?.company_id || "";
    const kayitlar: SaveRow[] = Array.isArray(body?.kayitlar) ? body.kayitlar : [];
    const notMetni: string | null = typeof body?.not_metni === "string" ? body.not_metni.slice(0, 500) : null;

    if (!companyId) return NextResponse.json({ ok: false, error: "company_id zorunlu" }, { status: 400 });
    if (kayitlar.length === 0)
      return NextResponse.json({ ok: false, error: "Kayıt yok" }, { status: 400 });

    if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(companyId))
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
    }

    const db = getDb();
    const now = nowIso();
    const listeId = uuidv4();

    let atananYolcu = 0;
    let yeniAlias = 0;
    const eslesen = kayitlar.filter((k) => k.durum !== "atlandi" && k.passenger_id && k.route_id).length;
    const eslesmeyen = kayitlar.length - eslesen;

    await db.transaction(async (conn) => {
      await conn.execute(
        `INSERT INTO vardiya_listesi
           (id, company_id, yuklenme_tarihi, satir_sayisi, eslesen, eslesmeyen, not_metni, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [listeId, companyId, now, kayitlar.length, eslesen, eslesmeyen, notMetni, user.id, now],
      );

      for (const k of kayitlar) {
        const cozum =
          k.durum === "atlandi"
            ? "atlandi"
            : k.durum === "yeni_yolcu"
              ? "yeni_yolcu"
              : k.durum === "fuzzy_onaylandi"
                ? "fuzzy_onaylandi"
                : k.durum === "alias"
                  ? "alias"
                  : "exact";

        await conn.execute(
          `INSERT INTO vardiya_listesi_satir
             (id, liste_id, ham_ad, cozum_durumu, passenger_id, route_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), listeId, k.ham_ad.slice(0, 200), cozum, k.passenger_id ?? null, k.route_id ?? null, now],
        );

        if (k.durum === "atlandi" || !k.passenger_id || !k.route_id) continue;

        // passengers.route_id güncelle (yalnızca değişiyorsa)
        const [rows] = await conn.execute(
          `SELECT route_id FROM passengers WHERE id = ? AND company_id = ?`,
          [k.passenger_id, companyId],
        );
        const cur = (rows as Array<{ route_id: string | null }>)[0];
        if (cur && cur.route_id !== k.route_id) {
          await conn.execute(
            `UPDATE passengers SET route_id = ?, updated_at = ? WHERE id = ? AND company_id = ?`,
            [k.route_id, now, k.passenger_id, companyId],
          );
          atananYolcu += 1;
        }

        // Yeni onaylanan isim↔yolcu → alias cache (fuzzy onayı veya elle düzeltme)
        if (k.alias_kaydet || k.durum === "fuzzy_onaylandi" || k.durum === "yeni_yolcu") {
          const norm = normalizeName(k.ham_ad);
          await conn.execute(
            `INSERT INTO vardiya_alias (id, company_id, ham_ad_normalize, passenger_id, confirmed_by, confirmed_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE passenger_id = VALUES(passenger_id), confirmed_by = VALUES(confirmed_by), confirmed_at = VALUES(confirmed_at)`,
            [uuidv4(), companyId, norm, k.passenger_id, user.id, now, now],
          );
          yeniAlias += 1;
        }
      }
    });

    await logAudit({
      actorUserId: user.id,
      action: "vardiya.eslestirme_save",
      entityType: "vardiya_listesi",
      entityId: listeId,
      details: { company_id: companyId, satir: kayitlar.length, atanan_yolcu: atananYolcu, yeni_alias: yeniAlias },
    });

    return NextResponse.json({
      ok: true,
      data: { liste_id: listeId, atanan_yolcu: atananYolcu, yeni_alias: yeniAlias, eslesen, eslesmeyen },
    });
  } catch (e) {
    return apiError(e);
  }
}
