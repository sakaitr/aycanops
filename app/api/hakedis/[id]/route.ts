import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

function fmtDate(d: string) {
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

    const ceteleRows = await db.prepare(
      `SELECT c.*, v.plate, r.name AS route_name, hc.tutar
       FROM hakedis_cetele hc
       JOIN cetele c ON c.id = hc.cetele_id
       JOIN vehicles v ON v.id = c.vehicle_id
       LEFT JOIN routes r ON r.id = c.route_id
       WHERE hc.hakedis_id = ?
       ORDER BY c.tarih ASC`
    ).all(id);

    return NextResponse.json({ ok: true, data: { ...hakedis, cetele: ceteleRows } });
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
    const db = getDb();
    const now = nowIso();

    const existing = await db.prepare(`SELECT * FROM hakedis WHERE id = ?`).get<any>(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    // ── Durum geçişleri ──────────────────────────────────────────────
    if (body.action === "tahakkuk") {
      if (!hasPermission(user, "hakedis:update"))
        return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
      if (existing.durum !== "taslak")
        return NextResponse.json({ ok: false, error: "Sadece taslak hakedişler tahakkuk ettirilebilir" }, { status: 400 });

      await db.prepare(`UPDATE hakedis SET durum = 'tahakkuk', tahakkuk_tarihi = ?, updated_at = ? WHERE id = ?`)
        .run(now, now, id);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "onayla") {
      if (!hasPermission(user, "hakedis:approve"))
        return NextResponse.json({ ok: false, error: "Onaylama yetkiniz yok" }, { status: 403 });
      if (existing.durum !== "tahakkuk")
        return NextResponse.json({ ok: false, error: "Sadece tahakkuk eden hakedişler onaylanabilir" }, { status: 400 });

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

      return NextResponse.json({ ok: true });
    }

    if (body.action === "odendi") {
      if (!hasPermission(user, "hakedis:pay"))
        return NextResponse.json({ ok: false, error: "Ödeme işaretleme yetkiniz yok" }, { status: 403 });
      if (existing.durum !== "onaylandi")
        return NextResponse.json({ ok: false, error: "Sadece onaylanmış hakedişler ödendi işaretlenebilir" }, { status: 400 });

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

      return NextResponse.json({ ok: true });
    }

    if (body.action === "iptal") {
      if (!hasPermission(user, "hakedis:reject"))
        return NextResponse.json({ ok: false, error: "İptal yetkiniz yok" }, { status: 403 });
      if (!["taslak", "tahakkuk"].includes(existing.durum))
        return NextResponse.json({ ok: false, error: "Sadece taslak/tahakkuk durumundaki hakedişler iptal edilebilir" }, { status: 400 });

      await db.prepare(`UPDATE hakedis SET durum = 'iptal', updated_at = ? WHERE id = ?`).run(now, id);
      return NextResponse.json({ ok: true });
    }

    // ── Genel güncelleme (sadece taslak) ─────────────────────────────
    if (!hasPermission(user, "hakedis:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    if (existing.durum !== "taslak")
      return NextResponse.json({ ok: false, error: "Sadece taslak hakedişler düzenlenebilir" }, { status: 400 });

    const brut = parseFloat(body.brut_tutar ?? existing.brut_tutar);
    const kdvOrani = parseFloat(body.kdv_orani ?? existing.kdv_orani);
    const tevkifatOrani = parseFloat(body.tevkifat_orani ?? existing.tevkifat_orani);
    const kdvTutari = Math.round(brut * kdvOrani) / 100;
    const tevkifatTutari = Math.round(brut * tevkifatOrani) / 100;
    const netTutar = Math.round((brut + kdvTutari - tevkifatTutari) * 100) / 100;

    await db.prepare(
      `UPDATE hakedis SET
         vehicle_id = ?, donem_baslangic = ?, donem_bitis = ?, form_tipi_id = ?,
         brut_tutar = ?, kdv_orani = ?, kdv_tutari = ?, tevkifat_orani = ?, tevkifat_tutari = ?, net_tutar = ?,
         aciklama = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      body.vehicle_id ?? existing.vehicle_id,
      body.donem_baslangic ?? existing.donem_baslangic,
      body.donem_bitis ?? existing.donem_bitis,
      body.form_tipi_id ?? existing.form_tipi_id,
      brut, kdvOrani, kdvTutari, tevkifatOrani, tevkifatTutari, netTutar,
      body.aciklama ?? existing.aciklama, now, id,
    );

    return NextResponse.json({ ok: true });
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
    const db = getDb();
    const existing = await db.prepare(`SELECT durum FROM hakedis WHERE id = ?`).get<{ durum: string }>(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });
    if (existing.durum !== "taslak")
      return NextResponse.json({ ok: false, error: "Sadece taslak hakedişler silinebilir" }, { status: 400 });

    await db.prepare(`DELETE FROM hakedis WHERE id = ?`).run(id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
