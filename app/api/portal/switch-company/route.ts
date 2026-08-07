import { NextRequest, NextResponse } from "next/server";
import { requirePortalUser, getPortalSession, switchPortalCompany } from "@/lib/portal-auth";
import { apiError } from "@/lib/api-error";

export async function POST(req: NextRequest) {
  try {
    const portalUser = await requirePortalUser();
    if (!portalUser) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const { company_id } = await req.json();
    if (!company_id) return NextResponse.json({ ok: false, error: "company_id gerekli" }, { status: 400 });

    const sessionId = await getPortalSession();
    if (!sessionId) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const ok = await switchPortalCompany(sessionId, company_id, portalUser.id);
    if (!ok) return NextResponse.json({ ok: false, error: "Bu firmaya erişiminiz yok" }, { status: 403 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
