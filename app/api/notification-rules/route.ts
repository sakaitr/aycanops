import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "notifications:read")) {
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    }

    const db = getDb();
    const data = await db.prepare(`
      SELECT r.*, d.name AS department_name
      FROM notification_rules r
      LEFT JOIN departments d ON d.id = r.department_id
      ORDER BY r.event_type, r.days_before DESC
    `).all();
    return NextResponse.json({ ok: true, data });
  } catch {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "notifications:create")) {
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    }

    const body = await req.json();
    const { event_type, label, department_id, channel, days_before, km_esigi } = body;
    if (!event_type || !label || !channel) {
      return NextResponse.json({ ok: false, error: "event_type, label ve channel zorunludur" }, { status: 400 });
    }

    const db = getDb();
    const now = nowIso();
    const id = uuidv4();
    await db.prepare(
      "INSERT INTO notification_rules (id, event_type, label, department_id, channel, days_before, km_esigi, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)"
    ).run(id, event_type, label, department_id || null, channel, Number(days_before) || 0, km_esigi != null ? Number(km_esigi) : null, now, now);

    return NextResponse.json({ ok: true, data: { id } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
