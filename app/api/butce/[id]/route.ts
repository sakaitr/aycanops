import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";
import { nowIso } from "@/lib/time";

// GET /api/butce/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "budget:read")) {
      return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
    }

    const { id } = await params;
    const db = getDb();
    const entry = await db.prepare(`SELECT * FROM budget_entries WHERE id = ?`).get(id) as { company_id: string | null } | undefined;
    if (!entry) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    if (entry.company_id && user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(entry.company_id)) {
        return NextResponse.json({ error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
      }
    }
    return NextResponse.json({ ok: true, data: entry });
  } catch (e) {
    return apiError(e);
  }
}

// PUT /api/butce/[id]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "budget:update")) {
      return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
    }

    const { id } = await params;
    const db = getDb();
    const existing = await db.prepare(`SELECT id, company_id FROM budget_entries WHERE id = ?`).get(id) as { id: string; company_id: string | null } | undefined;
    if (!existing) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
    if (existing.company_id && user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(existing.company_id)) {
        return NextResponse.json({ error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
      }
    }

    const body = await req.json();
    const { budgeted_amount, notes } = body;

    if (typeof budgeted_amount !== "number" || budgeted_amount < 0) {
      return NextResponse.json({ error: "Geçersiz bütçe tutarı" }, { status: 400 });
    }

    await db.prepare(
      `UPDATE budget_entries SET budgeted_amount = ?, notes = ?, updated_at = ? WHERE id = ?`
    ).run(budgeted_amount, notes ?? null, nowIso(), id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

// DELETE /api/butce/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "budget:update")) {
      return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
    }

    const { id } = await params;
    const db = getDb();
    const existing = await db.prepare(`SELECT company_id FROM budget_entries WHERE id = ?`).get(id) as { company_id: string | null } | undefined;
    if (existing?.company_id && user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(existing.company_id)) {
        return NextResponse.json({ error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
      }
    }
    await db.prepare(`DELETE FROM budget_entries WHERE id = ?`).run(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
