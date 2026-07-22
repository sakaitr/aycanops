import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/events
 * Server-Sent Events — client'lara gerçek zamanlı sync bildirimi gönderir.
 * Bağlanan her client bir stream alır; server tarafında bir güncelleme olduğunda
 * client otomatik olarak /api/sync'i çağırır.
 *
 * Event formatı:
 *   data: {"type":"sync","tables":["vehicles","trips"]}\n\n
 *   data: {"type":"ping"}\n\n
 */

// Active streams registry (in-memory, single-instance)
const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();

function notifyClients(tables: string[]) {
  const payload = `data: ${JSON.stringify({ type: 'sync', tables, ts: Date.now() })}\n\n`;
  const encoded = new TextEncoder().encode(payload);
  for (const ctrl of clients) {
    try {
      ctrl.enqueue(encoded);
    } catch {
      clients.delete(ctrl);
    }
  }
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'Yetkisiz' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      // İlk bağlantı mesajı
      ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`));
      clients.add(ctrl);

      // Heartbeat — 25s aralıklarla ping (proxy timeout'larını önler)
      const timer = setInterval(() => {
        try {
          ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'ping' })}\n\n`));
        } catch {
          clearInterval(timer);
          clients.delete(ctrl);
        }
      }, 25_000);

      // Bağlantı kesildiğinde temizle
      req.signal.addEventListener('abort', () => {
        clearInterval(timer);
        clients.delete(ctrl);
        try { ctrl.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Nginx proxy buffering'i devre dışı bırak
    },
  });
}
