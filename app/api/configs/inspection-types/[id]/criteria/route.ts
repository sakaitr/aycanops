import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "inspection_configs:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    const criteria = await db.prepare(
      "SELECT * FROM config_inspection_criteria WHERE inspection_type_id = ? AND is_active = 1 ORDER BY sort_order ASC, label ASC"
    ).all(id);
    return NextResponse.json({ ok: true, data: criteria });
  } catch (e) {
    console.error("[GET inspection criteria]", e);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "inspection_configs:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const { label } = await req.json();
    if (!label?.trim()) return NextResponse.json({ ok: false, error: "Kriter adı zorunlu" }, { status: 400 });

    const db = getDb();
    const now = nowIso();
    const cid = uuidv4();
    const maxRow: any = await db.prepare(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM config_inspection_criteria WHERE inspection_type_id = ? AND is_active = 1"
    ).get(id);
    const sortOrder = maxRow?.next_order ?? 0;

    await db.prepare(
      "INSERT INTO config_inspection_criteria (id, inspection_type_id, label, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)"
    ).run(cid, id, label.trim(), sortOrder, now, now);

    return NextResponse.json({ ok: true, data: { id: cid } });
  } catch (e) {
    console.error("[POST inspection criterion]", e);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
