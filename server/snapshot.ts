import type { Cafe } from '../src/types';
import { getCity } from '../src/lib/cities';
import { normalizeOsmElements, type NormalizeSummary } from '../src/lib/places/osm';
import type { Cache } from './cache';
import { areaQuery, idsQuery, ProviderError, runOverpass, type OverpassConfig } from './overpass';

// ───────────────────────────────────────────────────────────────
// City snapshot: every café-like OSM venue in the city, normalised,
// deduplicated and stored in the shared cache. A scheduled function
// refreshes it every 6 hours, so visitor traffic never translates into
// Overpass traffic. If no snapshot exists yet (fresh deploy / local
// dev), one live fetch is attempted within the request deadline.
//
// Storing OSM data is permitted under the ODbL with attribution; we
// keep only the tags we use and always show "© OpenStreetMap contributors".
// ───────────────────────────────────────────────────────────────

export const SNAPSHOT_VERSION = 'v1';
/** Target freshness. Older snapshots are still served, flagged `stale`. */
export const SNAPSHOT_FRESH_MS = 12 * 60 * 60 * 1000;
/** Don't hammer the provider after a failure (per instance). */
const FAILURE_BACKOFF_MS = 60 * 1000;
const ELEMENT_TTL_MS = 24 * 60 * 60 * 1000;

export interface Snapshot {
  cityId: string;
  places: Cafe[];
  fetchedAt: string;
  osmBase: string | null;
  stats: Pick<NormalizeSummary, 'skipped' | 'duplicatesRemoved'> & { elements: number };
}

export interface SnapshotDeps {
  cache: Cache;
  overpass: OverpassConfig;
  now?: () => number;
}

export const snapshotKey = (cityId: string) => `snapshot/${SNAPSHOT_VERSION}/${cityId}`;

const lastFailure = new Map<string, number>();
const inflight = new Map<string, Promise<Snapshot>>();

export async function fetchSnapshot(deps: SnapshotDeps, cityId: string, deadline: number): Promise<Snapshot> {
  const city = getCity(cityId);
  const now = deps.now ?? Date.now;
  const timeoutSec = Math.max(5, Math.floor((deadline - now()) / 1000) - 1);
  const result = await runOverpass(areaQuery(city.bounds, timeoutSec), deps.overpass, deadline);
  const fetchedAt = new Date(now()).toISOString();
  const summary = normalizeOsmElements(result.elements, { cityId: city.id, fetchedAt });
  return {
    cityId: city.id,
    places: summary.places,
    fetchedAt,
    osmBase: result.osmBase,
    stats: { skipped: summary.skipped, duplicatesRemoved: summary.duplicatesRemoved, elements: result.elements.length },
  };
}

/**
 * Snapshot for serving requests. Prefers the shared cache; falls back to a
 * single live fetch (deduplicated across concurrent requests) when empty.
 */
export async function getSnapshot(
  deps: SnapshotDeps,
  cityId: string,
  opts: { deadline: number; allowLiveFetch: boolean },
): Promise<{ snapshot: Snapshot; stale: boolean }> {
  const now = deps.now ?? Date.now;
  const cached = await deps.cache.get<Snapshot>(snapshotKey(cityId));
  if (cached) return { snapshot: cached.value, stale: now() - Date.parse(cached.value.fetchedAt) > SNAPSHOT_FRESH_MS };

  if (!opts.allowLiveFetch) throw new ProviderError('No data snapshot is available yet', true);
  const failedAt = lastFailure.get(cityId);
  if (failedAt && now() - failedAt < FAILURE_BACKOFF_MS) throw new ProviderError('Café data provider is temporarily unavailable', true);

  let p = inflight.get(cityId);
  if (!p) {
    p = fetchSnapshot(deps, cityId, opts.deadline)
      .then(async (snap) => {
        if (snap.places.length > 0) await deps.cache.set(snapshotKey(cityId), snap);
        return snap;
      })
      .catch((e) => {
        lastFailure.set(cityId, now());
        throw e;
      })
      .finally(() => inflight.delete(cityId));
    inflight.set(cityId, p);
  }
  return { snapshot: await p, stale: false };
}

export interface RefreshOutcome {
  cityId: string;
  updated: boolean;
  reason: string;
  count: number;
  previousCount: number | null;
}

/**
 * Scheduled refresh. Refuses to replace a good snapshot with a suspiciously
 * small one (e.g. a provider that silently returned partial data).
 */
