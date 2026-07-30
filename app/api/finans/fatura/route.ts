import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { syncHareket } from "@/lib/finans-hareket";
import { finansFaturaSchema } from "@/lib/schemas";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_fatura:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const tur = searchParams.get("tur");
    const durum = searchParams.get("durum");
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (tur) { conditions.push("f.tur = ?"); params.push(tur); }
    if (durum) { conditions.push("f.durum = ?"); params.push(durum); }
    if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (allowed.length === 0) return NextResponse.json({ ok: true, data: [] });
      // finans_fatura'da company_id kolonu yok — cari_tip='musteri' olan
      // kayıtlarda cari_id bir companies.id'dir ve buradan sınırlandırılır.
      // cari_tip='tedarikci' kayıtları (tedarikçi tarafı) bu repodaki
      // yerleşik ilkeye göre (Faz1 incelemesinde teyit edildi) firma
      // kısıtlamasına tabi değildir.
      conditions.push(`(f.cari_tip = 'tedarikci' OR (f.cari_tip = 'musteri' AND f.cari_id IN (${allowed.map(() => "?").join(",")})))`);
      params.push(...allowed);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const db = getDb();
    const faturalar = await db.prepare(
      `SELECT f.*, bt.ad AS belge_turu_ad
       FROM finans_fatura f
       LEFT JOIN finans_belge_turu bt ON bt.id = f.belge_turu_id
       ${where}
       ORDER BY f.tarih DESC, f.created_at DESC`
    ).all(...params) as any[];

    if (faturalar.length > 0) {
      const ids = faturalar.map(f => f.id);
      const kalemler = await db.prepare(
        `SELECT * FROM finans_fatura_kalemi WHERE fatura_id IN (${ids.map(() => "?").join(",")})`
      ).all(...ids) as any[];
      const kalemlerByFatura: Record<string, any[]> = {};
      for (const k of kalemler) {
        if (!kalemlerByFatura[k.fatura_id]) kalemlerByFatura[k.fatura_id] = [];
        kalemlerByFatura[k.fatura_id].push(k);
      }
      for (const f of faturalar) f.kalemler = kalemlerByFatura[f.id] || [];
    }

    return NextResponse.json({ ok: true, data: faturalar });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_fatura:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const raw = await req.json();
    const parsed = finansFaturaSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const d = parsed.data;

    // Toplamlar sunucuda hesaplanır — istemciden gelen değerler kullanılmaz
    // (Faz 1'in gelir-gider'inde uygulanan aynı ilke: brüt/toplam alanları
    // her zaman kalem verisinden türetilir).
    let araToplam = 0;
    let vergiToplam = 0;
    for (const k of d.kalemler) araToplam += k.miktar * k.birim_fiyat;
    // Basit yaklaşım: vergi kodu oranı ayrıca sorgulanabilir; Faz 2 MVP'de
    // kalem bazlı vergi toplamı, ilgili vergi_kodu_id'nin `finans_vergi_kodu.oran`
    // değeri üzerinden hesaplanır.
    const vergiKoduIds = [...new Set(d.kalemler.map(k => k.vergi_kodu_id).filter(Boolean))] as string[];
    const db = getDb();
    const oranMap: Record<string, number> = {};
    if (vergiKoduIds.length > 0) {
      const oranlar = await db.prepare(
        `SELECT id, oran FROM finans_vergi_kodu WHERE id IN (${vergiKoduIds.map(() => "?").join(",")})`
      ).all(...vergiKoduIds) as { id: string; oran: number }[];
      for (const o of oranlar) oranMap[o.id] = Number(o.oran);
    }
    for (const k of d.kalemler) {
      const kalemTutar = k.miktar * k.birim_fiyat;
      const oran = k.vergi_kodu_id ? (oranMap[k.vergi_kodu_id] ?? 0) : 0;
      vergiToplam += kalemTutar * (oran / 100);
    }
    const genelToplam = araToplam + vergiToplam;

    const id = uuidv4();
    const now = nowIso();
    // Başlık ve kalem eklemeleri tek transaction içinde yapılır — aradaki bir
    // kalem insert'i başarısız olursa fatura başlığı yetim (kalemsiz) kalmaz.
    await db.transaction(async (conn) => {
      await conn.execute(
        `INSERT INTO finans_fatura
           (id, tur, durum, fatura_no, odeme_turu, belge_turu_id, cari_tip, cari_id, tarih, vade_tarihi,
            para_birimi_kod, kur, ara_toplam, vergi_toplam, genel_toplam, odeme_durumu,
            iliskili_fatura_id, aciklama, banka_adi, banka_iban, created_by, created_at, updated_at)
         VALUES (?, ?, 'taslak', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'odenmedi', ?, ?, ?, ?, ?, ?, ?)`,
        [id, d.tur, d.fatura_no || null, d.odeme_turu || null, d.belge_turu_id || null, d.cari_tip, d.cari_id, d.tarih, d.vade_tarihi || null,
         d.para_birimi_kod || "TRY", d.kur ?? 1, araToplam, vergiToplam, genelToplam,
         d.iliskili_fatura_id || null, d.aciklama || null, d.banka_adi || null, d.banka_iban || null, user.id, now, now]
      );

      for (const k of d.kalemler) {
        const kalemTutar = k.miktar * k.birim_fiyat;
        await conn.execute(
          `INSERT INTO finans_fatura_kalemi
             (id, fatura_id, urun_hizmet_adi, miktar, birim_fiyat, vergi_kodu_id, tutar,
              masraf_merkezi_id, proje_id, department_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), id, k.urun_hizmet_adi, k.miktar, k.birim_fiyat, k.vergi_kodu_id || null,
           kalemTutar, k.masraf_merkezi_id || null, k.proje_id || null, k.department_id || null]
        );
      }
    });

    // Tek deftere yaz — cari ekstre/patron paneli buradan okuyor (bkz.
    // lib/finans-hareket.ts). Transaction dışında: defter senkron hatası
    // faturanın kaydını geri almamalı.
    await syncHareket("fatura", id, {
      tur: d.tur === "satis" ? "gelir" : "gider",
      tarih: d.tarih,
      tutar: genelToplam,
      net_tutar: araToplam,
      kdv_tutari: vergiToplam,
      para_birimi: d.para_birimi_kod || "TRY",
      kur: d.kur ?? 1,
      cari_id: d.cari_id,
      odeme_durumu: "odenmedi",
      durum: "taslak",
      aciklama: d.aciklama ?? null,
      created_by: user.id,
    });

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
