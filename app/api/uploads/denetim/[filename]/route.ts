import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
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
  const user = await requireUser();
  if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
  if (!hasPermission(user, "inspections:read"))
    return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

  const { filename } = await params;
  if (!isSafeFilename(filename)) {
    return NextResponse.json({ ok: false, error: "Geçersiz dosya adı" }, { status: 400 });
  }

  const db = getDb();
  const exists = await db.prepare("SELECT id FROM inspection_photos WHERE filename = ?").get(filename);
  if (!exists) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

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
