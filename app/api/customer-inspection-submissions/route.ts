import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "inspections:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const db = getDb();
    let sql = `
      SELECT s.*, c.name AS company_name, cu.full_name AS olusturan
      FROM customer_inspection_submissions s
      JOIN companies c ON c.id = s.company_id
      JOIN customer_users cu ON cu.id = s.created_by
      WHERE 1=1`;
    const args: unknown[] = [];
    if (status) { sql += " AND s.status = ?"; args.push(status); }
    sql += " ORDER BY s.created_at DESC LIMIT 200";

    const submissions = await db.prepare(sql).all<any>(...args);

    const files = await db.prepare(
      `SELECT f.* FROM customer_inspection_files f
       JOIN customer_inspection_submissions s ON s.id = f.submission_id
       WHERE 1=1 ${status ? "AND s.status = ?" : ""}`
    ).all<any>(...(status ? [status] : []));

    const bySubmission = new Map<string, any[]>();
    for (const f of files) {
      const list = bySubmission.get(f.submission_id) ?? [];
      list.push(f);
      bySubmission.set(f.submission_id, list);
    }

    const data = submissions.map(s => ({ ...s, files: bySubmission.get(s.id) ?? [] }));
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return apiError(e);
  }
}
