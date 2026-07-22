/**
 * lib/fcm.ts — Firebase Cloud Messaging (server-side)
 *
 * Requires env vars:
 *   FIREBASE_SERVICE_ACCOUNT_JSON  — stringified service account JSON
 *   (or individual: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)
 *
 * Falls back to no-op if not configured.
 */

import type { App } from "firebase-admin/app";

let _app: App | null = null;
let _initialized = false;

function getFirebaseApp(): App | null {
  if (_initialized) return _app;
  _initialized = true;

  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!saJson && !(projectId && clientEmail && privateKey)) {
    console.warn("[FCM] Firebase credentials not configured — FCM push disabled");
    return null;
  }

  try {
    const { initializeApp, getApps, cert } = require("firebase-admin/app");

    if (getApps().length > 0) {
      _app = getApps()[0];
      return _app;
    }

    const credential = saJson
      ? cert(JSON.parse(saJson))
      : cert({ projectId: projectId!, clientEmail: clientEmail!, privateKey: privateKey! });

    _app = initializeApp({ credential });
    return _app;
  } catch (err) {
    console.error("[FCM] Firebase init error:", err);
    return null;
  }
}

export async function sendFcmToToken(
  fcmToken: string,
  payload: { title: string; body?: string; url?: string }
): Promise<boolean> {
  const app = getFirebaseApp();
  if (!app) return false;

  try {
    const { getMessaging } = require("firebase-admin/messaging");
    await getMessaging(app).send({
      token: fcmToken,
      notification: { title: payload.title, body: payload.body || "" },
      data: { url: payload.url || "/" },
      android: { priority: "high" },
      apns: { payload: { aps: { sound: "default", badge: 1 } } },
    });
    return true;
  } catch (err: any) {
    // Invalid or expired token
    if (
      err?.code === "messaging/registration-token-not-registered" ||
      err?.code === "messaging/invalid-registration-token"
    ) {
      return false; // caller should delete the token
    }
    console.error("[FCM] send error:", err);
    return false;
  }
}

export async function sendFcmToMultiple(
  tokens: string[],
  payload: { title: string; body?: string; url?: string }
): Promise<{ success: string[]; failed: string[] }> {
  const app = getFirebaseApp();
  if (!app || tokens.length === 0) return { success: [], failed: [] };

  const { getMessaging } = require("firebase-admin/messaging");
  const messaging = getMessaging(app);

  const results = await Promise.allSettled(
    tokens.map(token =>
      messaging.send({
        token,
        notification: { title: payload.title, body: payload.body || "" },
        data: { url: payload.url || "/" },
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default", badge: 1 } } },
      })
    )
  );

  const success: string[] = [];
  const failed: string[] = [];

  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      success.push(tokens[i]);
    } else {
      failed.push(tokens[i]);
    }
  });

  return { success, failed };
}
