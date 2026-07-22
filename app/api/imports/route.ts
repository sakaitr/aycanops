import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { hasPermission } from "@/lib/permissions";
import { createImportJob, isImportModule } from "@/lib/import-center";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "imports:validate")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 25)));
    const db = getDb();
    const rows = await db.prepare(
      `SELECT j.*, u.full_name AS created_by_name
       FROM import_jobs j
       LEFT JOIN users u ON u.id = j.created_by
       ORDER BY j.created_at DESC
       LIMIT ?`
    ).all(limit);
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "imports:create") || !hasPermission(user, "imports:validate")) {
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    }

    const formData = await req.formData();
    const module = String(formData.get("module") || "");
    const file = formData.get("file");
    if (!isImportModule(module)) return NextResponse.json({ ok: false, error: "Geçersiz modül" }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Dosya zorunludur" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const job = await createImportJob(module, file.name, buffer, user.id);
    await logAudit({ actorUserId: user.id, action: "import.upload", entityType: "import_job", entityId: job.id, details: { module, fileName: file.name, ...job } });
    return NextResponse.json({ ok: true, data: job }, { status: 201 });
  } catch (e) { return apiError(e); }
}
