'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/db/schema';
import { pull, getLastSyncTime } from '@/lib/db/sync';
import type { Table } from 'dexie';

interface UseOfflineDataOptions {
  /** İlk yüklemede sunucudan pull yap */
  fetchOnMount?: boolean;
}

interface UseOfflineDataResult<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  lastSync: number;
}

/**
 * Dexie IndexedDB'den veri oku.
 * İlk yüklemede ve network online gelince sunucudan pull yapar.
 *
 * Kullanım:
 *   const { data, loading } = useOfflineData<LocalArac>('araclar');
 */
export function useOfflineData<T extends { id: number }>(
  tableName: keyof typeof db,
  options: UseOfflineDataOptions = {}
): UseOfflineDataResult<T> {
  const { fetchOnMount = true } = options;
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState(0);

  const table = db[tableName] as unknown as Table<T>;

  const loadLocal = async () => {
    const rows = await table.toArray();
    setData(rows);
  };

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      if (navigator.onLine) {
        const since = getLastSyncTime();
        await pull(since);
        setLastSync(getLastSyncTime());
      }
      await loadLocal();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Veri yüklenemedi');
      // Offline — lokal veriden devam et
      await loadLocal();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      // Önce lokal veriden yükle (hızlı göster)
      const localRows = await table.toArray();
      if (!cancelled) {
        setData(localRows);
        setLoading(localRows.length === 0); // lokal veri varsa loading false
      }

      if (fetchOnMount && navigator.onLine) {
        try {
          const since = getLastSyncTime();
          await pull(since);
          setLastSync(getLastSyncTime());
          const fresh = await table.toArray();
          if (!cancelled) setData(fresh);
        } catch {
          // Pull hata verdi — lokal veriden devam et
        }
      }

      if (!cancelled) setLoading(false);
    };

    init();

    // Canlı dinle — Dexie observable (dexie-react-hooks alternatif)
    // Basit: network online gelince refresh
    const handleOnline = () => refresh();
    window.addEventListener('online', handleOnline);

    return () => {
      cancelled = true;
      window.removeEventListener('online', handleOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableName]);

  return { data, loading, error, refresh, lastSync };
}
