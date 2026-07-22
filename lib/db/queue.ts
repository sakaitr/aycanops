import { db, type SyncQueueItem } from './schema';

// ─── Offline yazma kuyruğu ──────────────────────────────────────────────────
// Ağ yokken yapılan yazma işlemleri bu kuyruğa eklenir.
// Service Worker "sync-data" tag'i ile tetiklenince push() çalışır.

export async function enqueue(
  endpoint: string,
  method: SyncQueueItem['method'],
  body: object
): Promise<void> {
  await db.sync_queue.add({
    endpoint,
    method,
    body: JSON.stringify(body),
    timestamp: Date.now(),
    retries: 0,
  });

  // Background Sync API — SW üzerinden sıraya al
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if ('sync' in reg) {
        await (reg as ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } })
          .sync.register('sync-data');
      }
    } catch {
      // Background Sync API desteklenmiyor (iOS) — normal sync bekledir
    }
  }
}

// ─── Kuyruk durumu ─────────────────────────────────────────────────────────
export async function getPendingCount(): Promise<number> {
  return db.sync_queue.count();
}

export async function clearQueue(): Promise<void> {
  await db.sync_queue.clear();
}

// ─── Kolay yardımcılar — API çağrısı yerine bu fonksiyonlar kullanılır ─────

/**
 * Ağ varsa doğrudan fetch at; yoksa kuyruğa al.
 * İki durumda da aynı arayüz.
 */
export async function smartFetch(
  endpoint: string,
  method: SyncQueueItem['method'],
  body: object
): Promise<Response | null> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await enqueue(endpoint, method, body);
    return null; // Offline — kuyruğa alındı
  }

  const res = await fetch(endpoint, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });

  if (!res.ok && res.status >= 500) {
    // Sunucu hatası — kuyruğa al
    await enqueue(endpoint, method, body);
    return null;
  }

  return res;
}
