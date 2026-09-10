import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { hasPermission } from "@/lib/permissions";
import { normalizeName, resolveName, type CandidatePassenger, type MatchResult } from "@/lib/vardiya";

interface RouteRow {
  id: string;
  name: string;
  vehicle_id: string | null;
  vehicle_plate: string | null;
  driver_name: string | null;
}

// POST /api/vardiya-eslestirme/match
// Girdi: { company_id, isimler: string[] }  (ya da { company_id, metin: "..." })
// DB'ye yazmaz. Her ismi exact → alias cache → bulanık aday olarak çözer,
// sonucu tabelaya (routes.name) göre gruplar.
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "passengers:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    const companyId: string = body?.company_id || "";
    if (!companyId) return NextResponse.json({ ok: false, error: "company_id zorunlu" }, { status: 400 });

    if (user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(companyId))
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
    }

    let isimler: string[] = Array.isArray(body?.isimler) ? body.isimler : [];
    if (isimler.length === 0 && typeof body?.metin === "string") {
      isimler = body.metin.split(/\r?\n/);
    }
    isimler = isimler.map((s) => String(s).trim()).filter(Boolean);
    if (isimler.length === 0)
      return NextResponse.json({ ok: false, error: "İsim listesi boş" }, { status: 400 });
    if (isimler.length > 2000)
      return NextResponse.json({ ok: false, error: "Tek listede en fazla 2000 isim" }, { status: 400 });

    const db = getDb();

    // Firmanın aktif yolcuları
    const pRows = await db
      .prepare(
        `SELECT id, full_name, route_id FROM passengers
         WHERE company_id = ? AND status = 'aktif'`,
      )
      .all<{ id: string; full_name: string; route_id: string | null }>(companyId);

    const passengers: CandidatePassenger[] = pRows.map((p) => ({
      id: p.id,
      full_name: p.full_name,
      normalized: normalizeName(p.full_name),
      route_id: p.route_id,
    }));
    const passengerById = new Map(passengers.map((p) => [p.id, p]));

    // Alias cache (company scope)
    const aRows = await db
      .prepare(`SELECT ham_ad_normalize, passenger_id FROM vardiya_alias WHERE company_id = ?`)
      .all<{ ham_ad_normalize: string; passenger_id: string }>(companyId);
    const aliasMap = new Map(aRows.map((a) => [a.ham_ad_normalize, a.passenger_id]));

    // Tabelalar (routes) + güncel araç/şoför
    const rRows = await db
      .prepare(
        `SELECT r.id, r.name, r.vehicle_id, v.plate AS vehicle_plate,
                COALESCE(r.driver_name, d.name) AS driver_name
         FROM routes r
         LEFT JOIN vehicles v ON v.id = r.vehicle_id
         LEFT JOIN drivers d ON d.id = r.driver_id
         WHERE r.company_id = ? AND r.is_active = 1`,
      )
      .all<RouteRow>(companyId);
    const routeById = new Map(rRows.map((r) => [r.id, r]));

    // Çöz
    const seen = new Set<string>();
    const results: MatchResult[] = [];
    for (const ham of isimler) {
      const key = normalizeName(ham);
      if (seen.has(key)) continue; // aynı listede tekrar eden ismi bir kez işle
      seen.add(key);
      results.push(resolveName(ham, aliasMap, passengers, passengerById));
    }

    // Tabelaya göre grupla
    const gruplar: Record<
      string,
      { route_id: string; route_name: string; vehicle_plate: string | null; driver_name: string | null; kisiler: MatchResult[] }
    > = {};
    const aksiyonGerekli: MatchResult[] = [];

    for (const r of results) {
      if ((r.durum === "exact" || r.durum === "alias") && r.route_id) {
        const route = routeById.get(r.route_id);
        const gk = r.route_id;
        if (!gruplar[gk]) {
          gruplar[gk] = {
            route_id: r.route_id,
            route_name: route?.name ?? "(bilinmeyen tabela)",
            vehicle_plate: route?.vehicle_plate ?? null,
            driver_name: route?.driver_name ?? null,
            kisiler: [],
          };
        }
        gruplar[gk].kisiler.push(r);
      } else {
        // eşleşti ama tabelası yok / bulanık / bulunamadı
        aksiyonGerekli.push(r);
      }
    }

    const ozet = {
      toplam: results.length,
      exact: results.filter((r) => r.durum === "exact").length,
      alias: results.filter((r) => r.durum === "alias").length,
      fuzzy: results.filter((r) => r.durum === "fuzzy").length,
      bulunamadi: results.filter((r) => r.durum === "bulunamadi").length,
      tabelasiz: results.filter((r) => (r.durum === "exact" || r.durum === "alias") && !r.route_id).length,
    };

    return NextResponse.json({
      ok: true,
      data: {
        company_id: companyId,
        ozet,
        gruplar: Object.values(gruplar).sort((a, b) => b.kisiler.length - a.kisiler.length),
        aksiyon_gerekli: aksiyonGerekli,
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
