import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  getSessionFromCookies,
  deleteSession,
  clearSessionCookie,
  clearRoleCookie,
  getUserBySession,
} from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const sessionId = await getSessionFromCookies();
    if (!sessionId) {
      return NextResponse.json(
        { ok: false, error: "Oturum bulunamadı" },
        { status: 401 }
      );
    }

    const user = await getUserBySession(sessionId);
    if (user) {
      await logAudit({
        actorUserId: user.id,
        action: "logout",
        entityType: "session",
        entityId: sessionId,
      });
    }

    await deleteSession(sessionId);
    await clearSessionCookie();
    await clearRoleCookie();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json(
      { ok: false, error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}
