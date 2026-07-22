import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { hasReportPermission } from "@/lib/permissions";
import { getReport } from "@/lib/reports/catalog";
import { runReport } from "@/lib/reports/queries";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz erişim" }, { status: 401 });
    if (!hasReportPermission(user, "read")) {
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);

    const reportParam = searchParams.get("report");
    if (!reportParam) {
      return NextResponse.json({ ok: false, error: "report parametresi gerekli" }, { status: 400 });
    }

    const def = getReport(reportParam);
    if (!def) {
      return NextResponse.json({ ok: false, error: "Geçersiz rapor ID" }, { status: 400 });
    }

    if (!hasReportPermission(user, "read", def.roleMin)) {
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    }

    const companyIds = searchParams.getAll("company_id");
    const dateFrom = searchParams.get("date_from") ?? undefined;
    const dateTo = searchParams.get("date_to") ?? undefined;
    const vehiclePlates = searchParams.getAll("vehicle_plate");

    const result = await runReport(def.id, companyIds, dateFrom, dateTo, vehiclePlates);

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    console.error("Report data error:", error);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
