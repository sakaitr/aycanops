import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDb } from "@/lib/db";
import { readFinansBelgePath, isSafeFinansFilename } from "@/lib/uploads-finans";

export async function GET(req: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
  if (!hasPermission(user, "finans_belge:read"))
    return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

  const { filename } = await params;
  // saveFinansBelge/readFinansBelgePath/deleteFinansBelge path.join ile
  // birleştirir ve kendileri path traversal kontrolü yapmaz — bu route,
  // URL'den gelen (saldırgan tarafından kontrol edilebilir) filename'i
  // readFinansBelgePath'e geçirmeden ÖNCE hem format hem DB varlık
  // kontrolünden geçirmek zorunda.
  if (!isSafeFinansFilename(filename)) {
    return NextResponse.json({ ok: false, error: "Geçersiz dosya adı" }, { status: 404 });
  }

  const db = getDb();
  const belge = await db.prepare("SELECT mime_type FROM finans_belge WHERE dosya_yolu = ?").get(filename) as
    { mime_type: string } | undefined;
  if (!belge) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

  try {
    const filePath = await readFinansBelgePath(filename);
    const buffer = await readFile(filePath);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": belge.mime_type || "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Dosya bulunamadı" }, { status: 404 });
  }
}
