import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";
import { nowIso } from "@/lib/time";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "passengers:read")) {
      return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
    }

    const { id } = await params;
    const db = getDb();
    const row = await db.prepare(`
      SELECT p.*, f.name AS company_name
      FROM passengers p
      LEFT JOIN companies f ON f.id = p.company_id
      WHERE p.id = ?
    `).get(id);

    if (!row) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    return NextResponse.json({ ok: true, data: row });
  } catch (e) {
    return apiError(e);
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "passengers:update")) {
      return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
    }

    const { id } = await params;
    const db = getDb();
    const existing = await db.prepare(`SELECT id FROM passengers WHERE id = ?`).get(id);
    if (!existing) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

    const body = await req.json();
    const {
      full_name, phone, email, id_number, type,
      company_id, pickup_address, pickup_lat, pickup_lng, dropoff_address, route_id, notes, status,
      sinif, sube, barkod_no, odeme_plani_id, sozlesme_durumu, hizmet_durumu,
    } = body;

    if (!full_name || full_name.trim().length === 0) {
      return NextResponse.json({ error: "Ad Soyad gerekli" }, { status: 400 });
    }

    await db.prepare(`
      UPDATE passengers SET
        full_name = ?, phone = ?, email = ?, id_number = ?, type = ?,
        company_id = ?, pickup_address = ?, pickup_lat = ?, pickup_lng = ?,
        dropoff_address = ?, route_id = ?, notes = ?,
        status = ?, sinif = ?, sube = ?, barkod_no = ?, odeme_plani_id = ?,
        sozlesme_durumu = ?, hizmet_durumu = ?, updated_at = ?
      WHERE id = ?
    `).run(
      full_name.trim(), phone ?? null, email ?? null, id_number ?? null, type ?? "yolcu",
      company_id ?? null, pickup_address ?? null, pickup_lat ?? null, pickup_lng ?? null,
      dropoff_address ?? null, route_id ?? null, notes ?? null,
      status ?? "aktif",
      sinif ?? null, sube ?? null, barkod_no ?? null, odeme_plani_id ?? null,
      sozlesme_durumu ?? "yok", hizmet_durumu ?? "aktif",
      nowIso(), id
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "passengers:update")) {
      return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
    }

    const { id } = await params;
    const db = getDb();
    await db.prepare(`DELETE FROM passengers WHERE id = ?`).run(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
