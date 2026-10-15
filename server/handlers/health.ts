import { CITIES } from '../../src/lib/cities';
import { refreshStatusKey, snapshotKey, type RefreshStatus, type Snapshot, type SnapshotDeps } from '../snapshot';
import { clientIp, createMemoryRateLimiter, json, NO_STORE } from '../http';
import { buildUserAgent } from '../overpass';

// GET /api/health: operational diagnostics for the café data pipeline.
// Safe to expose: no secrets, no user data, no request contents. It reports
// whether the shared cache works, how old each city snapshot is, and the
// outcome (per provider host) of the most recent refresh attempt.

export function createHealthHandler(deps: { getDeps(): Promise<SnapshotDeps>; env: () => Record<string, string | undefined> }) {
  const limiter = createMemoryRateLimiter(30, 60_000);
  return async function handler(req: Request): Promise<Response> {
    const wait = limiter.check(clientIp(req));
    if (wait) return json(429, { error: { code: 'rate_limited', message: 'Too many requests.', retryable: true } }, { ...NO_STORE, 'Retry-After': String(wait) });
    if (req.method !== 'GET') return json(405, { error: { code: 'method_not_allowed', message: 'Use GET.', retryable: false } }, { ...NO_STORE, Allow: 'GET' });
    const sDeps = await deps.getDeps();
    const env = deps.env();
    const cities = [];
    for (const id of Object.keys(CITIES)) {
      const snap = await sDeps.cache.get<Snapshot>(snapshotKey(id));
      const status = await sDeps.cache.get<RefreshStatus>(refreshStatusKey(id));
      cities.push({
        id,
        snapshot: snap
          ? {
              present: true,
              places: snap.value.places.length,
              fetchedAt: snap.value.fetchedAt,
              ageMinutes: Math.round((Date.now() - Date.parse(snap.value.fetchedAt)) / 60000),
              sourceDataAt: snap.value.osmBase,
              skipped: snap.value.stats.skipped,
            }
          : { present: false },
        lastRefresh: status?.value ?? null,
      });
    }
    const ready = cities.every((c) => c.snapshot.present);
    return json(
      ready ? 200 : 503,
      {
        ok: ready,
        sharedCache: sDeps.cache.shared ? 'netlify-blobs' : 'memory-only (snapshots are NOT shared between function instances)',
        overpassEndpoints: sDeps.overpass.endpoints.map((u) => {
          try {
            return new URL(u).host;
          } catch {
            return 'invalid';
          }
        }),
        // Whether OVERPASS_CONTACT is a usable e-mail (the address itself is not shown).
        overpassContactConfigured: buildUserAgent(env.OVERPASS_CONTACT).includes('contact:'),
        overpassContactIgnored: !!(env.OVERPASS_CONTACT ?? '').trim() && !buildUserAgent(env.OVERPASS_CONTACT).includes('contact:'),
        cities,
      },
      NO_STORE,
    );
  };
}
