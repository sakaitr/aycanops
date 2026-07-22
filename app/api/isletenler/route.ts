import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "isleten:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";
    const active = searchParams.get("active") ?? "1";
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") || "100")));
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const offset = (page - 1) * limit;

    const db = getDb();
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (q) {
      conditions.push("(i.unvan LIKE ? OR i.cari_kod LIKE ? OR i.cep_tel LIKE ? OR i.vergi_no LIKE ?)");
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (active !== "") { conditions.push("i.is_active = ?"); params.push(Number(active)); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countRow = await db.prepare(
      `SELECT COUNT(*) as total FROM isleten i ${where}`
    ).get<{ total: number }>(...params);

    const rows = await db.prepare(
      `SELECT i.*,
              COUNT(DISTINCT ai.vehicle_id) AS arac_sayisi,
              COALESCE(SUM(ic.para_girisi) - SUM(ic.para_cikisi), 0) AS cari_bakiye
       FROM isleten i
       LEFT JOIN arac_isleten ai ON ai.isleten_id = i.id AND ai.bitis_tarihi IS NULL
       LEFT JOIN isleten_cari ic ON ic.isleten_id = i.id
       ${where}
       GROUP BY i.id
       ORDER BY i.unvan ASC
       LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    return NextResponse.json({
      ok: true,
      data: rows,
      meta: { total: countRow?.total ?? 0, page, limit },
    });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "isleten:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    const unvan = (body.unvan || "").trim();
    const cep_tel = (body.cep_tel || "").trim();
    if (!unvan) return NextResponse.json({ ok: false, error: "Ünvan zorunludur" }, { status: 400 });
    if (!cep_tel) return NextResponse.json({ ok: false, error: "Cep telefon zorunludur" }, { status: 400 });

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();

    // Auto-generate cari_kod if not provided: ISL-XXXX
    let cari_kod = (body.cari_kod || "").trim();
    if (!cari_kod) {
      const lastRow = await db.prepare(
        `SELECT cari_kod FROM isleten WHERE cari_kod LIKE 'ISL-%' ORDER BY created_at DESC LIMIT 1`
      ).get<{ cari_kod: string }>();
      const lastNum = lastRow ? parseInt(lastRow.cari_kod.replace("ISL-", "")) || 0 : 0;
      cari_kod = `ISL-${String(lastNum + 1).padStart(4, "0")}`;
    }

    await db.prepare(
      `INSERT INTO isleten
         (id, unvan, vergi_no, tc_no, vergi_dairesi, cep_tel, is_tel, ev_tel, email,
          cari_kod, kayitli_oda, sozlesme_baslangic, sozlesme_bitis,
          ana_isleten, surucu_mu, ruhsat_sahibi_mi,
          tevkifat_durumu, yakit_kredi_orani,
          banka_adi, banka_sube, banka_iban, aciklama,
          is_active, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id, unvan,
      body.vergi_no || null,
      body.tc_no || null,
      body.vergi_dairesi || null,
      cep_tel,
      body.is_tel || null,
      body.ev_tel || null,
      body.email || null,
      cari_kod,
      body.kayitli_oda || null,
      body.sozlesme_baslangic || null,
      body.sozlesme_bitis || null,
      body.ana_isleten ? 1 : 0,
      body.surucu_mu ? 1 : 0,
      body.ruhsat_sahibi_mi ? 1 : 0,
      body.tevkifat_durumu || "tum_araclar",
      body.yakit_kredi_orani || null,
      body.banka_adi || null,
      body.banka_sube || null,
      body.banka_iban || null,
      body.aciklama || null,
      1,
      user.id,
      now, now,
    );

    return NextResponse.json({ ok: true, data: { id, cari_kod } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
