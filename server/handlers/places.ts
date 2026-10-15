import { parseQueryParams, runQuery, type PlacesResponse } from '../../src/lib/places/query';
import { OSM_ATTRIBUTION, OSM_LICENSE } from '../../src/lib/places/osm';
import { ProviderError } from '../overpass';
import { getSnapshot, lookupElements, snapshotKey, type SnapshotDeps } from '../snapshot';
import { clientIp, corsHeaders, createMemoryRateLimiter, errorBody, json, NO_STORE, publicCache } from '../http';

// GET /api/places?near=lat,lng&r=km | bbox=s,w,n,e | keys=k1,k2 | q=name  [&limit=&city=]
// Public, read-only café data. Responses are shareable and CDN-cached;
// nothing user-specific is ever included.

export interface PlacesHandlerDeps {
  getDeps(): Promise<SnapshotDeps>;
  env: () => Record<string, string | undefined>;
  /** Wall-clock budget for one request (Netlify sync functions time out at ~10 s by default). */
  budgetMs?: number;
  rateLimit?: { limit: number; windowMs: number };
  /** Ask a background function to build the snapshot (fire-and-forget). */
  kickRefresh?: (req: Request) => Promise<unknown>;
}

interface RequestContext {
  waitUntil?: (p: Promise<unknown>) => void;
}

export function createPlacesHandler(deps: PlacesHandlerDeps) {
  const limiter = createMemoryRateLimiter(deps.rateLimit?.limit ?? 120, deps.rateLimit?.windowMs ?? 60_000);
  // Netlify's synchronous limit is 60 s; leave headroom for the response.
  const budget = deps.budgetMs ?? 40_000;
  let lastKick = 0;

  return async function handler(req: Request, context?: RequestContext): Promise<Response> {
    const started = Date.now();
    const env = deps.env();
    const cors = corsHeaders(req, env);
    if (cors === false) return json(403, errorBody('origin_not_allowed', 'This origin may not call the API.'), NO_STORE);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '600' } });
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(405, errorBody('method_not_allowed', 'Use GET.'), { ...cors, ...NO_STORE, Allow: 'GET' });
    if (req.url.length > 2048) return json(414, errorBody('uri_too_long', 'Request URL is too long.'), { ...cors, ...NO_STORE });

    const wait = limiter.check(clientIp(req));
    if (wait) return json(429, errorBody('rate_limited', 'Too many requests. Please slow down.', true), { ...cors, ...NO_STORE, 'Retry-After': String(wait) });

    const parsed = parseQueryParams(new URL(req.url).searchParams);
    if (!parsed.ok) return json(parsed.status, parsed.error, { ...cors, ...NO_STORE });

    let tier = 'snapshot';
    // One structured line per request: what was asked (kind only), how it was served, how long it took.
    // No IP addresses, coordinates or search text are logged.
    const logRequest = (status: number, extra: Record<string, unknown> = {}) =>
      console.log(JSON.stringify({ evt: 'places_request', kind: parsed.query.kind, status, tier, ms: Date.now() - started, ...extra }));
    try {
      const sDeps = await deps.getDeps();
      const deadline = started + budget;
      if (!sDeps.cache.shared) tier = 'snapshot(memory-only)';
      const hadSnapshot = !!(await sDeps.cache.get(snapshotKey(parsed.cityId)));
      if (!hadSnapshot) tier = 'live';
      const { snapshot, stale } = await getSnapshot(sDeps, parsed.cityId, { deadline, allowLiveFetch: true });
      const result = runQuery(snapshot.places, parsed.query, parsed.limit);
      let places = result.places;
      let missing = result.missingKeys;
      if (parsed.query.kind === 'keys' && missing?.length) {
        const osmMissing = missing.filter((k) => k.startsWith('osm:'));
        if (osmMissing.length && Date.now() < deadline - 2000) {
          const extra = await lookupElements(sDeps, parsed.cityId, osmMissing, deadline);
          places = [...places, ...extra.found];
          missing = missing.filter((k) => !extra.found.some((f) => f.id === k));
        }
      }
      const body: PlacesResponse = {
        places,
        meta: {
          provider: 'openstreetmap',
          attribution: OSM_ATTRIBUTION,
          license: OSM_LICENSE,
          snapshotAt: snapshot.fetchedAt,
          sourceDataAt: snapshot.osmBase,
          stale,
          total: result.total,
          returned: places.length,
          truncated: result.total > places.length,
          ...(missing ? { missingKeys: missing } : {}),
        },
      };
      // Keys lookups change as places are found; cache them for less time.
      const cache = parsed.query.kind === 'keys' ? publicCache(60, 600, 3600) : publicCache(300, 1800, 86400);
      logRequest(200, { returned: places.length, total: result.total, snapshotAgeMin: Math.round((Date.now() - Date.parse(snapshot.fetchedAt)) / 60000), stale });
      return json(200, body, { ...cors, ...cache });
    } catch (e) {
      if (e instanceof ProviderError) {
        // Only now hand over to the background function (up to 15 min of patient, sequential retries).
        // Never in parallel with the request's own attempts: overpass-api.de limits concurrent queries per IP.
        if (deps.kickRefresh && Date.now() - lastKick > 120_000) {
          lastKick = Date.now();
          const kick = deps.kickRefresh(req).catch(() => undefined);
          context?.waitUntil?.(kick);
        }
        logRequest(503, { error: e.message, attempts: e.attempts.map((a) => `${a.host}:${a.status ?? a.outcome}:${a.ms}ms`) });
        return json(503, errorBody('provider_unavailable', 'Café data from OpenStreetMap couldn’t be loaded right now because the public map-data service is busy or unreachable. No other data is shown in its place. Please try again in a minute.', true), {
          ...cors,
          ...NO_STORE,
          'Retry-After': '60',
        });
      }
      logRequest(500, { error: (e as Error).name });
      return json(500, errorBody('internal_error', 'Something went wrong.', true), { ...cors, ...NO_STORE });
    }
  };
}
