import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { notificationCreateSchema } from "@/lib/schemas";
import { sendPushToUser } from "@/lib/push";
import { sendWhatsAppToUser } from "@/lib/whatsapp";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz erişim" }, { status: 401 });
    if (!hasPermission(user, "notifications:read")) {
      return NextResponse.json({ ok: false, error: "Yetkisiz erişim" }, { status: 403 });
    }

    const db = getDb();
    const rows = await db.prepare(
      `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
    ).all(user.id);

    const unreadCount = (rows as any[]).filter(r => r.is_read === 0).length;

    return NextResponse.json({ ok: true, data: rows, unreadCount });
  } catch (e) {
    console.error("[X notifications GET]", e);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz erişim" }, { status: 401 });
    if (!hasPermission(user, "notifications:create")) {
      return NextResponse.json({ ok: false, error: "Yetkisiz erişim" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = notificationCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const { user_id, title, body: msgBody, link } = parsed.data;
    const db = getDb();
    const now = nowIso();

    if (!user_id) {
      // Broadcast to all active users
      const users = await db.prepare("SELECT id FROM users WHERE is_active = 1").all() as { id: string }[];
      for (const u of users) {
        const id = uuidv4();
        await db.prepare(
          `INSERT INTO notifications (id, user_id, title, body, link, is_read, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`
        ).run(id, u.id, title, msgBody || null, link || null, user.id, now, now);
        sendPushToUser(u.id, { title, body: msgBody || undefined, url: link || "/" }).catch(() => {});
        sendWhatsAppToUser(u.id, { title, body: msgBody || undefined, url: link || "/" }).catch(() => {});
      }
      return NextResponse.json({ ok: true, data: { broadcast: true, count: users.length } }, { status: 201 });
    }

    const id = uuidv4();
    await db.prepare(
      `INSERT INTO notifications (id, user_id, title, body, link, is_read, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`
    ).run(id, user_id, title, msgBody || null, link || null, user.id, now, now);
    sendPushToUser(user_id, { title, body: msgBody || undefined, url: link || "/" }).catch(() => {});
    sendWhatsAppToUser(user_id, { title, body: msgBody || undefined, url: link || "/" }).catch(() => {});

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) {
    console.error("[X notifications POST]", e);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
