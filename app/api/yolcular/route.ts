import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { geocodeAddress } from "@/lib/geocode";

const VALID_TYPES = ["yolcu", "personel", "musteri"] as const;
const VALID_STATUS = ["aktif", "pasif"] as const;

async function resolvePassengerCoords(pickupAddress: unknown, pickupLat: unknown, pickupLng: unknown) {
  if (pickupLat != null && pickupLng != null && pickupLat !== "" && pickupLng !== "") {
    return { lat: Number(pickupLat), lng: Number(pickupLng), geocoded: false };
  }
  if (typeof pickupAddress !== "string" || !pickupAddress.trim()) return { lat: null, lng: null, geocoded: false };
  try {
    const geo = await geocodeAddress(pickupAddress);
    if (!geo) return { lat: null, lng: null, geocoded: false };
    return { lat: geo.lat, lng: geo.lng, geocoded: true };
  } catch {
    return { lat: null, lng: null, geocoded: false };
  }
}

// GET /api/yolcular?company_id=&type=&status=&q=
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "passengers:read")) {
      return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("company_id");
    const type = searchParams.get("type");
    const status = searchParams.get("status") || "aktif";
    const q = searchParams.get("q");

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (companyId) { conditions.push("p.company_id = ?"); params.push(companyId); }
    const routeId = searchParams.get("route_id");
    if (routeId) { conditions.push("p.route_id = ?"); params.push(routeId); }
    if (type && VALID_TYPES.includes(type as typeof VALID_TYPES[number])) {
      conditions.push("p.type = ?"); params.push(type);
    }
    if (status && VALID_STATUS.includes(status as typeof VALID_STATUS[number])) {
      conditions.push("p.status = ?"); params.push(status);
    }
    if (q) {
      conditions.push("(p.full_name LIKE ? OR p.phone LIKE ? OR p.email LIKE ?)");
      const like = `%${q}%`;
      params.push(like, like, like);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const db = getDb();
    const rows = await db.prepare(`
      SELECT p.*, f.name AS company_name
      FROM passengers p
      LEFT JOIN companies f ON f.id = p.company_id
      ${where}
      ORDER BY p.full_name ASC
      LIMIT 500
    `).all(...params);

    return NextResponse.json({ ok: true, data: rows });
  } catch (e) {
    return apiError(e);
  }
}

// POST /api/yolcular  — single object OR array for bulk insert
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "passengers:create")) {
      return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
    }

    const body = await req.json();

    // Bulk insert: body is an array
    if (Array.isArray(body)) {
      if (body.length === 0) return NextResponse.json({ ok: true, count: 0 }, { status: 201 });
      if (body.length > 500) {
        return NextResponse.json({ error: "En fazla 500 kayıt eklenebilir" }, { status: 400 });
      }

      const db = getDb();
      const now = nowIso();
      let count = 0;
      let geocoded = 0;

      const stmt = db.prepare(`
        INSERT INTO passengers
          (id, company_id, full_name, phone, email, id_number, type,
           pickup_address, pickup_lat, pickup_lng, dropoff_address, route_id, notes, status, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of body) {
        const {
          full_name, phone, email, id_number, type = "yolcu",
          company_id, pickup_address, pickup_lat, pickup_lng, dropoff_address, route_id, notes, status = "aktif",
        } = item;

        if (!full_name || typeof full_name !== "string" || full_name.trim().length === 0) continue;
        if (!VALID_TYPES.includes(type)) continue;
        const coords = await resolvePassengerCoords(pickup_address, pickup_lat, pickup_lng);

        await stmt.run(
          uuidv4(), company_id ?? null, full_name.trim(),
          phone ?? null, email ?? null, id_number ?? null, type,
          pickup_address ?? null, coords.lat, coords.lng, dropoff_address ?? null,
          route_id ?? null, notes ?? null,
          VALID_STATUS.includes(status) ? status : "aktif",
          user.id, now, now
        );
        count++;
        if (coords.geocoded) geocoded++;
      }

      return NextResponse.json({ ok: true, count, geocoded }, { status: 201 });
    }

    // Single insert
    const {
      full_name, phone, email, id_number, type = "yolcu",
      company_id, pickup_address, pickup_lat, pickup_lng, dropoff_address, route_id, notes, status = "aktif",
      sinif, sube, barkod_no, odeme_plani_id, sozlesme_durumu = "yok", hizmet_durumu = "aktif",
    } = body;

    if (!full_name || typeof full_name !== "string" || full_name.trim().length === 0) {
      return NextResponse.json({ error: "Ad Soyad gerekli" }, { status: 400 });
    }
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: "Geçersiz tür" }, { status: 400 });
    }

    const db = getDb();
    const now = nowIso();
    const id = uuidv4();
    const coords = await resolvePassengerCoords(pickup_address, pickup_lat, pickup_lng);

    await db.prepare(`
      INSERT INTO passengers
        (id, company_id, full_name, phone, email, id_number, type,
         pickup_address, pickup_lat, pickup_lng, dropoff_address, route_id, notes, status,
         sinif, sube, barkod_no, odeme_plani_id, sozlesme_durumu, hizmet_durumu,
         created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, company_id ?? null, full_name.trim(),
      phone ?? null, email ?? null, id_number ?? null, type,
      pickup_address ?? null, coords.lat, coords.lng, dropoff_address ?? null,
      route_id ?? null, notes ?? null,
      status,
      sinif ?? null, sube ?? null, barkod_no ?? null, odeme_plani_id ?? null, sozlesme_durumu, hizmet_durumu,
      user.id, now, now
    );

    return NextResponse.json({ ok: true, id, geocoded: coords.geocoded }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
