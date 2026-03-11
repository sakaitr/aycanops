import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canViewTicket, isAtLeast } from "@/lib/permissions";
import { nowIso, addMinutes } from "@/lib/time";
import { logAudit } from "@/lib/audit";
import { ticketUpdateSchema } from "@/lib/schemas";

export async function GET(
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
      .prepare(
        `SELECT t.*, u.full_name as creator_name, a.full_name as assigned_name
         FROM tickets t
         LEFT JOIN users u ON u.id = t.created_by
         LEFT JOIN users a ON a.id = t.assigned_to
         WHERE t.ticket_no = ?`
      )
      .get(ticketNo);

    if (!ticketRaw) {
      return NextResponse.json(
        { ok: false, error: "Sorun bulunamadı" },
        { status: 404 }
      );
    }

    const ticket = ticketRaw as { id: string; assigned_to: string | null; created_by: string };

    if (!canViewTicket(user, ticket)) {
      return NextResponse.json(
        { ok: false, error: "Yetersiz yetki" },
        { status: 403 }
      );
    }

    const comments = await db
      .prepare(
        `SELECT ticket_comments.*, users.full_name as user_name
         FROM ticket_comments
         JOIN users ON users.id = ticket_comments.user_id
         WHERE ticket_comments.ticket_id = ?
         ORDER BY ticket_comments.created_at ASC`
      )
      .all(ticket.id);

    const actions = await db
      .prepare("SELECT * FROM ticket_actions WHERE ticket_id = ? ORDER BY created_at ASC")
      .all(ticket.id);

    return NextResponse.json({
      ok: true,
      data: { ...ticket, comments, actions },
    });
  } catch (error) {
    console.error("Ticket detail error:", error);
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

    const { ticketNo } = await params;
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
    const parsed = ticketUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { status_code, priority_code, category_id, assigned_to, tag_ids } = parsed.data;
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

    const ticket = ticketRaw as {
      id: string;
      assigned_to: string | null;
      created_by: string;
      status_code: string;
      priority_code: string | null;
    };

    if (!canViewTicket(user, ticket)) {
      return NextResponse.json(
        { ok: false, error: "Yetersiz yetki" },
        { status: 403 }
      );
    }

    const now = nowIso();
    let updateSql = "UPDATE tickets SET updated_at = ?";
    const updateParams: unknown[] = [now];

    if (status_code) {
      if (
        status_code === "closed" &&
        !isAtLeast(user.role, "yetkili")
      ) {
        return NextResponse.json(
          { ok: false, error: "Kapama yetkiniz yok" },
          { status: 403 }
        );
      }

      updateSql += ", status_code = ?";
      updateParams.push(status_code);

      if (status_code === "solved") {
        updateSql += ", solved_at = ?";
        updateParams.push(now);
      } else if (status_code === "closed") {
        updateSql += ", closed_at = ?";
        updateParams.push(now);
      }

      await logAudit({
        actorUserId: user.id,
        action: "ticket_status_change",
        entityType: "ticket",
        entityId: ticket.id,
        details: { old_status: ticket.status_code, new_status: status_code },
      });
    }

    if (priority_code !== undefined) {
      updateSql += ", priority_code = ?";
      updateParams.push(priority_code || null);

      if (priority_code) {
        const slaRule = await db
          .prepare(
            "SELECT due_minutes FROM config_sla_rules WHERE priority_code = ? AND is_active = 1"
          )
          .get(priority_code) as { due_minutes: number } | undefined;
        if (slaRule) {
          const slaDueAt = addMinutes(new Date(), slaRule.due_minutes).toISOString();
          updateSql += ", sla_due_at = ?";
          updateParams.push(slaDueAt);
        }
      }

      await logAudit({
        actorUserId: user.id,
        action: "ticket_priority_change",
        entityType: "ticket",
        entityId: ticket.id,
        details: {
          old_priority: ticket.priority_code,
          new_priority: priority_code,
        },
      });
    }

    if (category_id !== undefined) {
      updateSql += ", category_id = ?";
      updateParams.push(category_id || null);
      await logAudit({
        actorUserId: user.id,
        action: "ticket_category_change",
        entityType: "ticket",
        entityId: ticket.id,
        details: { category_id },
      });
    }

    if (assigned_to !== undefined) {
      if (!isAtLeast(user.role, "yetkili")) {
        return NextResponse.json(
          { ok: false, error: "Atama yetkiniz yok" },
          { status: 403 }
        );
      }
      updateSql += ", assigned_to = ?";
      updateParams.push(assigned_to || null);
      await logAudit({
        actorUserId: user.id,
        action: "ticket_assign",
        entityType: "ticket",
        entityId: ticket.id,
        details: { assigned_to },
      });
    }

    if (tag_ids !== undefined) {
      const tagIdsStr = Array.isArray(tag_ids) ? tag_ids.join(",") : tag_ids;
      updateSql += ", tag_ids = ?";
      updateParams.push(tagIdsStr || null);
    }

    updateSql += " WHERE id = ?";
    updateParams.push(ticket.id);

    await db.prepare(updateSql).run(...updateParams);

    const updated = await db
      .prepare("SELECT * FROM tickets WHERE id = ?")
      .get(ticket.id);
    return NextResponse.json({ ok: true, data: updated });
  } catch (error) {
    console.error("Ticket update error:", error);
    return NextResponse.json(
      { ok: false, error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ ticketNo: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Yetkisiz erişim" }, { status: 401 });
    }
    if (!isAtLeast(user.role, "yonetici")) {
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    }
    const { ticketNo } = await params;
    const db = getDb();
    const ticketRaw = await db.prepare("SELECT * FROM tickets WHERE ticket_no = ?").get(ticketNo) as { id: string } | undefined;
    if (!ticketRaw) {
      return NextResponse.json({ ok: false, error: "Sorun bulunamadı" }, { status: 404 });
    }
    await db.prepare("DELETE FROM ticket_comments WHERE ticket_id = ?").run(ticketRaw.id);
    await db.prepare("DELETE FROM ticket_actions WHERE ticket_id = ?").run(ticketRaw.id);
    await db.prepare("DELETE FROM tickets WHERE id = ?").run(ticketRaw.id);
    await logAudit({
      actorUserId: user.id,
      action: "ticket_delete",
      entityType: "ticket",
      entityId: ticketRaw.id,
      details: { ticket_no: ticketNo },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Ticket delete error:", error);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

