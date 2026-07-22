import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { nowIso } from "@/lib/time";
import { sendWhatsAppToUser } from "@/lib/whatsapp";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz erişim" }, { status: 401 });

    const db = getDb();
    const today = new Date().toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

    // Find todos due today or tomorrow that are not done
    const todos = await db.prepare(
      `SELECT t.id, t.title, t.assigned_to, t.due_date,
              COALESCE(t.reminder_daily_max, 4) as reminder_daily_max
       FROM todos t
       WHERE t.due_date IN (?, ?)
         AND t.status_code != 'done'
         AND t.assigned_to IS NOT NULL`
    ).all(today, tomorrow) as any[];

    if (todos.length === 0) return NextResponse.json({ ok: true, sent: 0 });

    const now = nowIso();
    let sent = 0;

    for (const todo of todos) {
      // Count reminders already sent today for this todo
      const countRow = await db.prepare(
        `SELECT COUNT(*) as cnt FROM todo_reminders WHERE todo_id = ? AND reminder_day = ?`
      ).get(todo.id, today) as { cnt: number };

      if (countRow.cnt >= todo.reminder_daily_max) continue;

      const isToday = todo.due_date === today;
      const title = isToday
        ? `⏰ Bugün teslim: ${todo.title}`
        : `📅 Yarın teslim: ${todo.title}`;

      const notifId = uuidv4();
      const reminderId = uuidv4();

      await db.prepare(
        `INSERT INTO notifications (id, user_id, title, body, link, is_read, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`
      ).run(notifId, todo.assigned_to, title, null, `/gorevler`, null, now, now);

      await db.prepare(
        `INSERT INTO todo_reminders (id, todo_id, reminded_at, reminder_day) VALUES (?, ?, ?, ?)`
      ).run(reminderId, todo.id, now, today);

      sendWhatsAppToUser(todo.assigned_to, { title, url: "/gorevler" }).catch(() => {});

      sent++;
    }

    return NextResponse.json({ ok: true, sent });
  } catch (e) {
    console.error("[X notifications/remind]", e);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
