import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { nowIso } from "@/lib/time";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ticketNo: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Yetkisiz erişim" },
        { status: 401 }
      );
    }

    const { ticketNo } = await params;
    if (!ticketNo) {
      return NextResponse.json(
        { ok: false, error: "Ticket numarası gerekli" },
        { status: 400 }
      );
    }
    const db = getDb();

    const ticketRaw = await db
      .prepare("SELECT * FROM tickets WHERE ticket_no = ?")
      .get(ticketNo);

    if (!ticketRaw) {
      return NextResponse.json(
        { ok: false, error: "Sorun bulunamadı" },
        { status: 404 }
      );
    }

    const ticket = ticketRaw as { id: string; title: string; assigned_to: string | null };

    if (!ticket.assigned_to) {
      return NextResponse.json(
        { ok: false, error: "Sorun henüz atanmamış" },
        { status: 400 }
      );
    }

    const targetUserId = ticket.assigned_to;
    const today = new Date().toISOString().split("T")[0];

    let worklog = await db
      .prepare("SELECT * FROM worklogs WHERE user_id = ? AND work_date = ?")
      .get(targetUserId, today) as
      | { id: string; status_code: string }
      | undefined;

    if (!worklog) {
      const worklogId = uuidv4();
      const now = nowIso();
      await db.prepare(
        `INSERT INTO worklogs (id, user_id, work_date, summary, status_code, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'draft', ?, ?)`
      ).run(
        worklogId,
        targetUserId,
        today,
        "Günlük oluşturuldu",
        now,
        now
      );
      worklog = { id: worklogId, status_code: "draft" };
    }

    if (
      worklog.status_code !== "draft" &&
      worklog.status_code !== "returned"
    ) {
      return NextResponse.json(
        { ok: false, error: "Hedef günlük düzenlenemez durumda" },
        { status: 400 }
      );
    }

    const itemId = uuidv4();
    const now = nowIso();
    await db.prepare(
      `INSERT INTO worklog_items (id, worklog_id, title, linked_ticket_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(itemId, worklog.id, ticket.title, ticket.id, now, now);

    const created = await db
      .prepare("SELECT * FROM worklog_items WHERE id = ?")
      .get(itemId);

    return NextResponse.json(
      {
        ok: true,
        data: created,
        message: "Worklog maddesine eklendi",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Ticket worklog transfer error:", error);
    return NextResponse.json(
      { ok: false, error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}

