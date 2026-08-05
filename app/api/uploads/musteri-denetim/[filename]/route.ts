import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { requirePortalUser } from "@/lib/portal-auth";
import { getDb } from "@/lib/db";
import { readCustomerInspectionFilePath, isSafeCustomerInspectionFilename } from "@/lib/uploads";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  if (!isSafeCustomerInspectionFilename(filename)) {
    return NextResponse.json({ ok: false, error: "Geçersiz dosya adı" }, { status: 400 });
  }

  const db = getDb();
  const file = await db.prepare(`
    SELECT s.company_id, f.original_name
    FROM customer_inspection_files f
    JOIN customer_inspection_submissions s ON s.id = f.submission_id
    WHERE f.filename = ?
  `).get(filename) as { company_id: string; original_name: string } | undefined;
  if (!file) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

  const user = await requireUser();
  const hasOpsAccess = user && hasPermission(user, "inspections:read");
  if (!hasOpsAccess) {
    const portalUser = await requirePortalUser();
    if (!portalUser || portalUser.company_id !== file.company_id) {
      return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    }
  }

  try {
    const filePath = await readCustomerInspectionFilePath(filename);
    const buffer = await readFile(filePath);
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(file.original_name)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Dosya bulunamadı" }, { status: 404 });
  }
}
