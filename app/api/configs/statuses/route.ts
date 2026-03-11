import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canManageConfigs } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { logAudit } from "@/lib/audit";
import { statusUpdateSchema } from "@/lib/schemas";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Yetkisiz erişim" },
        { status: 401 }
      );
    }

    const db = getDb();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (type === "ticket") {
      const rows = await db
        .prepare(
          "SELECT * FROM config_ticket_statuses ORDER BY sort_order ASC"
        )
        .all();
      return NextResponse.json({ ok: true, data: rows });
    } else if (type === "worklog") {
      const rows = await db
        .prepare(
          "SELECT * FROM config_worklog_statuses ORDER BY sort_order ASC"
        )
        .all();
      return NextResponse.json({ ok: true, data: rows });
    } else {
      return NextResponse.json(
        { ok: false, error: "Tip gerekli (ticket veya worklog)" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Statuses list error:", error);
    return NextResponse.json(
      { ok: false, error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Yetkisiz erişim" },
        { status: 401 }
      );
    }

    if (!canManageConfigs(user.role)) {
      return NextResponse.json(
        { ok: false, error: "Yetersiz yetki" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = statusUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { type, code, label, sort_order, is_active, is_terminal } = parsed.data;

    const db = getDb();
    const now = nowIso();
    const table =
      type === "ticket" ? "config_ticket_statuses" : "config_worklog_statuses";

    let sql = `UPDATE ${table} SET updated_at = ?`;
    const params: unknown[] = [now];

    if (label !== undefined) {
      sql += ", label = ?";
      params.push(label);
    }

    if (sort_order !== undefined) {
      sql += ", sort_order = ?";
      params.push(sort_order);
    }

    if (is_active !== undefined) {
      sql += ", is_active = ?";
      params.push(is_active ? 1 : 0);
    }

    if (is_terminal !== undefined) {
      sql += ", is_terminal = ?";
      params.push(is_terminal ? 1 : 0);
    }

    sql += " WHERE code = ?";
    params.push(code);

    await db.prepare(sql).run(...params);

    await logAudit({
      actorUserId: user.id,
      action: "status_update",
      entityType: type === "ticket" ? "config_ticket_status" : "config_worklog_status",
      entityId: code,
      details: { label, is_active },
    });

    const updated = await db
      .prepare(`SELECT * FROM ${table} WHERE code = ?`)
      .get(code);
    return NextResponse.json({ ok: true, data: updated });
  } catch (error) {
    console.error("Status update error:", error);
    return NextResponse.json(
      { ok: false, error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}

