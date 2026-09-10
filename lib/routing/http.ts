/**
 * Ortak HTTP yardımcısı — self-hosted routing servisleri (Valhalla, VROOM).
 * Repo genelinde merkezi bir fetch helper yok; routing çağrıları buradan geçer:
 * timeout + tutarlı hata sarma.
 */

export class RoutingError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "RoutingError";
    this.cause = cause;
  }
}

export async function routingFetch<T = unknown>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 20_000, ...rest } = init;

  let res: Response;
  try {
    res = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new RoutingError(`Routing servisine ulaşılamadı: ${url}`, e);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new RoutingError(
      `Routing servisi HTTP ${res.status} (${url})${body ? `: ${body.slice(0, 300)}` : ""}`,
    );
  }

  return res.json() as Promise<T>;
}
