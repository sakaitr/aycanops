import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { ensureCompanyVehicle } from "@/lib/company-vehicles";
import { transactionStore } from "@/lib/transaction-store";
import { logAudit } from "@/lib/audit";

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

    const now = nowIso();
    const created: string[] = [];
    const skipped: { route_id: string; reason: string; existing_id?: string; status?: string }[] = [];

    await getDb().transaction(async (conn) => {
      const db = transactionStore(conn);
      // A stable parent lock also protects the case where no service row exists yet.
      for (const entry of [...entries].sort((a, b) => String(a.route_id).localeCompare(String(b.route_id)))) {
        if (!entry.route_id || !entry.vehicle_id || !entry.hareket_tipi) {
          skipped.push({ route_id: entry.route_id || "—", reason: "Vardiya adı boş — güzergahta vardiya tanımlı olmayabilir" });
          continue;
        }
        const yon = entry.yon || null;
        const route = await db.prepare("SELECT company_id FROM routes WHERE id = ? FOR UPDATE")
          .get<{ company_id: string | null }>(entry.route_id);
        if (!route) {
          skipped.push({ route_id: entry.route_id, reason: "Güzergah bulunamadı" });
          continue;
        }

        if (user.allowed_companies) {
          const allowed: string[] = JSON.parse(user.allowed_companies);
          if (!route || !route.company_id || !allowed.includes(route.company_id)) {
            skipped.push({ route_id: entry.route_id, reason: "Bu güzergaha erişim yetkiniz yok" });
            continue;
          }
        }

        // Aynı gün + güzergah + vardiya + yön için zaten iptal olmayan kayıt varsa atla
        const existing = await db.prepare(
          `SELECT id, durum FROM cetele WHERE route_id = ? AND tarih = ? AND hareket_tipi = ? AND (yon <=> ?) AND durum != 'iptal' FOR UPDATE`
        ).get<{ id: string; durum: string }>(entry.route_id, tarih, entry.hareket_tipi, yon);
        if (existing) {
          skipped.push({ route_id: entry.route_id, existing_id: existing.id, status: existing.durum,
            reason: existing.durum === "bekliyor" ? "Bekleyen kayıt var; mevcut kayıt ayrıca onaylanmalıdır" : "Zaten kayıt var" });
          continue;
        }

        // Kalıcı araç değişimi istenmişse güzergahın atanmış aracını güncelle
        if (entry.kalici_degisim) {
          await db.prepare(`UPDATE routes SET vehicle_id = ?, updated_at = ? WHERE id = ?`)
            .run(entry.vehicle_id, now, entry.route_id);
          const r = await db.prepare(`SELECT company_id FROM routes WHERE id = ?`).get<{ company_id: string | null }>(entry.route_id);
          await ensureCompanyVehicle(r?.company_id, entry.vehicle_id, conn);
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
        await logAudit({ actorUserId: user.id, action: "cetele.bulk_approve", entityType: "cetele", entityId: id,
          details: { before: null, after: { id, ...entry, yon, tarih, durum: "onaylandi" } } }, conn);
      }
    });

    return NextResponse.json({
      ok: true,
      data: { created: created.length, skipped },
    }, { status: 201 });
  } catch (e) { return apiError(e); }
}
