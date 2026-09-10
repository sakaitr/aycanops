import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { logAudit } from "@/lib/audit";
import { normalizeName } from "@/lib/vardiya";

interface AracSatir {
  tabela: string;
  plaka: string;
  sofor?: string;
}

// POST /api/vardiya-eslestirme/arac-listesi
// Faz 0 — ops'un elindeki "araç listesi"ni (tabela + plaka + şoför) sisteme
// aktarır: routes.name eşleşmesi → routes.vehicle_id + yeni açık
// guzergah_atama_gecmisi satırı (eski açık satır kapatılır, geçmiş korunur).
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "routes:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    const companyId: string = body?.company_id || "";
    const satirlar: AracSatir[] = Array.isArray(body?.satirlar) ? body.satirlar : [];
    const apply: boolean = body?.apply === true;

    if (!companyId) return NextResponse.json({ ok: false, error: "company_id zorunlu" }, { status: 400 });
    if (satirlar.length === 0)
      return NextResponse.json({ ok: false, error: "Satır yok" }, { status: 400 });

    if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(companyId))
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
    }

    const db = getDb();

    const routes = await db
      .prepare(`SELECT id, name FROM routes WHERE company_id = ? AND is_active = 1`)
      .all<{ id: string; name: string }>(companyId);
    const routeByNorm = new Map(routes.map((r) => [normalizeName(r.name), r]));

    const vehicles = await db
      .prepare(`SELECT id, plate FROM vehicles`)
      .all<{ id: string; plate: string }>();
    const vehicleByPlate = new Map(
      vehicles.map((v) => [v.plate.replace(/\s+/g, "").toUpperCase(), v]),
    );

    const drivers = await db
      .prepare(`SELECT id, name FROM drivers WHERE status = 'aktif'`)
      .all<{ id: string; name: string }>();
    const driverByNorm = new Map(drivers.map((d) => [normalizeName(d.name), d]));

    const now = nowIso();
    const bugun = now.slice(0, 10);

    const sonuc: Array<{
      tabela: string;
      plaka: string;
      durum: "eslesti" | "tabela_yok" | "arac_yok";
      route_id?: string;
      vehicle_id?: string;
      driver_id?: string | null;
    }> = [];

    let uygulanan = 0;

    for (const s of satirlar) {
      const tabelaNorm = normalizeName(s.tabela || "");
      const plakaKey = (s.plaka || "").replace(/\s+/g, "").toUpperCase();
      const route = routeByNorm.get(tabelaNorm);
      const vehicle = vehicleByPlate.get(plakaKey);
      const driver = s.sofor ? driverByNorm.get(normalizeName(s.sofor)) : undefined;

      if (!route) {
        sonuc.push({ tabela: s.tabela, plaka: s.plaka, durum: "tabela_yok" });
        continue;
      }
      if (!vehicle) {
        sonuc.push({ tabela: s.tabela, plaka: s.plaka, durum: "arac_yok", route_id: route.id });
        continue;
      }

      sonuc.push({
        tabela: s.tabela,
        plaka: s.plaka,
        durum: "eslesti",
        route_id: route.id,
        vehicle_id: vehicle.id,
        driver_id: driver?.id ?? null,
      });

      if (!apply) continue;

      await db.transaction(async (conn) => {
        // Açık atama varsa kapat (genel/varsayılan slot — hareket_tipi & yon null)
        await conn.execute(
          `UPDATE guzergah_atama_gecmisi SET bitis_tarihi = ?, islem_turu = 'devir'
           WHERE route_id = ? AND hareket_tipi IS NULL AND yon IS NULL AND bitis_tarihi IS NULL`,
          [bugun, route.id],
        );
        await conn.execute(
          `INSERT INTO guzergah_atama_gecmisi
             (id, route_id, hareket_tipi, yon, company_id, vehicle_id, driver_id,
              baslangic_tarihi, bitis_tarihi, islem_turu, aciklama, created_by, created_at)
           VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, NULL, 'atama', ?, ?, ?)`,
          [
            uuidv4(),
            route.id,
            companyId,
            vehicle.id,
            driver?.id ?? null,
            bugun,
            "Araç listesi içe aktarımı",
            user.id,
            now,
          ],
        );
        await conn.execute(
          `UPDATE routes SET vehicle_id = ?, driver_id = ?, driver_name = ?, updated_at = ? WHERE id = ?`,
          [vehicle.id, driver?.id ?? null, driver?.name ?? null, now, route.id],
        );
      });
      uygulanan += 1;
    }

    if (apply) {
      await logAudit({
        actorUserId: user.id,
        action: "vardiya.arac_listesi_import",
        entityType: "routes",
        entityId: null,
        details: { company_id: companyId, satir: satirlar.length, uygulanan },
      });
    }

    return NextResponse.json({
      ok: true,
      data: {
        applied: apply,
        uygulanan,
        ozet: {
          eslesti: sonuc.filter((x) => x.durum === "eslesti").length,
          tabela_yok: sonuc.filter((x) => x.durum === "tabela_yok").length,
          arac_yok: sonuc.filter((x) => x.durum === "arac_yok").length,
        },
        sonuc,
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
