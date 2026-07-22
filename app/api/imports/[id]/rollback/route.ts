import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";
import { rollbackImportJob } from "@/lib/import-center";
import { logAudit } from "@/lib/audit";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "imports:rollback")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const result = await rollbackImportJob(id, user.id);
    await logAudit({ actorUserId: user.id, action: "import.rollback", entityType: "import_job", entityId: id, details: result });
    return NextResponse.json({ ok: true, data: result });
  } catch (e) {
    return apiError(e);
  }
}