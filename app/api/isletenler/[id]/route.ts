import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "isleten:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();

    // bkz. /api/isletenler route.ts — arac_sayisi/cari_bakiye'yi aynı GROUP BY'da
    // JOIN'lemek fan-out'tan bakiyeyi araç sayısıyla çarpıyordu, korele alt
    // sorgulara ayrıldı.
    const isleten = await db.prepare(
      `SELECT i.*,
              (SELECT COALESCE(SUM(ic.para_girisi) - SUM(ic.para_cikisi), 0) FROM isleten_cari ic
                WHERE ic.isleten_id = i.id) AS cari_bakiye,
              (SELECT COUNT(DISTINCT ai.vehicle_id) FROM arac_isleten ai
                WHERE ai.isleten_id = i.id AND ai.bitis_tarihi IS NULL) AS arac_sayisi
       FROM isleten i
       WHERE i.id = ?`
    ).get(id);

    if (!isleten) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });
    return NextResponse.json({ ok: true, data: isleten });
  } catch (e) { return apiError(e); }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "isleten:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const now = nowIso();

    const existing = await db.prepare(`SELECT * FROM isleten WHERE id = ?`).get<Record<string, unknown>>(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    await db.prepare(
      `UPDATE isleten SET
         unvan = ?, vergi_no = ?, tc_no = ?, vergi_dairesi = ?,
         cep_tel = ?, is_tel = ?, ev_tel = ?, email = ?,
         cari_kod = ?, kayitli_oda = ?,
         sozlesme_baslangic = ?, sozlesme_bitis = ?,
         ana_isleten = ?, surucu_mu = ?, ruhsat_sahibi_mi = ?,
         tevkifat_durumu = ?, yakit_kredi_orani = ?,
         banka_adi = ?, banka_sube = ?, banka_iban = ?,
         aciklama = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      body.unvan, body.vergi_no || null, body.tc_no || null, body.vergi_dairesi || null,
      body.cep_tel, body.is_tel || null, body.ev_tel || null, body.email || null,
      body.cari_kod, body.kayitli_oda || null,
      body.sozlesme_baslangic || null, body.sozlesme_bitis || null,
      body.ana_isleten ? 1 : 0, body.surucu_mu ? 1 : 0, body.ruhsat_sahibi_mi ? 1 : 0,
      body.tevkifat_durumu || "tum_araclar", body.yakit_kredi_orani || null,
      body.banka_adi || null, body.banka_sube || null, body.banka_iban || null,
      body.aciklama || null, now,
      id,
    );

    await logAudit({ actorUserId: user.id, action: "isleten.update", entityType: "isleten", entityId: id,
      details: { before: existing, after: { ...existing, ...body, updated_at: now } } });

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
    if (!hasPermission(user, "isleten:deactivate"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    const now = nowIso();

    const existing = await db.prepare(`SELECT * FROM isleten WHERE id = ?`).get<Record<string, unknown> & { is_active: number }>(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });
    if (!existing.is_active) return NextResponse.json({ ok: true });

    await db.prepare(`UPDATE isleten SET is_active = 0, updated_at = ? WHERE id = ?`).run(now, id);
    await logAudit({ actorUserId: user.id, action: "isleten.deactivate", entityType: "isleten", entityId: id,
      details: { before: existing, after: { ...existing, is_active: 0, updated_at: now } } });
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
