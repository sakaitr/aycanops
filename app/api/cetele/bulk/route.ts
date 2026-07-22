import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

interface BulkEntry {
  route_id: string;
  vehicle_id: string;
  hareket_tipi: string; // güzergahın kendi tanımladığı vardiya adı — her satır farklı olabilir
  yon?: "giris" | "cikis" | null;
  kalici_degisim?: boolean;
}

// Excel-tablosu tarzı toplu onay: seçilen güzergah/araç satırları doğrudan
// "onaylandi" durumunda çetele kaydı olarak işlenir (ön yüzde iki adımlı onay yapıldı).
// Her satır kendi vardiyasını taşır — tek bir global hareket tipi zorunlu değil,
// çünkü güzergahlar artık farklı vardiya adları tanımlayabiliyor.
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "cetele:approve"))
      return NextResponse.json({ ok: false, error: "Toplu onay yetkiniz yok" }, { status: 403 });

    const body = await req.json();
    const tarih: string = body.tarih;
    const entries: BulkEntry[] = Array.isArray(body.entries) ? body.entries : [];

    if (!tarih) return NextResponse.json({ ok: false, error: "Tarih zorunludur" }, { status: 400 });
    if (entries.length === 0) return NextResponse.json({ ok: false, error: "En az bir kayıt seçin" }, { status: 400 });

    const db = getDb();
    const now = nowIso();
    const created: string[] = [];
    const skipped: { route_id: string; reason: string }[] = [];

    for (const entry of entries) {
      if (!entry.route_id || !entry.vehicle_id || !entry.hareket_tipi) {
        skipped.push({ route_id: entry.route_id || "—", reason: "Vardiya adı boş — güzergahta vardiya tanımlı olmayabilir" });
        continue;
      }
      const yon = entry.yon || null;

      if (user.allowed_companies) {
        const allowed: string[] = JSON.parse(user.allowed_companies);
        const route = await db.prepare("SELECT company_id FROM routes WHERE id = ?").get(entry.route_id) as { company_id: string | null } | undefined;
        if (!route || !route.company_id || !allowed.includes(route.company_id)) {
          skipped.push({ route_id: entry.route_id, reason: "Bu güzergaha erişim yetkiniz yok" });
          continue;
        }
      }

      // Aynı gün + güzergah + vardiya + yön için zaten iptal olmayan kayıt varsa atla
      const existing = await db.prepare(
        `SELECT id FROM cetele WHERE route_id = ? AND tarih = ? AND hareket_tipi = ? AND (yon <=> ?) AND durum != 'iptal'`
      ).get<{ id: string }>(entry.route_id, tarih, entry.hareket_tipi, yon);
      if (existing) { skipped.push({ route_id: entry.route_id, reason: "Zaten kayıt var" }); continue; }

      // Kalıcı araç değişimi istenmişse güzergahın atanmış aracını güncelle
      if (entry.kalici_degisim) {
        await db.prepare(`UPDATE routes SET vehicle_id = ?, updated_at = ? WHERE id = ?`)
          .run(entry.vehicle_id, now, entry.route_id);
      }

      const id = uuidv4();
      await db.prepare(
        `INSERT INTO cetele
           (id, vehicle_id, route_id, tarih, hareket_tipi, yon, durum, onaylayan, onay_tarihi,
            created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(
        id, entry.vehicle_id, entry.route_id, tarih, entry.hareket_tipi, yon,
        "onaylandi", user.id, now,
        user.id, now, now,
      );
      created.push(id);
    }

    return NextResponse.json({
      ok: true,
      data: { created: created.length, skipped },
    }, { status: 201 });
  } catch (e) { return apiError(e); }
}