export async function refreshSnapshot(deps: SnapshotDeps, cityId: string, deadline: number): Promise<RefreshOutcome> {
  const previous = await deps.cache.get<Snapshot>(snapshotKey(cityId));
  const prevCount = previous?.value.places.length ?? null;
  const snap = await fetchSnapshot(deps, cityId, deadline);
  if (snap.places.length === 0) return { cityId, updated: false, reason: 'provider returned no places; kept previous snapshot', count: 0, previousCount: prevCount };
  if (prevCount != null && snap.places.length < prevCount * 0.5) {
    return { cityId, updated: false, reason: 'new snapshot is less than half the previous size; kept previous', count: snap.places.length, previousCount: prevCount };
  }
  await deps.cache.set(snapshotKey(cityId), snap);
  return { cityId, updated: true, reason: 'refreshed', count: snap.places.length, previousCount: prevCount };
}

const LOCK_TTL_MS = 5 * 60 * 1000;
const lockKey = (cityId: string) => `refresh-lock/${cityId}`;

/**
 * Long-running refresh for a Background Function (up to 15 minutes): skips
 * when a fresh snapshot exists or another refresh holds the lock, and retries
 * slow/overloaded Overpass servers with generous timeouts.
 */
export async function backgroundRefresh(deps: SnapshotDeps, cityId: string, opts: { maxMs: number; minAgeMs?: number }): Promise<RefreshOutcome | { cityId: string; updated: false; reason: string }> {
  const now = deps.now ?? Date.now;
  const existing = await deps.cache.get<Snapshot>(snapshotKey(cityId));
  if (existing && now() - Date.parse(existing.value.fetchedAt) < (opts.minAgeMs ?? 30 * 60 * 1000)) {
    return { cityId, updated: false, reason: 'snapshot is fresh; nothing to do' };
  }
  const lock = await deps.cache.get<number>(lockKey(cityId));
  if (lock && now() - lock.value < LOCK_TTL_MS) return { cityId, updated: false, reason: 'another refresh is in progress' };
  await deps.cache.set(lockKey(cityId), now());
  const end = now() + opts.maxMs;
  let lastError = 'unknown error';
  for (let attempt = 1; now() < end - 10_000; attempt++) {
    try {
      const outcome = await refreshSnapshot({ ...deps, overpass: { ...deps.overpass, maxAttempts: 2 } }, cityId, Math.min(end, now() + 120_000));
      await deps.cache.set(lockKey(cityId), 0);
      return outcome;
    } catch (e) {
      lastError = (e as Error).message;
      // Back off: 15 s, 30 s, 60 s… (bounded by the overall budget)
      await new Promise((r) => setTimeout(r, Math.min(15_000 * 2 ** (attempt - 1), Math.max(0, end - now() - 10_000))));
    }
  }
  await deps.cache.set(lockKey(cityId), 0);
  return { cityId, updated: false, reason: `gave up: ${lastError}` };
}

/**
 * Look up specific OSM elements that aren't in the snapshot (e.g. a saved
 * place just outside the city, or a snapshot that predates it). Cached per key.
 */
export async function lookupElements(deps: SnapshotDeps, cityId: string, keys: string[], deadline: number): Promise<{ found: Cafe[]; missing: string[] }> {
  const now = deps.now ?? Date.now;
  const found: Cafe[] = [];
  const toFetch: string[] = [];
  for (const k of keys) {
    const hit = await deps.cache.get<Cafe | null>(`element/${SNAPSHOT_VERSION}/${k}`);
    if (hit && now() - hit.storedAt < ELEMENT_TTL_MS) {
      if (hit.value) found.push(hit.value);
    } else toFetch.push(k);
  }
  if (!toFetch.length) return { found, missing: keys.filter((k) => !found.some((f) => f.id === k)) };
  const q = idsQuery(toFetch, Math.max(5, Math.floor((deadline - now()) / 1000) - 1));
  if (!q) return { found, missing: keys.filter((k) => !found.some((f) => f.id === k)) };
  try {
    const res = await runOverpass(q, deps.overpass, deadline);
    // Elements outside the city are still valid places (a saved café elsewhere): use a padded check by the city id only for labels.
    const summary = normalizeOsmElements(res.elements, { cityId, fetchedAt: new Date(now()).toISOString() });
    for (const k of toFetch) {
      const place = summary.places.find((p) => p.id === k) ?? null;
      await deps.cache.set(`element/${SNAPSHOT_VERSION}/${k}`, place); // null = confirmed gone / not a café
      if (place) found.push(place);
    }
  } catch {
    // Provider down: report as missing for now; nothing is cached so we retry later.
  }
  return { found, missing: keys.filter((k) => !found.some((f) => f.id === k)) };
}

/** Test hook: clear per-instance state (failure backoff and in-flight requests). */
export function resetSnapshotStateForTests() {
  lastFailure.clear();
  inflight.clear();
}
