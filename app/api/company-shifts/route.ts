import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { hasPermission } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "companies:read")) {
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    }
    const url = new URL(req.url);
    const company_id = url.searchParams.get("company_id");
    if (!company_id) return NextResponse.json({ ok: false, error: "company_id gerekli" }, { status: 400 });

    const db = getDb();
    const data = await db.prepare(
      "SELECT * FROM company_shifts WHERE company_id = ? AND active = 1 ORDER BY expected_time ASC"
    ).all(company_id);
    return NextResponse.json({ ok: true, data });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "companies:update")) {
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    }
    const body = await req.json();
    const { company_id, shift_name, expected_time, tolerance_early = 15, tolerance_late = 10 } = body;
    if (!company_id || !shift_name || !expected_time) {
      return NextResponse.json({ ok: false, error: "company_id, shift_name ve expected_time zorunlu" }, { status: 400 });
    }

    const db = getDb();
    const result = await db.prepare(
      "INSERT INTO company_shifts (company_id, shift_name, expected_time, tolerance_early, tolerance_late) VALUES (?, ?, ?, ?, ?)"
    ).run(company_id, shift_name, expected_time, tolerance_early, tolerance_late);
    const created = await db.prepare("SELECT * FROM company_shifts WHERE id = ?").get(result.insertId);
    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (e) { return apiError(e); }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "companies:update")) {
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    }
    const body = await req.json();
    const { id, shift_name, expected_time, tolerance_early, tolerance_late, active } = body;
    if (!id) return NextResponse.json({ ok: false, error: "id gerekli" }, { status: 400 });

    const db = getDb();
    const existing = await db.prepare("SELECT id FROM company_shifts WHERE id = ?").get(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Vardiya bulunamadı" }, { status: 404 });

    await db.prepare(
      "UPDATE company_shifts SET shift_name = COALESCE(?, shift_name), expected_time = COALESCE(?, expected_time), tolerance_early = COALESCE(?, tolerance_early), tolerance_late = COALESCE(?, tolerance_late), active = COALESCE(?, active) WHERE id = ?"
    ).run(shift_name ?? null, expected_time ?? null, tolerance_early ?? null, tolerance_late ?? null, active ?? null, id);

    const updated = await db.prepare("SELECT * FROM company_shifts WHERE id = ?").get(id);
    return NextResponse.json({ ok: true, data: updated });
  } catch (e) { return apiError(e); }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "companies:update")) {
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    }
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "id gerekli" }, { status: 400 });

    const db = getDb();
    await db.prepare("UPDATE company_shifts SET active = 0 WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
