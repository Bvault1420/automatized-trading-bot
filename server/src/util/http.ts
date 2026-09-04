import { createLogger } from './logger.js';

const log = createLogger('http');

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

interface CacheEntry {
  expires: number;
  value: unknown;
}

const cache = new Map<string, CacheEntry>();

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  /** Antwort fuer diese Dauer (ms) zwischenspeichern. */
  cacheMs?: number;
  method?: 'GET' | 'POST';
  body?: unknown;
}

async function request(url: string, opts: FetchOptions): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 12_000);
  try {
    return await fetch(url, {
      method: opts.method ?? 'GET',
      signal: controller.signal,
      headers: {
        'user-agent': UA,
        accept: 'application/json, text/xml, application/xml, text/plain, */*',
        ...(opts.body ? { 'content-type': 'application/json' } : {}),
        ...opts.headers,
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function withRetry<T>(url: string, opts: FetchOptions, parse: (r: Response) => Promise<T>): Promise<T | null> {
  const retries = opts.retries ?? 1;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await request(url, opts);
      if (!res.ok) {
        // 4xx (ausser 429) sind dauerhaft – ein Retry bringt nichts.
        if (res.status < 500 && res.status !== 429) {
          log.debug(`${res.status} ${url.slice(0, 90)}`);
          return null;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      return await parse(res);
    } catch (err) {
      if (attempt === retries) {
        log.debug(`fehlgeschlagen: ${url.slice(0, 90)} (${(err as Error).message})`);
        return null;
      }
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  return null;
}

export async function getJson<T>(url: string, opts: FetchOptions = {}): Promise<T | null> {
  const key = `json:${opts.method ?? 'GET'}:${url}`;
  if (opts.cacheMs) {
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value as T;
  }
  const value = await withRetry<T>(url, opts, (r) => r.json() as Promise<T>);
  if (value !== null && opts.cacheMs) {
    cache.set(key, { expires: Date.now() + opts.cacheMs, value });
  }
  return value;
}

export async function getText(url: string, opts: FetchOptions = {}): Promise<string | null> {
  const key = `text:${url}`;
  if (opts.cacheMs) {
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value as string;
  }
  const value = await withRetry<string>(url, opts, (r) => r.text());
  if (value !== null && opts.cacheMs) {
    cache.set(key, { expires: Date.now() + opts.cacheMs, value });
  }
  return value;
}

/** Fuehrt `tasks` mit begrenzter Parallelitaet aus, damit APIs nicht limitieren. */
export async function pooled<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}
