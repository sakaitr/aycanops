import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { finansGelirGiderSchema } from "@/lib/schemas";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_gelir_gider:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const tur = searchParams.get("tur");
    const durum = searchParams.get("durum");
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (tur) { conditions.push("gg.tur = ?"); params.push(tur); }
    if (durum) { conditions.push("gg.durum = ?"); params.push(durum); }
    if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (allowed.length === 0) return NextResponse.json({ ok: true, data: [] });
      conditions.push(`(gg.company_id IS NULL OR gg.company_id IN (${allowed.map(() => "?").join(",")}))`);
      params.push(...allowed);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await getDb().prepare(
      `SELECT gg.*, k.ad AS kategori_ad, d.name AS department_ad, p.ad AS proje_ad,
              mm.ad AS masraf_merkezi_ad, c.name AS company_name, u.full_name AS created_by_name
       FROM finans_gelir_gider gg
       LEFT JOIN finans_kategori k ON k.id = gg.kategori_id
       LEFT JOIN departments d ON d.id = gg.department_id
       LEFT JOIN finans_proje p ON p.id = gg.proje_id
       LEFT JOIN finans_masraf_merkezi mm ON mm.id = gg.masraf_merkezi_id
       LEFT JOIN companies c ON c.id = gg.company_id
       LEFT JOIN users u ON u.id = gg.created_by
       ${where}
       ORDER BY gg.belge_tarihi DESC, gg.kayit_tarihi DESC`
    ).all(...params);
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_gelir_gider:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const raw = await req.json();
    const parsed = finansGelirGiderSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const d = parsed.data;

    if (d.company_id && user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(d.company_id))
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
    }

    // brut_tutar istemciden gelen değer değil, her zaman net+vergi olarak
    // sunucuda yeniden hesaplanır — istemcinin tutarsız bir brüt göndermesini engeller.
    const vergiTutari = d.vergi_tutari ?? 0;
    const brutTutar = d.net_tutar + vergiTutari;

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();
    await db.prepare(
      `INSERT INTO finans_gelir_gider
         (id, tur, belge_tarihi, kayit_tarihi, tahakkuk_tarihi, vade_tarihi, cari_tip, cari_id,
          kategori_id, net_tutar, vergi_tutari, brut_tutar, para_birimi_kod, kur,
          company_id, department_id, proje_id, masraf_merkezi_id, odeme_durumu, durum,
          aciklama, etiketler, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'odenmedi', 'taslak', ?, ?, ?, ?, ?)`
    ).run(
      id, d.tur, d.belge_tarihi, now, d.tahakkuk_tarihi || null, d.vade_tarihi || null,
      d.cari_tip || null, d.cari_id || null, d.kategori_id || null,
      d.net_tutar, vergiTutari, brutTutar, d.para_birimi_kod || "TRY", d.kur ?? 1,
      d.company_id || null, d.department_id || null, d.proje_id || null, d.masraf_merkezi_id || null,
      d.aciklama || null, d.etiketler ? JSON.stringify(d.etiketler) : null,
      user.id, now, now
    );

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
