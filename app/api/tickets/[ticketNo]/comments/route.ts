import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { nowIso } from "@/lib/time";
import { commentSchema } from "@/lib/schemas";

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
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error("Invalid JSON in request:", parseError);
      return NextResponse.json(
        { ok: false, error: "Geçersiz JSON" },
        { status: 400 }
      );
    }
    const parsed = commentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { comment } = parsed.data;

    const db = getDb();
    const ticketRaw = await db
      .prepare("SELECT id FROM tickets WHERE ticket_no = ?")
      .get(ticketNo);

    if (!ticketRaw) {
      return NextResponse.json(
        { ok: false, error: "Sorun bulunamadı" },
        { status: 404 }
      );
    }

    const ticket = ticketRaw as { id: string };

    const commentId = uuidv4();
    const now = nowIso();

    await db.prepare(
      "INSERT INTO ticket_comments (id, ticket_id, user_id, comment, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(commentId, ticket.id, user.id, comment, now);

    const created = await db
      .prepare(
        `SELECT ticket_comments.*, users.full_name as user_name
         FROM ticket_comments
         JOIN users ON users.id = ticket_comments.user_id
         WHERE ticket_comments.id = ?`
      )
      .get(commentId);

    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("Ticket comment error:", error);
    return NextResponse.json(
      { ok: false, error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}

