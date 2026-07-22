import { NextRequest, NextResponse } from "next/server";
import { getPortalSession, deletePortalSession, clearPortalSessionCookie } from "@/lib/portal-auth";
import { apiError } from "@/lib/api-error";

export async function POST(_req: NextRequest) {
  try {
    const sid = await getPortalSession();
    if (sid) await deletePortalSession(sid);
    await clearPortalSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
