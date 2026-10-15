import { config } from '../config';
import { DEFAULT_CITY } from '../cities';
import { queryToSearchParams, type PlacesQuery, type PlacesResponse } from './query';

// Browser client for GET /api/places with:
//  • request de-duplication (identical in-flight requests share one fetch)
//  • a short in-memory cache (the CDN caches for longer)
//  • cancellation of obsolete requests via AbortSignal
//  • structured, user-presentable errors

export class PlacesApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'PlacesApiError';
  }
}

const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 80;
const cache = new Map<string, { at: number; promise: Promise<PlacesResponse> }>();

async function request(url: string): Promise<PlacesResponse> {
  let res: Response;
  try {
    // Must exceed the server budget (40 s; Netlify caps synchronous functions at 60 s).
    res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(50_000) });
  } catch (e) {
    const timeout = (e as Error).name === 'TimeoutError';
    throw new PlacesApiError(timeout ? 'The café data service took too long to respond.' : 'Can’t reach the café data service. Check your connection.', 'network_error', true, null);
  }
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) {
    throw new PlacesApiError('The café data service isn’t available on this deployment.', 'api_unreachable', false, res.status);
  }
  const body = (await res.json().catch(() => null)) as (PlacesResponse & { error?: { code: string; message: string; retryable: boolean } }) | null;
  if (!res.ok || !body || body.error) {
    throw new PlacesApiError(body?.error?.message ?? `Request failed (${res.status}).`, body?.error?.code ?? 'http_error', body?.error?.retryable ?? res.status >= 500, res.status);
  }
  if (!Array.isArray(body.places) || !body.meta) throw new PlacesApiError('Unexpected response from the café data service.', 'bad_response', true, res.status);
  return body;
}

/** Resolves with the response, or rejects with AbortError when `signal` aborts (the shared fetch continues for other callers). */
export function fetchPlaces(query: PlacesQuery, opts: { signal?: AbortSignal; limit?: number; cityId?: string } = {}): Promise<PlacesResponse> {
  const params = queryToSearchParams(query, { cityId: opts.cityId ?? DEFAULT_CITY.id, limit: opts.limit });
  const url = `${config.apiBase}/places?${params}`;
  const now = Date.now();
  let entry = cache.get(url);
  if (!entry || now - entry.at > TTL_MS) {
    const promise = request(url);
    entry = { at: now, promise };
    cache.set(url, entry);
    if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
    promise.catch(() => {
      if (cache.get(url)?.promise === promise) cache.delete(url);
    });
  }
  const shared = entry.promise;
  const signal = opts.signal;
  if (!signal) return shared;
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    shared.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}

export function clearPlacesCache() {
  cache.clear();
}
