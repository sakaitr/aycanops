import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { requirePortalUser } from "@/lib/portal-auth";
import { getDb } from "@/lib/db";
import { readInspectionPhotoPath, isSafeFilename } from "@/lib/uploads";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  if (!isSafeFilename(filename)) {
    return NextResponse.json({ ok: false, error: "Geçersiz dosya adı" }, { status: 400 });
  }

  const db = getDb();
  const photo = await db.prepare(
    `SELECT i.company_id FROM inspection_photos p
     JOIN inspections i ON i.id = p.inspection_id
     WHERE p.filename = ?`
  ).get(filename) as { company_id: string | null } | undefined;
  if (!photo) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

  const user = await requireUser();
  const hasOpsAccess = user && hasPermission(user, "inspections:read");
  if (!hasOpsAccess) {
    const portalUser = await requirePortalUser();
    if (!portalUser || !photo.company_id || portalUser.company_id !== photo.company_id) {
      return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    }
  }

  try {
    const filePath = await readInspectionPhotoPath(filename);
    const buffer = await readFile(filePath);
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Dosya bulunamadı" }, { status: 404 });
  }
}
