import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { hasPermission } from "@/lib/permissions";
import { geocodeAddress, normalizeGeocodeQuery } from "@/lib/geocode";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "map:geocode")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const query = new URL(req.url).searchParams.get("q") || "";
    if (!query.trim()) return NextResponse.json({ ok: false, error: "Adres zorunludur" }, { status: 400 });
    const normalized = normalizeGeocodeQuery(query);
    const db = getDb();
    const cached = await db.prepare("SELECT * FROM geocode_cache WHERE normalized_query = ? ORDER BY provider = 'arcgis' DESC, updated_at DESC LIMIT 1").get(normalized);
    if (cached) return NextResponse.json({ ok: true, data: cached, cached: true });

    const result = await geocodeAddress(query);
    if (!result) return NextResponse.json({ ok: false, error: "Adres bulunamadı" }, { status: 404 });
    return NextResponse.json({ ok: true, data: { query_text: query, normalized_query: normalized, lat: result.lat, lng: result.lng, provider: result.provider || "geocode", confidence: result.confidence }, cached: result.cached ?? false });
  } catch (e) { return apiError(e); }
}
