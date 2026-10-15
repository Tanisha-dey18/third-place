import { getCity, withinBounds } from '../../src/lib/cities';
import { sanitizeSearch } from '../../src/lib/places/query';
import type { Cache } from '../cache';
import type { SharedRateLimiter } from '../rateLimit';
import { clientIp, corsHeaders, createMemoryRateLimiter, errorBody, json, NO_STORE, publicCache } from '../http';

// GET /api/geocode?q=Hindustan Park  → up to 5 named areas inside the city.
// Uses OpenStreetMap Nominatim under its usage policy: an identifying
// User-Agent, ≤ 1 request/second, results cached for 30 days, and only
// on explicit submit (no as-you-type autocomplete).
// https://operations.osmfoundation.org/policies/nominatim/

export interface GeocodeResult {
  name: string;
  displayName: string;
  lat: number;
  lng: number;
  type: string;
}

export interface GeocodeDeps {
  /** Shared limiter applied before calls that reach Nominatim (optional; tests may omit). */
  sharedLimiter?: SharedRateLimiter;
  cache: () => Promise<Cache>;
  fetch: typeof fetch;
  env: () => Record<string, string | undefined>;
  now?: () => number;
}

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
let lastCall = 0;

export function createGeocodeHandler(deps: GeocodeDeps) {
  const limiter = createMemoryRateLimiter(20, 60_000);
  const now = deps.now ?? Date.now;

  return async function handler(req: Request): Promise<Response> {
    const env = deps.env();
    const cors = corsHeaders(req, env);
    if (cors === false) return json(403, errorBody('origin_not_allowed', 'This origin may not call the API.'), NO_STORE);
    if (req.method !== 'GET') return json(405, errorBody('method_not_allowed', 'Use GET.'), { ...cors, ...NO_STORE, Allow: 'GET' });
    const wait = limiter.check(clientIp(req));
    if (wait) return json(429, errorBody('rate_limited', 'Too many searches. Please wait a moment.', true), { ...cors, ...NO_STORE, 'Retry-After': String(wait) });

    const url = new URL(req.url);
    const city = getCity(url.searchParams.get('city'));
    const q = sanitizeSearch(url.searchParams.get('q') ?? '');
    if (q.length < 3) return json(400, errorBody('invalid_request', 'Type at least 3 letters.'), { ...cors, ...NO_STORE });

    const cache = await deps.cache();
    const key = `geocode/v1/${city.id}/${q.toLowerCase()}`;
    const hit = await cache.get<GeocodeResult[]>(key);
    if (hit && now() - hit.storedAt < CACHE_TTL_MS) return json(200, { results: hit.value, attribution: '© OpenStreetMap contributors' }, { ...cors, ...publicCache(3600, 86400, 604800) });

    if (deps.sharedLimiter) {
      const decision = await deps.sharedLimiter.check(clientIp(req));
      if (!decision.allowed) return json(429, errorBody('rate_limited', 'Too many searches. Please wait a moment.', true), { ...cors, ...NO_STORE, 'Retry-After': String(decision.retryAfter) });
    }
    // Respect 1 request/second (per instance; the 30-day cache keeps volume tiny).
    const gap = now() - lastCall;
    if (gap < 1100) {
      if (gap < 0 || 1100 - gap > 1500) return json(503, errorBody('busy', 'Search is busy. Try again in a second.', true), { ...cors, ...NO_STORE, 'Retry-After': '1' });
      await new Promise((r) => setTimeout(r, 1100 - gap));
    }
    lastCall = now();

    const b = city.bounds;
    const params = new URLSearchParams({
      q: `${q}, ${city.name}`,
      format: 'jsonv2',
      limit: '5',
      bounded: '1',
      viewbox: `${b.west},${b.north},${b.east},${b.south}`,
      countrycodes: city.country.toLowerCase(),
      'accept-language': 'en',
    });
    const contact = (env.OVERPASS_CONTACT ?? '').replace(/[^\w@.+:/ -]/g, '').slice(0, 120);
    try {
      const res = await deps.fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { 'User-Agent': `THIRD-PLACE/1.0 (${contact || 'café discovery app'})`, Accept: 'application/json' },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as unknown;
      if (!Array.isArray(data)) throw new Error('shape');
      const results: GeocodeResult[] = data
        .map((d) => d as { lat?: string; lon?: string; name?: string; display_name?: string; addresstype?: string; type?: string })
        .map((d) => ({
          name: String(d.name || d.display_name || '').slice(0, 80),
          displayName: String(d.display_name ?? '').slice(0, 200),
          lat: Number(d.lat),
          lng: Number(d.lon),
          type: String(d.addresstype ?? d.type ?? '').slice(0, 30),
        }))
        .filter((r) => r.name && Number.isFinite(r.lat) && Number.isFinite(r.lng) && withinBounds(r.lat, r.lng, b));
      await cache.set(key, results);
      return json(200, { results, attribution: '© OpenStreetMap contributors' }, { ...cors, ...publicCache(3600, 86400, 604800) });
    } catch {
      return json(503, errorBody('provider_unavailable', 'Area search is temporarily unavailable. Pick a neighbourhood from the list instead.', true), {
        ...cors,
        ...NO_STORE,
        'Retry-After': '30',
      });
    }
  };
}
