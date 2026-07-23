import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";

// Sadece nav_config:update iznine sahip biri (yani admin) izin
// kataloğunu görebilir — admin panelindeki izin seçici dropdown'u için.
export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "nav_config:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const catalog = Object.entries(PERMISSIONS)
      .flatMap(([resource, actions]) => actions.map((a) => `${resource}:${a}`))
      .sort();

    return NextResponse.json({ ok: true, data: catalog });
  } catch (e) { return apiError(e); }
}
