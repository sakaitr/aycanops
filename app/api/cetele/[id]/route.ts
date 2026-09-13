import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { cancelCetele, deleteCetele } from "@/lib/cetele-cancel";
import { transactionStore } from "@/lib/transaction-store";
import { logAudit } from "@/lib/audit";
import { assertCeteleAccess } from "@/lib/company-access";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    if (body.action === "iptal") {
      if (!hasPermission(user, "cetele:cancel"))
        return NextResponse.json({ ok: false, error: "İptal yetkiniz yok" }, { status: 403 });
      await cancelCetele(id, body.geri_alma_nedeni, user);
      return NextResponse.json({ ok: true });
    }
    return await getDb().transaction(async conn => {
      const db = transactionStore(conn);
      const now = nowIso();

      const existing = await db.prepare(`SELECT * FROM cetele WHERE id = ? FOR UPDATE`).get<any>(id);
      if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });
      await assertCeteleAccess(db, user, existing);

      // Onaylama / iptal işlemi
      if (body.action === "onayla") {
        if (!hasPermission(user, "cetele:approve"))
          return NextResponse.json({ ok: false, error: "Onaylama yetkiniz yok" }, { status: 403 });
        if (existing.durum !== "bekliyor")
          return NextResponse.json({ ok: false, error: "Sadece bekleyen kayıtlar onaylanabilir" }, { status: 400 });

        await db.prepare(
          `UPDATE cetele SET durum = 'onaylandi', onaylayan = ?, onay_tarihi = ?, updated_at = ? WHERE id = ?`
        ).run(user.id, now, now, id);
        await logAudit({ actorUserId: user.id, action: "cetele.approve", entityType: "cetele", entityId: id,
          details: { before: existing, after: { ...existing, durum: "onaylandi", onaylayan: user.id, onay_tarihi: now, updated_at: now } } }, conn);
        return NextResponse.json({ ok: true });
      }

      // Genel güncelleme
      if (!hasPermission(user, "cetele:update"))
        return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
      if (existing.durum !== "bekliyor")
        return NextResponse.json({ ok: false, error: "Sadece bekleyen kayıtlar düzenlenebilir" }, { status: 400 });

      await db.prepare(
        `UPDATE cetele SET
           vehicle_id = ?, route_id = ?, tarih = ?, hareket_tipi = ?,
           yolcu_sayisi = ?, aciklama = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        body.vehicle_id ?? existing.vehicle_id,
        body.route_id ?? existing.route_id,
        body.tarih ?? existing.tarih,
        body.hareket_tipi ?? existing.hareket_tipi,
        body.yolcu_sayisi ?? existing.yolcu_sayisi,
        body.aciklama ?? existing.aciklama,
        now, id,
      );

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
    if (!hasPermission(user, "cetele:cancel"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    await deleteCetele(id, user);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
