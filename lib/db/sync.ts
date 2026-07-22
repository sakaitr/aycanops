import { db } from './schema';

const LAST_SYNC_KEY = 'aycan_last_sync';
const SYNC_TABLES = ['vehicles', 'routes', 'trips', 'companies', 'entry_controls'] as const;
type SyncTable = typeof SYNC_TABLES[number];

// ─── Pull: Sunucudan delta kayıtları çek ────────────────────────────────────
export async function pull(since = 0): Promise<void> {
  const sinceIso = since ? new Date(since).toISOString() : new Date(0).toISOString();

  const res = await fetch(`/api/sync?since=${encodeURIComponent(sinceIso)}`, {
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error(`Sync pull failed: ${res.status}`);
  }

  const { data } = (await res.json()) as {
    data: Partial<Record<SyncTable, { id: string; updated_at: string }[]>>;
  };

  // Last Write Wins — ISO string karşılaştırması
  for (const table of SYNC_TABLES) {
    const records = data[table];
    if (!records?.length) continue;

    for (const remote of records) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const local = await (db[table] as any).get(remote.id);

      if (local?._dirty) {
        // Lokal değişiklik var — sunucu kaydını atla
        continue;
      }

      if (!local || remote.updated_at >= local.updated_at) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db[table] as any).put(remote);
      }
    }
  }

  localStorage.setItem(LAST_SYNC_KEY, Date.now().toString());
}

// ─── Push: Kuyruktaki değişiklikleri gönder ─────────────────────────────────
export async function push(): Promise<void> {
  const queue = await db.sync_queue.orderBy('timestamp').toArray();
  if (!queue.length) return;

  for (const item of queue) {
    try {
      const res = await fetch(item.endpoint, {
        method: item.method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: item.body,
      });

      if (res.ok) {
        await db.sync_queue.delete(item.id!);
      } else if (res.status >= 400 && res.status < 500) {
        // Kalıcı hata — kuyruktan sil
        await db.sync_queue.delete(item.id!);
      } else {
        // Geçici hata — retry say
        await db.sync_queue.update(item.id!, { retries: item.retries + 1 });
      }
    } catch {
      // Ağ hatası — bir sonraki sync'te tekrar
      await db.sync_queue.update(item.id!, { retries: item.retries + 1 });
    }
  }
}

// ─── Tam sync: push + pull ──────────────────────────────────────────────────
export async function fullSync(): Promise<void> {
  await push();
  const since = parseInt(localStorage.getItem(LAST_SYNC_KEY) || '0', 10);
  await pull(since);
}

export function getLastSyncTime(): number {
  return parseInt(localStorage.getItem(LAST_SYNC_KEY) || '0', 10);
}
