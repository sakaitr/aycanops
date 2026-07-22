"use client";

import { useEffect } from "react";

async function setupPushSubscription(reg: ServiceWorkerRegistration) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    const existing = await reg.pushManager.getSubscription();
    if (existing) return; // Already subscribed

    const keyRes = await fetch("/api/push/subscribe");
    const keyData = await keyRes.json();
    if (!keyData.vapidPublicKey) return;

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyData.vapidPublicKey,
    });

    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
  } catch {
    // Push not supported or denied - silent fail
  }
}

export default function PWARegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (sessionStorage.getItem("aycan-sw-refreshing") === "1") return;
        sessionStorage.setItem("aycan-sw-refreshing", "1");
        window.location.reload();
      });

      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((reg) => {
          console.log("[SW] Registered:", reg.scope);
          reg.update().catch(() => undefined);
          reg.addEventListener("updatefound", () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                  newWorker.postMessage("skipWaiting");
                }
              });
            }
          });
          // Setup push subscription after SW is active
          if (reg.active) {
            setupPushSubscription(reg);
          } else {
            reg.addEventListener("activate", () => setupPushSubscription(reg));
          }
        })
        .catch((err) => console.warn("[SW] Registration failed:", err));
    }
  }, []);

  return null;
}
