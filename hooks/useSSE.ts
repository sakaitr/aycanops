'use client';

import { useEffect, useRef, useCallback } from 'react';

interface SSEOptions {
  /** SSE bağlantısı kurulduğunda çağrılır */
  onConnected?: () => void;
  /** Sunucudan sync bildirimi geldiğinde çağrılır */
  onSync?: (tables: string[]) => void;
  /** Bağlantı kesildiğinde kaç ms sonra yeniden bağlanılacak (default 5000) */
  reconnectDelay?: number;
  /** false ise SSE bağlantısı kurulmaz */
  enabled?: boolean;
}

/**
 * useSSE — /api/events üzerinden Server-Sent Events dinler.
 * Otomatik yeniden bağlanma (exponential backoff) desteği içerir.
 *
 * @example
 * useSSE({ onSync: (tables) => { if (tables.includes('vehicles')) refetch(); } });
 */
export function useSSE(options: SSEOptions = {}) {
  const {
    onConnected,
    onSync,
    reconnectDelay = 5_000,
    enabled = true,
  } = options;

  const esRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayRef = useRef(reconnectDelay);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current || !enabled) return;

    try {
      const es = new EventSource('/api/events');
      esRef.current = es;

      es.addEventListener('message', (e) => {
        try {
          const msg = JSON.parse(e.data) as {
            type: 'connected' | 'sync' | 'ping';
            tables?: string[];
          };

          if (msg.type === 'connected') {
            delayRef.current = reconnectDelay; // Reset backoff
            onConnected?.();
          } else if (msg.type === 'sync' && msg.tables) {
            onSync?.(msg.tables);
          }
          // ping → no-op
        } catch {
          // malformed message — ignore
        }
      });

      es.addEventListener('error', () => {
        es.close();
        esRef.current = null;

        if (!mountedRef.current) return;

        // Exponential backoff: 5s → 10s → 20s → 40s → max 60s
        const delay = Math.min(delayRef.current, 60_000);
        delayRef.current = Math.min(delayRef.current * 2, 60_000);

        timerRef.current = setTimeout(connect, delay);
      });
    } catch (err) {
      // EventSource not supported (e.g. test env) — silently skip
      console.warn('[useSSE] EventSource not available:', err);
    }
  }, [enabled, onConnected, onSync, reconnectDelay]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) connect();

    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [connect, enabled]);
}
