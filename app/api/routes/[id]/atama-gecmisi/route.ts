import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "routes:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();

    const rows = await db.prepare(
      `SELECT g.*, v.plate, v.brand, v.model,
              d.name AS driver_name, c.name AS company_name,
              u.full_name AS created_by_name
       FROM guzergah_atama_gecmisi g
       JOIN vehicles v ON v.id = g.vehicle_id
       LEFT JOIN drivers d ON d.id = g.driver_id
       LEFT JOIN companies c ON c.id = g.company_id
       LEFT JOIN users u ON u.id = g.created_by
       WHERE g.route_id = ?
       ORDER BY g.bitis_tarihi IS NULL DESC, g.baslangic_tarihi DESC`
    ).all(id);

    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "routes:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();

    if (!body.vehicle_id) return NextResponse.json({ ok: false, error: "Araç seçiniz" }, { status: 400 });
    if (!body.baslangic_tarihi) return NextResponse.json({ ok: false, error: "Başlangıç tarihi zorunludur" }, { status: 400 });

    const db = getDb();
    const now = nowIso();
    const hareketTipi: string | null = body.hareket_tipi || null;
    const yon: string | null = body.yon || null; // 'giris' | 'cikis' | null (sabit — ikisi de)

    const route = await db.prepare(`SELECT id, arac_modu FROM routes WHERE id = ?`).get<{ id: string; arac_modu: string }>(id);
    if (!route) return NextResponse.json({ ok: false, error: "Güzergah bulunamadı" }, { status: 404 });
    if (route.arac_modu !== "ayri" && yon)
      return NextResponse.json({ ok: false, error: "Bu güzergah sabit araç modunda — giriş/çıkış için ayrı araç seçilemez" }, { status: 400 });

    // Aynı güzergah + hareket tipi + yön için açık atama varsa kapat
    await db.prepare(
      `UPDATE guzergah_atama_gecmisi SET bitis_tarihi = ?, islem_turu = 'devir'
       WHERE route_id = ? AND (hareket_tipi <=> ?) AND (yon <=> ?) AND bitis_tarihi IS NULL`
    ).run(body.baslangic_tarihi, id, hareketTipi, yon);

    const rowId = uuidv4();
    await db.prepare(
      `INSERT INTO guzergah_atama_gecmisi
         (id, route_id, hareket_tipi, yon, company_id, vehicle_id, driver_id,
          baslangic_tarihi, bitis_tarihi, islem_turu, aciklama, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      rowId, id, hareketTipi, yon,
      body.company_id || null, body.vehicle_id, body.driver_id || null,
      body.baslangic_tarihi, body.bitis_tarihi || null,
      body.islem_turu || "atama", body.aciklama || null,
      user.id, now,
    );

    // Hareket tipi belirtilmemişse (genel/varsayılan atama), routes tablosundaki
    // güncel önbellek alanlarını da senkron tutuyoruz — mevcut fiyat/açık güzergah
    // sistemleri hâlâ routes.vehicle_id'ye bakıyor. Yön belirtilmişse (giriş/çıkış
    // ayrı araçlı güzergah) bu senkronu atlıyoruz — tek plaka önbelleği yetersiz kalır.
    if (!hareketTipi && !yon) {
      const driver = body.driver_id
        ? await db.prepare(`SELECT name, phone FROM drivers WHERE id = ?`).get<{ name: string; phone: string | null }>(body.driver_id)
        : null;
      await db.prepare(
        `UPDATE routes SET vehicle_id = ?, driver_id = ?, driver_name = ?, driver_phone = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        body.vehicle_id, body.driver_id || null,
        driver?.name || null, driver?.phone || null,
        now, id,
      );
    }

    return NextResponse.json({ ok: true, data: { id: rowId } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
