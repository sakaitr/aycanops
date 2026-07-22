import webpush from "web-push";
import { getDb } from "@/lib/db";
import { sendFcmToToken } from "@/lib/fcm";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@aycanops.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

/** Send VAPID web push to all browser subscriptions of a user */
async function sendVapidToUser(
  userId: string,
  payload: { title: string; body?: string; url?: string }
) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  const db = getDb();
  const subs = await db.prepare(
    `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?`
  ).all(userId) as { id: string; endpoint: string; p256dh: string; auth: string }[];

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title: payload.title, body: payload.body || "", url: payload.url || "/" })
      );
    } catch (err: any) {
      // 410 Gone: subscription expired - remove it
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        await db.prepare(`DELETE FROM push_subscriptions WHERE id = ?`).run(sub.id);
      }
    }
  }
}

/** Send FCM push to all native tokens (iOS/Android) of a user */
async function sendFcmToUser(
  userId: string,
  payload: { title: string; body?: string; url?: string }
) {
  const db = getDb();
  const tokens = await db.prepare(
    `SELECT id, fcm_token FROM push_tokens WHERE user_id = ?`
  ).all(userId) as { id: string; fcm_token: string }[];

  const staleIds: string[] = [];
  for (const t of tokens) {
    const ok = await sendFcmToToken(t.fcm_token, payload);
    if (!ok) staleIds.push(t.id);
  }

  // Clean up expired/invalid tokens
  for (const id of staleIds) {
    await db.prepare(`DELETE FROM push_tokens WHERE id = ?`).run(id);
  }
}

/**
 * Send push notification to a user via both VAPID (web) and FCM (native).
 * Use this as the single entry point for all push sends.
 */
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body?: string; url?: string }
) {
  await Promise.allSettled([
    sendVapidToUser(userId, payload),
    sendFcmToUser(userId, payload),
  ]);
}

export { VAPID_PUBLIC_KEY };
