import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "inspection_configs:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const db = getDb();
    const types = await db.prepare(
      `SELECT t.*, COUNT(c.id) as criteria_count, co.name as company_name
       FROM config_inspection_types t
       LEFT JOIN config_inspection_criteria c ON c.inspection_type_id = t.id AND c.is_active = 1
       LEFT JOIN companies co ON co.id = t.company_id
       WHERE t.is_active = 1
       GROUP BY t.id
       ORDER BY t.sort_order ASC, t.label ASC`
    ).all();
    return NextResponse.json({ ok: true, data: types });
  } catch (e) {
    console.error("[GET inspection-types]", e);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "inspection_configs:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { label, code, company_id } = await req.json();
    if (!label?.trim()) return NextResponse.json({ ok: false, error: "Etiket zorunlu" }, { status: 400 });
    if (!code?.trim()) return NextResponse.json({ ok: false, error: "Kod zorunlu" }, { status: 400 });

    const db = getDb();
    const now = nowIso();
    const id = uuidv4();
    const maxRow: any = await db.prepare(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM config_inspection_types"
    ).get();
    const sortOrder = maxRow?.next_order ?? 0;

    await db.prepare(
      "INSERT INTO config_inspection_types (id, code, label, company_id, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)"
    ).run(id, code.trim().toLowerCase(), label.trim(), company_id?.trim() || null, sortOrder, now, now);

    return NextResponse.json({ ok: true, data: { id } });
  } catch (e: any) {
    console.error("[POST inspection-types]", e);
    if (e?.message?.includes("UNIQUE"))
      return NextResponse.json({ ok: false, error: "Bu kod zaten kullanımda" }, { status: 409 });
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
