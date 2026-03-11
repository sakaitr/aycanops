import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { nowIso } from "@/lib/time";
import { ticketActionCreateSchema } from "@/lib/schemas";

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
    const parsed = ticketActionCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { title, is_done } = parsed.data;

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
    const actionId = uuidv4();
    const now = nowIso();

    await db.prepare(
      "INSERT INTO ticket_actions (id, ticket_id, title, is_done, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(
      actionId,
      ticket.id,
      title,
      is_done ? 1 : 0,
      now,
      is_done ? now : null
    );

    const created = await db
      .prepare("SELECT * FROM ticket_actions WHERE id = ?")
      .get(actionId);

    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("Ticket action error:", error);
    return NextResponse.json(
      { ok: false, error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}

export async function PUT(
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
    const { action_id, is_done } = body;

    if (!action_id) {
      return NextResponse.json(
        { ok: false, error: "Aksiyon ID gerekli" },
        { status: 400 }
      );
    }

    const db = getDb();
    const now = nowIso();

    await db.prepare(
      "UPDATE ticket_actions SET is_done = ?, completed_at = ? WHERE id = ?"
    ).run(is_done ? 1 : 0, is_done ? now : null, action_id);

    const updated = await db
      .prepare("SELECT * FROM ticket_actions WHERE id = ?")
      .get(action_id);

    return NextResponse.json({ ok: true, data: updated });
  } catch (error) {
    console.error("Ticket action update error:", error);
    return NextResponse.json(
      { ok: false, error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}

