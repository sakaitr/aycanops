import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { hasPermission } from "@/lib/permissions";
import { createTemplateWorkbook, IMPORT_TEMPLATES, isImportModule } from "@/lib/import-center";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "imports:validate")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const module = searchParams.get("module");
    if (!isImportModule(module)) {
      return NextResponse.json({ ok: true, data: Object.values(IMPORT_TEMPLATES).map(t => ({ module: t.module, label: t.label, columns: t.columns })) });
    }

    const buffer = await createTemplateWorkbook(module);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${module}-template.xlsx"`,
      },
    });
  } catch (e) { return apiError(e); }
}
