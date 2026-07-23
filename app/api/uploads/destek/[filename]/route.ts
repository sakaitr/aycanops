import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { requirePortalUser } from "@/lib/portal-auth";
import { getDb } from "@/lib/db";
import { readTicketAttachmentPath, isSafeTicketFilename } from "@/lib/uploads";

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
  if (!isSafeTicketFilename(filename)) {
    return NextResponse.json({ ok: false, error: "Geçersiz dosya adı" }, { status: 400 });
  }

  const db = getDb();
  const attachment = await db.prepare(`
    SELECT pt.company_id, a.original_name
    FROM portal_ticket_attachments a
    JOIN portal_ticket_messages m ON m.id = a.message_id
    JOIN portal_tickets pt ON pt.id = m.ticket_id
    WHERE a.filename = ?
  `).get(filename) as { company_id: string; original_name: string } | undefined;
  if (!attachment) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

  // Ops kullanıcısı (musteri_destek:read) ya da o firmaya ait portal
  // kullanıcısı erişebilir — üçüncü bir firmanın çalışanı erişemez.
  const user = await requireUser();
  const hasOpsAccess = user && hasPermission(user, "musteri_destek:read");
  if (!hasOpsAccess) {
    const portalUser = await requirePortalUser();
    if (!portalUser || portalUser.company_id !== attachment.company_id) {
      return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    }
  }

  try {
    const filePath = await readTicketAttachmentPath(filename);
    const buffer = await readFile(filePath);
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(attachment.original_name)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Dosya bulunamadı" }, { status: 404 });
  }
}
