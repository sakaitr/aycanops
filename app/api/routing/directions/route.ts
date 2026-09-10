import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { valhallaRoute } from "@/lib/routing";

// POST /api/routing/directions — self-hosted Valhalla ile yol geometrisi.
// Client bileşenleri (RouteMap / RouteMapEditor / RouteFullMap /
// guzergahlar-rota) sadece bu endpoint'i çağırır; harici API/anahtar yok.
// Rota bulunamazsa data:null döner, çağıran taraf düz çizgiye düşer.
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const body = await req.json();
    const points: { lat: number; lng: number }[] = body?.points;
    if (!Array.isArray(points) || points.length < 2) {
      return NextResponse.json({ ok: false, error: "En az 2 nokta gerekli" }, { status: 400 });
    }

    const route = await valhallaRoute(
      points
        .filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng))
        .map((p) => ({ lat: p.lat, lng: p.lng })),
    );

    if (!route) return NextResponse.json({ ok: true, data: null });

    return NextResponse.json({
      ok: true,
      data: {
        coordinates: route.coordinates,
        distance: route.distance,
        duration: route.duration,
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
