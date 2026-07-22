'use client';

import { useState, useEffect, useCallback } from 'react';
import { fullSync, getLastSyncTime } from '@/lib/db/sync';
import { getPendingCount } from '@/lib/db/queue';

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSync: number;       // Unix ms
  pendingCount: number;   // Kuyruktaki bekleyen işlem sayısı
  error: string | null;
}

/**
 * Ağ bağlantısı ve sync durumunu izler.
 * Online gelince otomatik full sync yapar.
 */
export function useSyncStatus(): SyncStatus & { syncNow: () => Promise<void> } {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const doSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setError(null);
    try {
      await fullSync();
      setLastSync(getLastSyncTime());
      setPendingCount(await getPendingCount());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync hatası');
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  useEffect(() => {
    // Başlangıç değerleri
    setIsOnline(navigator.onLine);
    setLastSync(getLastSyncTime());
    getPendingCount().then(setPendingCount);

    const handleOnline = () => {
      setIsOnline(true);
      doSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periyodik sync — her 5 dakikada bir
    const interval = setInterval(() => {
      if (navigator.onLine && !isSyncing) doSync();
    }, 5 * 60 * 1000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [doSync, isSyncing]);

  return { isOnline, isSyncing, lastSync, pendingCount, error, syncNow: doSync };
}
