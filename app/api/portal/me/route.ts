import { NextRequest, NextResponse } from "next/server";
import { requirePortalUser } from "@/lib/portal-auth";
import { apiError } from "@/lib/api-error";

export async function GET(_req: NextRequest) {
  try {
    const portalUser = await requirePortalUser();
    if (!portalUser) {
      return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    }
    return NextResponse.json({ ok: true, data: portalUser });
  } catch (e) {
    return apiError(e);
  }
}
