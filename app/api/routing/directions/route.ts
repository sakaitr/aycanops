import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

// POST /api/routing/directions — sunucu tarafında OpenRouteService Directions
// API'sini çağırır. Key tarayıcıya asla gitmez (client sadece bu endpoint'i
// çağırır); RouteMap/RouteMapEditor/RouteFullMap/guzergahlar-rota'daki 4 ayrı
// OSRM demo çağrısının yerine geçer (bkz. router.project-osrm.org — halka açık,
// production için uygun değil).
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const apiKey = process.env.ORS_API_KEY;
    if (!apiKey) return NextResponse.json({ ok: false, error: "Routing servisi yapılandırılmamış" }, { status: 500 });

    const body = await req.json();
    const points: { lat: number; lng: number }[] = body?.points;
    if (!Array.isArray(points) || points.length < 2) {
      return NextResponse.json({ ok: false, error: "En az 2 nokta gerekli" }, { status: 400 });
    }

    const res = await fetch("https://api.openrouteservice.org/v2/directions/driving-car/geojson", {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ coordinates: points.map(p => [p.lng, p.lat]) }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      // ORS 2xx dışı bir kod verirse (ör. koordinatlar yol ağının çok dışında,
      // rota bulunamadı) — sessizce boş dönüyoruz, çağıran taraf düz çizgiye düşer.
      return NextResponse.json({ ok: true, data: null });
    }

    const geojson = await res.json();
    const feature = geojson?.features?.[0];
    if (!feature) return NextResponse.json({ ok: true, data: null });

    const coordinates: [number, number][] = feature.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng]
    );
    const summary = feature.properties?.summary || {};

    return NextResponse.json({
      ok: true,
      data: { coordinates, distance: summary.distance ?? null, duration: summary.duration ?? null },
    });
  } catch (e) { return apiError(e); }
}
