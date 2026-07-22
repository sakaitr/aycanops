import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { hasPermission } from "@/lib/permissions";
import { executeImportJob } from "@/lib/import-center";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "imports:execute")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const allowedCompanies = user.allowed_companies ? JSON.parse(user.allowed_companies) : null;
    const result = await executeImportJob(id, user.id, allowedCompanies);
    await logAudit({ actorUserId: user.id, action: "import.execute", entityType: "import_job", entityId: id, details: result });
    return NextResponse.json({ ok: true, data: result });
  } catch (e) { return apiError(e); }
}
