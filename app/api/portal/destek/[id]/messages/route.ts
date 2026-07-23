import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requirePortalUser } from "@/lib/portal-auth";
import { apiError } from "@/lib/api-error";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import {
  isAllowedTicketAttachmentType,
  extForTicketMime,
  saveTicketAttachment,
  MAX_TICKET_ATTACHMENT_BYTES,
  MAX_TICKET_ATTACHMENTS_PER_MESSAGE,
} from "@/lib/uploads";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const portalUser = await requirePortalUser();
    if (!portalUser) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const { id } = await params;
    const db = getDb();
    const ticket = await db.prepare(
      "SELECT id FROM portal_tickets WHERE id = ? AND company_id = ?"
    ).get(id, portalUser.company_id);
    if (!ticket) return NextResponse.json({ ok: false, error: "Talep bulunamadı" }, { status: 404 });

    const messages = await db.prepare(`
      SELECT m.id, m.sender_type, m.body, m.created_at,
             cu.full_name AS customer_name, u.full_name AS staff_name
      FROM portal_ticket_messages m
      LEFT JOIN customer_users cu ON cu.id = m.sender_customer_user_id
      LEFT JOIN users u ON u.id = m.sender_user_id
      WHERE m.ticket_id = ?
      ORDER BY m.created_at ASC
    `).all(id) as any[];

    const attachments = await db.prepare(`
      SELECT a.id, a.message_id, a.filename, a.original_name, a.mime_type
      FROM portal_ticket_attachments a
      JOIN portal_ticket_messages m ON m.id = a.message_id
      WHERE m.ticket_id = ?
    `).all(id) as any[];

    const byMessage = new Map<string, any[]>();
    for (const a of attachments) {
      const list = byMessage.get(a.message_id) ?? [];
      list.push(a);
      byMessage.set(a.message_id, list);
    }

    const data = messages.map(m => ({ ...m, attachments: byMessage.get(m.id) ?? [] }));
    return NextResponse.json({ ok: true, data });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const portalUser = await requirePortalUser();
    if (!portalUser) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const { id } = await params;
    const db = getDb();
    const ticket = await db.prepare(
      "SELECT id FROM portal_tickets WHERE id = ? AND company_id = ?"
    ).get(id, portalUser.company_id);
    if (!ticket) return NextResponse.json({ ok: false, error: "Talep bulunamadı" }, { status: 404 });

    const formData = await req.formData();
    const body = (formData.get("body") as string | null)?.trim() || null;
    const files = formData.getAll("files").filter((f): f is File => f instanceof File);

    if (!body && files.length === 0)
      return NextResponse.json({ ok: false, error: "Mesaj veya dosya gerekli" }, { status: 400 });
    if (files.length > MAX_TICKET_ATTACHMENTS_PER_MESSAGE)
      return NextResponse.json({ ok: false, error: `En fazla ${MAX_TICKET_ATTACHMENTS_PER_MESSAGE} dosya eklenebilir` }, { status: 400 });

    for (const file of files) {
      if (!isAllowedTicketAttachmentType(file.type))
        return NextResponse.json({ ok: false, error: `Desteklenmeyen dosya türü: ${file.type}` }, { status: 400 });
      if (file.size > MAX_TICKET_ATTACHMENT_BYTES)
        return NextResponse.json({ ok: false, error: "Dosya 8MB'ı geçemez" }, { status: 400 });
    }

    const now = nowIso();
    const messageId = uuidv4();
    await db.prepare(
      "INSERT INTO portal_ticket_messages (id, ticket_id, sender_type, sender_customer_user_id, body, created_at) VALUES (?, ?, 'customer', ?, ?, ?)"
    ).run(messageId, id, portalUser.id, body, now);

    for (const file of files) {
      const filename = `${uuidv4()}.${extForTicketMime(file.type)}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      await saveTicketAttachment(filename, buffer);
      await db.prepare(
        "INSERT INTO portal_ticket_attachments (id, message_id, filename, original_name, mime_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(uuidv4(), messageId, filename, file.name, file.type, file.size, now);
    }

    // Müşteri yeni mesaj yazınca, talep "çözüldü/kapandı" ise tekrar "açık"a dön.
    await db.prepare(
      "UPDATE portal_tickets SET durum = IF(durum IN ('cozuldu','kapandi'), 'acik', durum), updated_at = ? WHERE id = ?"
    ).run(now, id);

    return NextResponse.json({ ok: true, id: messageId }, { status: 201 });
  } catch (e) { return apiError(e); }
}
