import { RequestError } from "@/lib/request-error";
import { dateOnly, validatePeriod, financialNumber } from "@/lib/financial-validation";
import { transactionStore } from "@/lib/transaction-store";
import { pricedServices, pricedTotal } from "@/lib/cetele-pricing";
import { assertCompanyAccess } from "@/lib/company-access";
import { logAudit } from "@/lib/audit";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { computeHakedisTutarlari } from "@/lib/hakedis-calc";
import { appendFinancialSnapshot } from "@/lib/financial-snapshots";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "hakedis:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const isleten_id = searchParams.get("isleten_id") || "";
    const durum = searchParams.get("durum") || "";
    const limit = Math.min(500, parseInt(searchParams.get("limit") || "100"));
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const offset = (page - 1) * limit;

    const db = getDb();
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (isleten_id) { conditions.push("h.isleten_id = ?"); params.push(isleten_id); }
    if (durum) { conditions.push("h.durum = ?"); params.push(durum); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countRow = await db.prepare(`SELECT COUNT(*) AS total FROM hakedis h ${where}`).get<{ total: number }>(...params);

    const rows = await db.prepare(
      `SELECT h.*, i.unvan AS isleten_unvan, i.cari_kod,
              v.plate,
              ft.form_adi AS form_tipi_adi,
              (SELECT COUNT(*) FROM hakedis_cetele hc WHERE hc.hakedis_id = h.id) AS cetele_sayisi
       FROM hakedis h
       JOIN isleten i ON i.id = h.isleten_id
       LEFT JOIN vehicles v ON v.id = h.vehicle_id
       LEFT JOIN ucretlendirme_form_tipi ft ON ft.id = h.form_tipi_id
       ${where}
       ORDER BY h.donem_baslangic DESC, h.created_at DESC
       LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    return NextResponse.json({ ok: true, data: rows, meta: { total: countRow?.total ?? 0, page, limit } });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "hakedis:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const body = await req.json();
    if (!body.isleten_id) throw new RequestError("İşleten seçiniz");
    const { from, to } = validatePeriod(body.donem_baslangic, body.donem_bitis);
    const manualGross = financialNumber(body.brut_tutar === "" ? 0 : body.brut_tutar ?? 0, "Brüt tutar");
    const kdvOrani = financialNumber(body.kdv_orani ?? 20, "KDV oranı", 100);
    const tevkifatOrani = financialNumber(body.tevkifat_orani ?? 0, "Tevkifat oranı", 100);
    const ids: string[] = body.cetele_ids ?? [];
    if (!Array.isArray(ids) || ids.length > 500 || ids.some(id => typeof id !== "string" || !id.trim()) || new Set(ids).size !== ids.length)
      throw new RequestError("En fazla 500 farklı çetele kaydı seçiniz");

    const data = await getDb().transaction(async (conn) => {
      const db = transactionStore(conn);
      const id = uuidv4(), now = nowIso();
      let services: Awaited<ReturnType<typeof pricedServices>> = [];
      if (ids.length) {
        const placeholders = ids.map(() => "?").join(",");
        // Lock service rows before checking UNIQUE links; concurrent creates cannot double-pay.
        const selected = await db.prepare(`SELECT id, vehicle_id, tarih, durum FROM cetele WHERE id IN (${placeholders}) ORDER BY id FOR UPDATE`)
          .all<{ id: string; vehicle_id: string; tarih: Date | string; durum: string }>(...ids);
        if (selected.length !== ids.length || selected.some(c => c.durum !== "onaylandi" || dateOnly(c.tarih) < from || dateOnly(c.tarih) > to || (body.vehicle_id && body.vehicle_id !== c.vehicle_id)))
          throw new RequestError("Seçilen hizmetler onaylı, seçilen araç ve dönem kapsamında olmalıdır", 409);
        const linked = await db.prepare(`SELECT cetele_id FROM hakedis_cetele WHERE cetele_id IN (${placeholders}) FOR UPDATE`).all(...ids);
        if (linked.length) throw new RequestError("Seçilen hizmetlerden biri zaten hakedişe bağlı", 409);
        const owned = await db.prepare(`SELECT c.id FROM cetele c WHERE c.id IN (${placeholders}) AND EXISTS (
          SELECT 1 FROM arac_isleten ai WHERE ai.vehicle_id = c.vehicle_id AND ai.isleten_id = ?
          AND ai.baslangic_tarihi <= c.tarih AND (ai.bitis_tarihi IS NULL OR ai.bitis_tarihi >= c.tarih))`)
          .all(...ids, body.isleten_id);
        if (owned.length !== ids.length) throw new RequestError("Seçilen hizmetler bu tarihte bu işletene ait değil", 409);
        services = await pricedServices(db, `c.id IN (${placeholders})`, ids);
        for (const service of services) assertCompanyAccess(user, service.company_id);
      }
      const brut = ids.length ? pricedTotal(services) : manualGross;
      const { kdvTutari, tevkifatTutari, netTutar } = computeHakedisTutarlari(brut, kdvOrani, tevkifatOrani);
      financialNumber(netTutar, "Net tutar");
      await db.prepare(`INSERT INTO hakedis
        (id, isleten_id, vehicle_id, donem_baslangic, donem_bitis, form_tipi_id,
         brut_tutar, kdv_orani, kdv_tutari, tevkifat_orani, tevkifat_tutari, net_tutar,
         durum, aciklama, created_by, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          id, body.isleten_id, body.vehicle_id || null, from, to, body.form_tipi_id || null,
          brut, kdvOrani, kdvTutari, tevkifatOrani, tevkifatTutari, netTutar,
          "taslak", body.aciklama || null, user.id, now, now);
      for (const service of services) {
        await db.prepare("INSERT INTO hakedis_cetele (id, hakedis_id, cetele_id, tutar, created_at) VALUES (?,?,?,?,?)")
          .run(uuidv4(), id, service.id, Number(service.birim_ucret), now);
      }
      await appendFinancialSnapshot(conn, "hakedis", id, "create", user.id, {
        calculation: "kdv-tevkifati-v1", brut, kdvOrani, kdvTutari, tevkifatOrani, tevkifatTutari, netTutar,
        services: services.map(s => ({ ...s, tutar: s.birim_ucret })),
      });
      await logAudit({ actorUserId: user.id, action: "hakedis.create", entityType: "hakedis", entityId: id,
        details: { calculation: "kdv-tevkifati-v1", brut, kdvOrani, kdvTutari, tevkifatOrani, tevkifatTutari, netTutar,
          services: services.map(s => ({ id: s.id, price_id: s.price_id, tutar: s.birim_ucret, currency: s.currency })) } }, conn);
      return { id, brut_tutar: brut, cetele_toplam: ids.length ? brut : 0, already_linked: [], not_owned: [] };
    });
    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (e) { return apiError(e); }
}
