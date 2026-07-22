import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { hasReportPermission } from "@/lib/permissions";
import { getReport } from "@/lib/reports/catalog";
import { runReport } from "@/lib/reports/queries";
import { buildXlsx, buildPdf } from "@/lib/reports/engine";
import path from "node:path";

/**
 * POST /api/reports/bulk
 * Body: { report_ids: number[], company_ids: string[], date_from?: string, date_to?: string, format: "xlsx" | "pdf" }
 *
 * Returns a multipart response is complex, so we generate one combined XLSX workbook
 * (one sheet per report) or a concatenated set of info; or for simplicity we return
 * an array of base64-encoded files as JSON so the client can download each individually.
 *
 * Practical approach: return JSON { ok, files: [{ name, format, data: base64 }] }
 * The client iterates and triggers individual downloads.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz erişim" }, { status: 401 });
    if (!hasReportPermission(user, "export")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await request.json();
    const reportIds: number[] = Array.isArray(body.report_ids) ? body.report_ids.slice(0, 10) : [];
    const companyIds: string[] = Array.isArray(body.company_ids) ? body.company_ids : [];
    const dateFrom: string | undefined = typeof body.date_from === "string" ? body.date_from : undefined;
    const dateTo: string | undefined = typeof body.date_to === "string" ? body.date_to : undefined;
    const format: "xlsx" | "pdf" = body.format === "pdf" ? "pdf" : "xlsx";

    if (reportIds.length === 0) {
      return NextResponse.json({ ok: false, error: "En az bir rapor ID gerekli" }, { status: 400 });
    }

    const logoPath = path.join(process.cwd(), "public", "branding", "aycan-logo.png");
    const fileDate = dateFrom ?? new Date().toISOString().split("T")[0];

    const files: { name: string; format: string; data: string }[] = [];

    for (const id of reportIds) {
      const def = getReport(id);
      if (!def) continue;
      if (!hasReportPermission(user, "export", def.roleMin)) continue;

      try {
        const result = await runReport(def.id, companyIds, dateFrom, dateTo);
        const safeSlug = def.slug.replace(/[^a-zA-Z0-9_-]/g, "_");
        const filename = `${safeSlug}_${fileDate}.${format}`;

        if (format === "xlsx") {
          const buf = await buildXlsx(def.name, result);
          files.push({ name: filename, format: "xlsx", data: buf.toString("base64") });
        } else {
          const bytes = await buildPdf(def.name, result, logoPath);
          files.push({ name: filename, format: "pdf", data: Buffer.from(bytes).toString("base64") });
        }
      } catch (err) {
        console.error(`Bulk export error for report ${id}:`, err);
        // skip failed reports, continue
      }
    }

    return NextResponse.json({ ok: true, files });
  } catch (error) {
    console.error("Bulk export error:", error);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
