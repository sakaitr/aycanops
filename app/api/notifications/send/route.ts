import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";
import { sendPushToUser } from "@/lib/push";
import { sendMail, notificationTemplate } from "@/lib/mailer";

/**
 * POST /api/notifications/send
 * Çoklu kanal bildirimi — push + e-posta
 *
 * Body:
 *   user_id?   — belirli kullanıcıya (yoksa role'e göre)
 *   role?      — "yetkili" | "yonetici" | "admin" — bu role sahip herkese
 *   title      — bildirim başlığı
 *   message    — bildirim mesajı
 *   url?       — tıklama linki
 *   channels?  — ["push", "email"] — varsayılan: ["push"]
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "notifications:send")) {
      return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
    }

    const body = await req.json();
    const {
      user_id,
      role,
      title,
      message,
      url,
      channels = ["push"],
    } = body;

    if (!title) return NextResponse.json({ error: "title gerekli" }, { status: 400 });

    const db = getDb();
    let targetUserIds: string[] = [];
    let targetEmails: string[] = [];

    if (user_id) {
      targetUserIds = [user_id];
      const u = await db.prepare(`SELECT email FROM users WHERE id = ?`).get(user_id) as { email: string } | undefined;
      if (u?.email) targetEmails = [u.email];
    } else if (role) {
      const targets = await db.prepare(
        `SELECT id, email FROM users WHERE role = ? AND status = 'aktif'`
      ).all(role) as { id: string; email: string }[];
      targetUserIds = targets.map(t => t.id);
      targetEmails = targets.map(t => t.email).filter(Boolean);
    } else {
      return NextResponse.json({ error: "user_id veya role belirtilmeli" }, { status: 400 });
    }

    const results = { push: 0, email: 0, errors: [] as string[] };

    // Push kanalı
    if (channels.includes("push")) {
      await Promise.allSettled(
        targetUserIds.map(uid =>
          sendPushToUser(uid, { title, body: message, url }).then(() => results.push++)
        )
      );
    }

    // E-posta kanalı
    if (channels.includes("email") && targetEmails.length > 0) {
      const html = notificationTemplate({ title, message, actionUrl: url });
      await Promise.allSettled(
        targetEmails.map(email =>
          sendMail({ to: email, subject: title, html }).then(ok => { if (ok) results.email++; })
        )
      );
    }

    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return apiError(e);
  }
}
