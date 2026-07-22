/**
 * High-level WhatsApp send helper.
 *
 * Mirrors the sendPushToUser() signature so call-sites stay identical.
 * If the user has no whatsapp_phone set, or the WA client is not ready,
 * the function returns silently without throwing.
 */

import { getDb } from "@/lib/db";
import { getWAClient, getWAState } from "@/lib/whatsapp-client";

export async function sendWhatsAppToUser(
  userId: string,
  payload: { title: string; body?: string; url?: string }
): Promise<void> {
  const { state } = getWAState();
  if (state !== "ready") return;

  const client = getWAClient();
  if (!client) return;

  const db = getDb();
  const row = await db
    .prepare("SELECT whatsapp_phone FROM users WHERE id = ?")
    .get(userId) as { whatsapp_phone: string | null } | undefined;

  const phone = row?.whatsapp_phone?.trim();
  if (!phone) return;

  // Build message text (WhatsApp markdown: *bold*)
  const lines: string[] = [`*${payload.title}*`];
  if (payload.body) lines.push(payload.body);
  if (payload.url) lines.push(`🔗 ${payload.url}`);
  const message = lines.join("\n");

  try {
    // WA chat ID format: <international_number>@c.us
    await client.sendMessage(`${phone}@c.us`, message);
  } catch (e) {
    console.error(`[WhatsApp] sendMessage failed for user ${userId}:`, e);
  }
}

/**
 * Send a WhatsApp message to a raw phone number (no DB lookup).
 * Useful for broadcasts or admin-triggered messages.
 */
export async function sendWhatsAppToPhone(
  phone: string,
  payload: { title: string; body?: string; url?: string }
): Promise<void> {
  const { state } = getWAState();
  if (state !== "ready") return;

  const client = getWAClient();
  if (!client) return;

  const lines: string[] = [`*${payload.title}*`];
  if (payload.body) lines.push(payload.body);
  if (payload.url) lines.push(`🔗 ${payload.url}`);

  try {
    await client.sendMessage(`${phone.trim()}@c.us`, lines.join("\n"));
  } catch (e) {
    console.error(`[WhatsApp] sendMessage failed for phone ${phone}:`, e);
  }
}
