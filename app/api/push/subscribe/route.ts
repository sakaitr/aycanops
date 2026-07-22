import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { VAPID_PUBLIC_KEY } from "@/lib/push";

export async function GET() {
  return NextResponse.json({ ok: true, vapidPublicKey: VAPID_PUBLIC_KEY });
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const body = await req.json();
    const { endpoint, keys } = body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ ok: false, error: "Geçersiz subscription" }, { status: 400 });
    }

    const db = getDb();
    const now = nowIso();

    // Upsert: remove existing for this endpoint, then insert fresh
    await db.prepare(`DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?`).run(user.id, endpoint);
    await db.prepare(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(uuidv4(), user.id, endpoint, keys.p256dh, keys.auth, now);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const { endpoint } = await req.json();
    const db = getDb();
    if (endpoint) {
      await db.prepare(`DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?`).run(user.id, endpoint);
    } else {
      await db.prepare(`DELETE FROM push_subscriptions WHERE user_id = ?`).run(user.id);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
