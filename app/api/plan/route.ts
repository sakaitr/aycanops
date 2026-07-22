import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { planRoutes, type PlanInput, type PlanPersonnel, type PlanVehicle } from "@/lib/planner";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    }

    const body = await req.json() as Partial<PlanInput>;

    if (!Array.isArray(body.personnel) || !Array.isArray(body.vehicles) || body.vehicles.length === 0) {
      return NextResponse.json(
        { ok: false, error: "personnel ve vehicles array gerekli" },
        { status: 400 },
      );
    }

    // Validate & sanitize personnel
    const validPersonnel: PlanPersonnel[] = body.personnel.filter(
      (p): p is PlanPersonnel =>
        typeof p?.id === "string" &&
        typeof p?.name === "string" &&
        typeof p?.lat === "number" &&
        typeof p?.lng === "number" &&
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lng),
    );

    if (validPersonnel.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Koordinatı olan personel bulunamadı" },
        { status: 400 },
      );
    }

    // Validate & sanitize vehicles
    const validVehicles: PlanVehicle[] = body.vehicles.filter(
      (v): v is PlanVehicle =>
        typeof v?.id === "string" &&
        typeof v?.label === "string" &&
        typeof v?.capacity === "number" &&
        v.capacity > 0 &&
        typeof v?.depot_lat === "number" &&
        typeof v?.depot_lng === "number" &&
        Number.isFinite(v.depot_lat) &&
        Number.isFinite(v.depot_lng),
    );

    if (validVehicles.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Geçerli araç bulunamadı (kapasite > 0 ve koordinat gerekli)" },
        { status: 400 },
      );
    }

    if (validPersonnel.length + validVehicles.length > 98) {
      return NextResponse.json(
        { ok: false, error: `Çok fazla nokta. Personel + araç toplamı 98'i geçemez (şu an: ${validPersonnel.length + validVehicles.length}).` },
        { status: 400 },
      );
    }

    const result = await planRoutes({
      personnel: validPersonnel,
      vehicles: validVehicles,
      max_duration: typeof body.max_duration === "number" ? body.max_duration : undefined,
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Planlama hatası";
    console.error("[api/plan] error:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
