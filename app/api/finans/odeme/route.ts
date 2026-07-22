import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { finansOdemeSchema } from "@/lib/schemas";
import type { RowDataPacket } from "mysql2/promise";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_odeme:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (allowed.length === 0) return NextResponse.json({ ok: true, data: [] });
      // finans_odeme'de company_id kolonu yok — finans_fatura'daki ile aynı
      // polymorphic cari_tip/cari_id şeması kullanılır: cari_tip='musteri'
      // kayıtlarında cari_id bir companies.id'dir ve firma kısıtlaması buradan
      // uygulanır. cari_tip='tedarikci' kayıtları (finans_fatura GET'teki
      // yerleşik ilkeyle tutarlı olarak) firma kısıtlamasına tabi değildir.
      conditions.push(`(o.cari_tip = 'tedarikci' OR (o.cari_tip = 'musteri' AND o.cari_id IN (${allowed.map(() => "?").join(",")})))`);
      params.push(...allowed);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await getDb().prepare(
      `SELECT o.*, kb.ad AS kasa_banka_ad, oy.ad AS odeme_yontemi_ad,
              (SELECT COUNT(*) FROM finans_odeme_fatura WHERE odeme_id = o.id) AS eslesen_fatura_sayisi
       FROM finans_odeme o
       LEFT JOIN finans_kasa_banka_hesabi kb ON kb.id = o.kasa_banka_hesabi_id
       LEFT JOIN finans_odeme_yontemi oy ON oy.id = o.odeme_yontemi_id
       ${where}
       ORDER BY o.tarih DESC, o.created_at DESC`
    ).all(...params);
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_odeme:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const raw = await req.json();
    const parsed = finansOdemeSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const d = parsed.data;

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();

    // Başlık ve eşleşme eklemeleri (+ etkilenen faturaların odeme_durumu
    // yeniden hesaplaması) tek transaction içinde yapılır — aradaki bir
    // eşleşme insert'i veya durum güncellemesi başarısız olursa ödeme kaydı
    // yarım (bazı eşleşmeleri veya durum güncellemeleri eksik) kalmaz. Bu,
    // DELETE route'undaki (app/api/finans/odeme/[id]/route.ts) aynı sınıf
    // işlemin transaction kullanımıyla tutarlıdır.
    await db.transaction(async (conn) => {
      await conn.execute(
        `INSERT INTO finans_odeme
           (id, tutar, tarih, kasa_banka_hesabi_id, odeme_yontemi_id, cari_tip, cari_id, aciklama, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, d.tutar, d.tarih, d.kasa_banka_hesabi_id, d.odeme_yontemi_id || null, d.cari_tip, d.cari_id, d.aciklama || null, user.id, now]
      );

      for (const eslesme of d.fatura_eslesme || []) {
        await conn.execute(
          `INSERT INTO finans_odeme_fatura (id, odeme_id, fatura_id, tutar, created_at) VALUES (?, ?, ?, ?, ?)`,
          [uuidv4(), id, eslesme.fatura_id, eslesme.tutar, now]
        );

        const [faturaRows] = await conn.execute<RowDataPacket[]>(
          `SELECT genel_toplam FROM finans_fatura WHERE id = ?`,
          [eslesme.fatura_id]
        );
        const fatura = (faturaRows as { genel_toplam: number }[])[0];
        if (fatura) {
          const [toplamRows] = await conn.execute<RowDataPacket[]>(
            `SELECT COALESCE(SUM(tutar), 0) AS toplam FROM finans_odeme_fatura WHERE fatura_id = ?`,
            [eslesme.fatura_id]
          );
          const toplam = Number((toplamRows as { toplam: number }[])[0].toplam);
          const genelToplam = Number(fatura.genel_toplam);
          let yeniDurum = "odenmedi";
          if (toplam > genelToplam) yeniDurum = "fazla_odendi";
          else if (toplam === genelToplam) yeniDurum = "odendi";
          else if (toplam > 0) yeniDurum = "kismen_odendi";
          await conn.execute(`UPDATE finans_fatura SET odeme_durumu = ? WHERE id = ?`, [yeniDurum, eslesme.fatura_id]);
        }
      }
    });

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
