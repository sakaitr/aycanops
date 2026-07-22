import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";

const VALID_CATEGORIES = [
  "fuel", "maintenance", "salary", "insurance",
  "tax", "rent", "equipment", "other",
] as const;

type Category = typeof VALID_CATEGORIES[number];

function isValidCategory(c: string): c is Category {
  return (VALID_CATEGORIES as readonly string[]).includes(c);
}

// GET /api/butce?period=YYYY-MM&company_id=...
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "budget:read")) {
      return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") || new Date().toISOString().slice(0, 7);
    const companyId = searchParams.get("company_id") || null;

    if (companyId && user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(companyId)) {
        return NextResponse.json({ error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
      }
    }

    const db = getDb();

    // Fetch budget entries
    let budgetQuery = `SELECT * FROM budget_entries WHERE period = ?`;
    const budgetParams: unknown[] = [period];
    if (companyId) { budgetQuery += ` AND company_id = ?`; budgetParams.push(companyId); }
    budgetQuery += ` ORDER BY category ASC`;
    const budgets = await db.prepare(budgetQuery).all(...budgetParams) as Record<string, unknown>[];

    // Fetch actual maintenance costs for this period
    const monthStart = `${period}-01`;
    const monthEnd = `${period}-31`;
    let actualQuery = `
      SELECT category, COALESCE(SUM(cost), 0) AS actual_amount
      FROM (
        SELECT 'maintenance' AS category, cost
        FROM vehicle_maintenance
        WHERE maintenance_date >= ? AND maintenance_date <= ? AND cost IS NOT NULL
        ${companyId ? "AND vehicle_id IN (SELECT id FROM vehicles WHERE company_id = ?)" : ""}
      ) t
      GROUP BY category
    `;
    const actualParams: unknown[] = [monthStart, monthEnd];
    if (companyId) actualParams.push(companyId);

    const actuals = await db.prepare(actualQuery).all(...actualParams) as { category: string; actual_amount: number }[];
    const actualMap: Record<string, number> = {};
    for (const a of actuals) actualMap[a.category] = Number(a.actual_amount);

    // Build full category list with budget and actuals
    const budgetMap: Record<string, Record<string, unknown>> = {};
    for (const b of budgets) budgetMap[b.category as string] = b;

    const result = VALID_CATEGORIES.map(cat => ({
      category: cat,
      budgeted_amount: Number(budgetMap[cat]?.budgeted_amount ?? 0),
      actual_amount: actualMap[cat] ?? 0,
      notes: (budgetMap[cat]?.notes as string) ?? null,
      id: (budgetMap[cat]?.id as string) ?? null,
      company_id: (budgetMap[cat]?.company_id as string) ?? null,
    }));

    return NextResponse.json({ ok: true, period, data: result });
  } catch (e) {
    return apiError(e);
  }
}

// POST /api/butce — create or update a budget entry for a category+period
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "budget:create")) {
      return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
    }

    const body = await req.json();
    const { category, period, budgeted_amount, company_id, notes } = body;

    if (!category || !isValidCategory(category)) {
      return NextResponse.json({ error: "Geçersiz kategori" }, { status: 400 });
    }
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return NextResponse.json({ error: "period YYYY-MM formatında olmalı" }, { status: 400 });
    }
    if (typeof budgeted_amount !== "number" || budgeted_amount < 0) {
      return NextResponse.json({ error: "Geçersiz bütçe tutarı" }, { status: 400 });
    }
    if (company_id && user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(company_id)) {
        return NextResponse.json({ error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
      }
    }

    const db = getDb();
    const now = nowIso();

    // Upsert by (company_id, category, period)
    const existing = await db.prepare(
      `SELECT id FROM budget_entries WHERE category = ? AND period = ? AND ${company_id ? "company_id = ?" : "company_id IS NULL"}`
    ).get(category, period, ...(company_id ? [company_id] : [])) as { id: string } | undefined;

    if (existing) {
      await db.prepare(
        `UPDATE budget_entries SET budgeted_amount = ?, notes = ?, updated_at = ? WHERE id = ?`
      ).run(budgeted_amount, notes ?? null, now, existing.id);
      return NextResponse.json({ ok: true, id: existing.id });
    }

    const id = uuidv4();
    await db.prepare(
      `INSERT INTO budget_entries (id, company_id, category, period, budgeted_amount, notes, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, company_id ?? null, category, period, budgeted_amount, notes ?? null, user.id, now, now);

    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
