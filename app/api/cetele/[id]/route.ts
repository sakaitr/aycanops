import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

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

    const existing = await db.prepare(`SELECT * FROM cetele WHERE id = ?`).get<any>(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      const access = await db.prepare(
        `SELECT 1 FROM company_vehicles cv WHERE cv.vehicle_id = ? AND cv.company_id IN (${allowed.map(() => "?").join(",") || "NULL"})`
      ).get(existing.vehicle_id, ...allowed);
      if (!access) return NextResponse.json({ ok: false, error: "Bu kayda erişim yetkiniz yok" }, { status: 403 });
    }

    // Onaylama / iptal işlemi
    if (body.action === "onayla") {
      if (!hasPermission(user, "cetele:approve"))
        return NextResponse.json({ ok: false, error: "Onaylama yetkiniz yok" }, { status: 403 });
      if (existing.durum !== "bekliyor")
        return NextResponse.json({ ok: false, error: "Sadece bekleyen kayıtlar onaylanabilir" }, { status: 400 });

      await db.prepare(
        `UPDATE cetele SET durum = 'onaylandi', onaylayan = ?, onay_tarihi = ?, updated_at = ? WHERE id = ?`
      ).run(user.id, now, now, id);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "iptal") {
      if (!hasPermission(user, "cetele:cancel"))
        return NextResponse.json({ ok: false, error: "İptal yetkiniz yok" }, { status: 403 });

      await db.prepare(
        `UPDATE cetele SET durum = 'iptal', geri_alma_nedeni = ?, updated_at = ? WHERE id = ?`
      ).run(body.geri_alma_nedeni || null, now, id);
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
    const db = getDb();

    const existing = await db.prepare(`SELECT durum, vehicle_id FROM cetele WHERE id = ?`).get<{ durum: string; vehicle_id: string }>(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      const access = await db.prepare(
        `SELECT 1 FROM company_vehicles cv WHERE cv.vehicle_id = ? AND cv.company_id IN (${allowed.map(() => "?").join(",") || "NULL"})`
      ).get(existing.vehicle_id, ...allowed);
      if (!access) return NextResponse.json({ ok: false, error: "Bu kayda erişim yetkiniz yok" }, { status: 403 });
    }

    if (existing.durum !== "bekliyor")
      return NextResponse.json({ ok: false, error: "Sadece bekleyen kayıtlar silinebilir" }, { status: 400 });

    await db.prepare(`DELETE FROM cetele WHERE id = ?`).run(id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
