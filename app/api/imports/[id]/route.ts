import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { hasPermission } from "@/lib/permissions";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "imports:validate")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    const job = await db.prepare("SELECT * FROM import_jobs WHERE id = ?").get(id);
    if (!job) return NextResponse.json({ ok: false, error: "Import job bulunamadı" }, { status: 404 });
    const rows = await db.prepare("SELECT * FROM import_job_rows WHERE job_id = ? ORDER BY row_no ASC LIMIT 1000").all(id) as any[];
    return NextResponse.json({
      ok: true,
      data: {
        job,
        rows: rows.map(row => ({
          ...row,
          raw: JSON.parse(row.raw_json || "{}"),
          normalized: JSON.parse(row.normalized_json || "{}"),
          errors: JSON.parse(row.errors_json || "[]"),
          warnings: JSON.parse(row.warnings_json || "[]"),
        })),
      },
    });
  } catch (e) { return apiError(e); }
}
