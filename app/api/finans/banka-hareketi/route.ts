import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { finansBankaHareketiSchema } from "@/lib/schemas";

// finans_banka_hareketi'de company_id/cari_tip/cari_id yok — yalnızca
// kasa_banka_hesabi_id'ye bağlı, o tablo da (finans_kasa_banka_hesabi) Faz 1
// incelemesinde kabul edilen bir trade-off olarak firma kısıtlamasına tabi
// değil (bkz. progress.md "Final whole-branch review"). Bu yüzden burada
// finans_fatura/finans_odeme'deki allowed_companies filtrelemesinin eşdeğeri
// yok — kasıtlı olarak eklenmedi.
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_banka_hareketi:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const kasaBankaHesabiId = searchParams.get("kasa_banka_hesabi_id");
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (kasaBankaHesabiId) {
      conditions.push("bh.kasa_banka_hesabi_id = ?");
      params.push(kasaBankaHesabiId);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await getDb().prepare(
      `SELECT bh.*, kb.ad AS kasa_banka_ad
       FROM finans_banka_hareketi bh
       LEFT JOIN finans_kasa_banka_hesabi kb ON kb.id = bh.kasa_banka_hesabi_id
       ${where}
       ORDER BY bh.tarih DESC, bh.created_at DESC`
    ).all(...params);
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_banka_hareketi:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const raw = await req.json();
    const db = getDb();
    const now = nowIso();

    // Toplu ekleme (CSV'den client-side parse edilmiş satır dizisi). Sunucu
    // tarafında CSV parse mantığı YOK — client zaten hazır satırları
    // gönderir, burada sadece doğrulanıp tek tek INSERT edilir.
    if (Array.isArray(raw?.satirlar)) {
      const kasaBankaHesabiId = raw.kasa_banka_hesabi_id;
      if (!kasaBankaHesabiId || typeof kasaBankaHesabiId !== "string")
        return NextResponse.json({ ok: false, error: "Kasa/Banka hesabı zorunludur" }, { status: 400 });

      const hesap = await db.prepare(`SELECT id FROM finans_kasa_banka_hesabi WHERE id = ?`).get(kasaBankaHesabiId);
      if (!hesap) return NextResponse.json({ ok: false, error: "Kasa/Banka hesabı bulunamadı" }, { status: 400 });

      // Her satır kasa_banka_hesabi_id dışındaki alanlarla tam şema üzerinden
      // doğrulanır — tek satırlık POST'la aynı kurallar (tutar, yon, tarih).
      const bulkRowSchema = finansBankaHareketiSchema.omit({ kasa_banka_hesabi_id: true });
      const parsedRows: { tarih: string; aciklama?: string | null; tutar: number; yon: "gelen" | "giden" }[] = [];
      for (let i = 0; i < raw.satirlar.length; i++) {
        const p = bulkRowSchema.safeParse(raw.satirlar[i]);
        if (!p.success)
          return NextResponse.json(
            { ok: false, error: `Satır ${i + 1}: ${JSON.stringify(p.error.flatten().fieldErrors)}` },
            { status: 400 }
          );
        parsedRows.push(p.data);
      }
      if (parsedRows.length === 0)
        return NextResponse.json({ ok: false, error: "En az bir satır gereklidir" }, { status: 400 });

      const ids: string[] = [];
      await db.transaction(async (conn) => {
        for (const row of parsedRows) {
          const id = uuidv4();
          ids.push(id);
          await conn.execute(
            `INSERT INTO finans_banka_hareketi
               (id, kasa_banka_hesabi_id, tarih, aciklama, tutar, yon, eslesen_tip, eslesen_id, created_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
            [id, kasaBankaHesabiId, row.tarih, row.aciklama || null, row.tutar, row.yon, user.id, now]
          );
        }
      });

      return NextResponse.json({ ok: true, data: { ids, count: ids.length } }, { status: 201 });
    }

    // Tek satır (manuel giriş).
    const parsed = finansBankaHareketiSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const d = parsed.data;

    const hesap = await db.prepare(`SELECT id FROM finans_kasa_banka_hesabi WHERE id = ?`).get(d.kasa_banka_hesabi_id);
    if (!hesap) return NextResponse.json({ ok: false, error: "Kasa/Banka hesabı bulunamadı" }, { status: 400 });

    const id = uuidv4();
    await db.prepare(
      `INSERT INTO finans_banka_hareketi
         (id, kasa_banka_hesabi_id, tarih, aciklama, tutar, yon, eslesen_tip, eslesen_id, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`
    ).run(id, d.kasa_banka_hesabi_id, d.tarih, d.aciklama || null, d.tutar, d.yon, user.id, now);

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
