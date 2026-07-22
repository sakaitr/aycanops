import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const { fcm_token, platform = "unknown", device_name } = await req.json();
    if (!fcm_token || typeof fcm_token !== "string") {
      return NextResponse.json({ ok: false, error: "fcm_token gerekli" }, { status: 400 });
    }

    const validPlatforms = ["ios", "android", "web", "unknown"];
    const safePlatform = validPlatforms.includes(platform) ? platform : "unknown";

    const db = getDb();
    const now = nowIso();

    // Upsert: delete existing record for this user+token, then insert fresh
    await db.prepare(
      `DELETE FROM push_tokens WHERE user_id = ? AND fcm_token = ?`
    ).run(user.id, fcm_token);

    await db.prepare(
      `INSERT INTO push_tokens (id, user_id, fcm_token, platform, device_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(uuidv4(), user.id, fcm_token, safePlatform, device_name ?? null, now, now);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { fcm_token } = body;

    const db = getDb();
    if (fcm_token && typeof fcm_token === "string") {
      await db.prepare(
        `DELETE FROM push_tokens WHERE user_id = ? AND fcm_token = ?`
      ).run(user.id, fcm_token);
    } else {
      // Delete all tokens for this user (logout / sign out)
      await db.prepare(`DELETE FROM push_tokens WHERE user_id = ?`).run(user.id);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
