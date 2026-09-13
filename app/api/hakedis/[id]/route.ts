import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { computeHakedisTutarlari } from "@/lib/hakedis-calc";
import { syncHareket, updateHareketOdeme } from "@/lib/finans-hareket";
import { validatePeriod, financialNumber, dateOnly, validateStoredHakedis } from "@/lib/financial-validation";
import { RequestError } from "@/lib/request-error";
import { transactionStore } from "@/lib/transaction-store";
import { logAudit } from "@/lib/audit";
import { readFinancialSnapshot } from "@/lib/financial-snapshots";

type StoredHakedis = Record<string, unknown> & {
  isleten_id: string; vehicle_id: string | null; durum: string;
  donem_baslangic: string | Date; donem_bitis: string | Date;
  brut_tutar: string | number; kdv_tutari: string | number; net_tutar: string | number;
};

function fmtDate(d: string | Date) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date(d));
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "hakedis:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();

    const hakedis = await db.prepare(
      `SELECT h.*, i.unvan AS isleten_unvan, i.cari_kod, v.plate, ft.form_adi AS form_tipi_adi
       FROM hakedis h
       JOIN isleten i ON i.id = h.isleten_id
       LEFT JOIN vehicles v ON v.id = h.vehicle_id
       LEFT JOIN ucretlendirme_form_tipi ft ON ft.id = h.form_tipi_id
       WHERE h.id = ?`
    ).get(id);
    if (!hakedis) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    const evidence = await readFinancialSnapshot(db, "hakedis", id, ["create"]);
    const ceteleRows = evidence?.services ?? await db.prepare(
      `SELECT c.*, v.plate, r.name AS route_name, hc.tutar
       FROM hakedis_cetele hc
       JOIN cetele c ON c.id = hc.cetele_id
       JOIN vehicles v ON v.id = c.vehicle_id
       LEFT JOIN routes r ON r.id = c.route_id
       WHERE hc.hakedis_id = ?
       ORDER BY c.tarih ASC`
    ).all(id);

    return NextResponse.json({ ok: true, data: { ...hakedis, cetele: ceteleRows,
      calculation_source: evidence ? "financial_snapshot" : "live", historical_evidence_missing: !evidence } });
  } catch (e) { return apiError(e); }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const now = nowIso();
    return await getDb().transaction(async conn => {
      const db = transactionStore(conn);

      const existing = await db.prepare(`SELECT * FROM hakedis WHERE id = ? FOR UPDATE`).get<StoredHakedis>(id);
      if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

      const auditTransition = async () => logAudit({
        actorUserId: user.id, action: "hakedis." + body.action, entityType: "hakedis", entityId: id,
        details: { before: existing, after: await db.prepare("SELECT * FROM hakedis WHERE id = ?").get(id), reason: body.reason ?? null },
      }, conn);

      // ── Durum geçişleri ──────────────────────────────────────────────
      if (body.action === "tahakkuk") {
        if (!hasPermission(user, "hakedis:update"))
          return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
        if (existing.durum !== "taslak")
          return NextResponse.json({ ok: false, error: "Sadece taslak hakedişler tahakkuk ettirilebilir" }, { status: 400 });

        validateStoredHakedis(existing);

        await db.prepare(`UPDATE hakedis SET durum = 'tahakkuk', tahakkuk_tarihi = ?, updated_at = ? WHERE id = ?`)
          .run(now, now, id);
        await auditTransition();
        return NextResponse.json({ ok: true });
      }

      if (body.action === "onayla") {
        if (!hasPermission(user, "hakedis:approve"))
          return NextResponse.json({ ok: false, error: "Onaylama yetkiniz yok" }, { status: 403 });
        if (existing.durum !== "tahakkuk")
          return NextResponse.json({ ok: false, error: "Sadece tahakkuk eden hakedişler onaylanabilir" }, { status: 400 });

        validateStoredHakedis(existing);

        await db.prepare(`UPDATE hakedis SET durum = 'onaylandi', onay_tarihi = ?, updated_at = ? WHERE id = ?`)
          .run(now, now, id);

        // İşleten cari hesabına hakediş alacağı işlenir
        await db.prepare(
          `INSERT INTO isleten_cari
             (id, isleten_id, tarih, tutar, para_girisi, para_cikisi, aciklama, islem_turu, referans_id, referans_turu, created_by, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
        ).run(
          uuidv4(), existing.isleten_id, now.split("T")[0], existing.net_tutar, existing.net_tutar, 0,
          `Hakediş: ${fmtDate(existing.donem_baslangic)} — ${fmtDate(existing.donem_bitis)}`,
          "hakedis", id, "hakedis", user.id, now,
        );

        // Tek deftere de yazılır (bkz. migration 087 — "her belge türü buraya bir
        // satır yazar", hakediş bu güne kadar hiç yazmıyordu). tutar = brüt+KDV
        // (tevkifat öncesi gerçek maliyet); odenen_tutar (odendi adımında)
        // tevkifat sonrası işletene fiilen giden nakittir — tevkifat vergi
        // dairesine gider, işletene değil.
        await syncHareket("hakedis", id, {
          tur: "gider",
          tarih: dateOnly(existing.donem_bitis),
          tutar: Number(existing.brut_tutar) + Number(existing.kdv_tutari),
          net_tutar: Number(existing.brut_tutar),
          kdv_tutari: Number(existing.kdv_tutari),
          cari_id: existing.isleten_id,
          kategori_id: "kat-g-hakedis",
          vehicle_id: existing.vehicle_id,
          durum: "onaylandi",
          aciklama: `Hakediş: ${fmtDate(existing.donem_baslangic)} — ${fmtDate(existing.donem_bitis)}`,
          created_by: user.id,
        }, conn);

        await auditTransition();
        return NextResponse.json({ ok: true });
      }

      if (body.action === "odendi") {
        if (!hasPermission(user, "hakedis:pay"))
          return NextResponse.json({ ok: false, error: "Ödeme işaretleme yetkiniz yok" }, { status: 403 });
        if (existing.durum !== "onaylandi")
          return NextResponse.json({ ok: false, error: "Sadece onaylanmış hakedişler ödendi işaretlenebilir" }, { status: 400 });

        const ledger = await db.prepare("SELECT id FROM finans_hareket WHERE kaynak_tip='hakedis' AND kaynak_id=? FOR UPDATE").get(id);
        const receivable = await db.prepare("SELECT id FROM isleten_cari WHERE referans_turu='hakedis' AND referans_id=? AND islem_turu='hakedis' FOR UPDATE").get(id);
        if (!ledger || !receivable) throw new RequestError("Onayın cari/defter dayanağı eksik. Ödeme öncesi mali inceleme gerekiyor", 409);

        await db.prepare(`UPDATE hakedis SET durum = 'odendi', odeme_tarihi = ?, updated_at = ? WHERE id = ?`)
          .run(now, now, id);

        // Ödeme, cari hesaptan düşülür
        await db.prepare(
          `INSERT INTO isleten_cari
             (id, isleten_id, tarih, tutar, para_girisi, para_cikisi, aciklama, islem_turu, referans_id, referans_turu, created_by, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
        ).run(
          uuidv4(), existing.isleten_id, now.split("T")[0], existing.net_tutar, 0, existing.net_tutar,
          `Hakediş ödemesi: ${fmtDate(existing.donem_baslangic)} — ${fmtDate(existing.donem_bitis)}`,
          "odeme", id, "hakedis", user.id, now,
        );

        // Tek defterdeki ödeme durumunu tazele (tutar onayla adımında zaten yazıldı)
        await updateHareketOdeme("hakedis", id, "odendi", Number(existing.net_tutar), conn);
        await auditTransition();

        return NextResponse.json({ ok: true });
      }

      if (body.action === "iptal") {
        if (!hasPermission(user, "hakedis:reject"))
          return NextResponse.json({ ok: false, error: "İptal yetkiniz yok" }, { status: 403 });
        if (!["taslak", "tahakkuk"].includes(existing.durum))
          return NextResponse.json({ ok: false, error: "Sadece taslak/tahakkuk durumundaki hakedişler iptal edilebilir" }, { status: 400 });

        await db.prepare(`UPDATE hakedis SET durum = 'iptal', updated_at = ? WHERE id = ?`).run(now, id);
        await auditTransition();
        return NextResponse.json({ ok: true });
      }

      // ── Genel güncelleme (sadece taslak) ─────────────────────────────
      if (!hasPermission(user, "hakedis:update"))
        return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
      if (existing.durum !== "taslak")
        return NextResponse.json({ ok: false, error: "Sadece taslak hakedişler düzenlenebilir" }, { status: 400 });

      const tx = db;
      const current = existing;
      const { from, to } = validatePeriod(body.donem_baslangic ?? current.donem_baslangic, body.donem_bitis ?? current.donem_bitis);
      const brut = financialNumber(body.brut_tutar ?? current.brut_tutar, "Brüt tutar");
      const kdvOrani = financialNumber(body.kdv_orani ?? current.kdv_orani, "KDV oranı", 100);
      const tevkifatOrani = financialNumber(body.tevkifat_orani ?? current.tevkifat_orani, "Tevkifat oranı", 100);
      const links = await tx.prepare(`SELECT hc.tutar, c.tarih, c.vehicle_id FROM hakedis_cetele hc
        JOIN cetele c ON c.id = hc.cetele_id WHERE hc.hakedis_id = ? FOR UPDATE`)
        .all<{ tutar: number | string; tarih: Date | string; vehicle_id: string }>(id);
      const vehicleId = body.vehicle_id ?? current.vehicle_id;
      if (links.some(c => dateOnly(c.tarih) < from || dateOnly(c.tarih) > to || (vehicleId && vehicleId !== c.vehicle_id)) ||
          (links.length && links.reduce((n, c) => n + Math.round(Number(c.tutar) * 100), 0) !== Math.round(brut * 100))) {
        throw new RequestError("Bağlı hizmetlerin dönemi, aracı veya saklanan toplamı değiştirilemez", 409);
      }
      const recalculates = ["brut_tutar", "kdv_orani", "tevkifat_orani"].some(key => body[key] !== undefined);
      const values = recalculates ? computeHakedisTutarlari(brut, kdvOrani, tevkifatOrani) : {
        kdvTutari: Number(current.kdv_tutari), tevkifatTutari: Number(current.tevkifat_tutari), netTutar: Number(current.net_tutar),
      };
      if (recalculates) financialNumber(values.netTutar, "Net tutar");
      await tx.prepare(`UPDATE hakedis SET vehicle_id=?, donem_baslangic=?, donem_bitis=?, form_tipi_id=?,
        brut_tutar=?, kdv_orani=?, kdv_tutari=?, tevkifat_orani=?, tevkifat_tutari=?, net_tutar=?,
        aciklama=?, updated_at=? WHERE id=?`).run(vehicleId, from, to, body.form_tipi_id ?? current.form_tipi_id,
        brut, kdvOrani, values.kdvTutari, tevkifatOrani, values.tevkifatTutari, values.netTutar, body.aciklama ?? current.aciklama, now, id);
      await logAudit({ actorUserId: user.id, action: "hakedis.update", entityType: "hakedis", entityId: id,
        details: { before: current, changes: body, calculation: recalculates ? "kdv-tevkifati-v1" : "preserved", ...values } }, conn);
      return NextResponse.json({ ok: true });
    });
  } catch (e) { return apiError(e); }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "hakedis:reject"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    return await getDb().transaction(async conn => {
      const db = transactionStore(conn);
      const existing = await db.prepare(`SELECT * FROM hakedis WHERE id = ? FOR UPDATE`).get<{ durum: string }>(id);
      if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });
      if (existing.durum !== "taslak")
        return NextResponse.json({ ok: false, error: "Sadece taslak hakedişler silinebilir" }, { status: 400 });

      const links = await db.prepare("SELECT * FROM hakedis_cetele WHERE hakedis_id = ? FOR UPDATE").all(id);
      await db.prepare(`DELETE FROM hakedis WHERE id = ?`).run(id);
      await logAudit({ actorUserId: user.id, action: "hakedis.delete", entityType: "hakedis", entityId: id,
        details: { before: existing, links } }, conn);
      return NextResponse.json({ ok: true });
    });
  } catch (e) { return apiError(e); }
}
