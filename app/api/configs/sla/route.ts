import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canManageConfigs } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { logAudit } from "@/lib/audit";
import { slaCreateSchema } from "@/lib/schemas";

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
    const activeOnly = searchParams.get("activeOnly") === "true";

    let sql = "SELECT * FROM config_sla_rules WHERE 1=1";
    if (activeOnly) {
      sql += " AND is_active = 1";
    }
    sql += " ORDER BY priority_code ASC";

    const rows = await db.prepare(sql).all();
    return NextResponse.json({ ok: true, data: rows });
  } catch (error) {
    console.error("SLA rules list error:", error);
    return NextResponse.json(
      { ok: false, error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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
    const parsed = slaCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { priority_code, due_minutes } = parsed.data;

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();

    await db.prepare(
      "INSERT INTO config_sla_rules (id, priority_code, due_minutes, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)"
    ).run(id, priority_code, due_minutes, now, now);

    await logAudit({
      actorUserId: user.id,
      action: "sla_rule_create",
      entityType: "config_sla_rule",
      entityId: id,
      details: { priority_code, due_minutes },
    });

    const created = await db
      .prepare("SELECT * FROM config_sla_rules WHERE id = ?")
      .get(id);
    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("SLA rule create error:", error);
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
    const { id, due_minutes, is_active } = body;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "SLA kural ID gerekli" },
        { status: 400 }
      );
    }

    const db = getDb();
    const now = nowIso();

    let sql = "UPDATE config_sla_rules SET updated_at = ?";
    const params: unknown[] = [now];

    if (due_minutes !== undefined) {
      sql += ", due_minutes = ?";
      params.push(due_minutes);
    }

    if (is_active !== undefined) {
      sql += ", is_active = ?";
      params.push(is_active ? 1 : 0);
    }

    sql += " WHERE id = ?";
    params.push(id);

    await db.prepare(sql).run(...params);

    await logAudit({
      actorUserId: user.id,
      action: "sla_rule_update",
      entityType: "config_sla_rule",
      entityId: id,
    });

    const updated = await db
      .prepare("SELECT * FROM config_sla_rules WHERE id = ?")
      .get(id);
    return NextResponse.json({ ok: true, data: updated });
  } catch (error) {
    console.error("SLA rule update error:", error);
    return NextResponse.json(
      { ok: false, error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}

