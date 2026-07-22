import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "notifications:update")) {
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const { label, department_id, channel, days_before, km_esigi, is_active } = body;

    const db = getDb();
    const existing = await db.prepare("SELECT id FROM notification_rules WHERE id = ?").get(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Kural bulunamadı" }, { status: 404 });

    const updates: string[] = [];
    const values: any[] = [];

    if (label !== undefined) { updates.push("label = ?"); values.push(label); }
    if (department_id !== undefined) { updates.push("department_id = ?"); values.push(department_id || null); }
    if (channel !== undefined) { updates.push("channel = ?"); values.push(channel); }
    if (days_before !== undefined) { updates.push("days_before = ?"); values.push(Number(days_before)); }
    if (km_esigi !== undefined) { updates.push("km_esigi = ?"); values.push(km_esigi != null ? Number(km_esigi) : null); }
    if (is_active !== undefined) { updates.push("is_active = ?"); values.push(is_active ? 1 : 0); }

    if (updates.length === 0) return NextResponse.json({ ok: true });

    updates.push("updated_at = ?");
    values.push(nowIso());
    values.push(id);

    await db.prepare(`UPDATE notification_rules SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "notifications:delete")) {
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    }

    const { id } = await params;
    const db = getDb();
    await db.prepare("DELETE FROM notification_rules WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
