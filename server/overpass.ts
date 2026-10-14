import type { Bounds } from '../src/lib/cities';
import { parseOsmKey } from '../src/lib/places/keys';

// ───────────────────────────────────────────────────────────────
// Overpass API client (OpenStreetMap data).
// • Endpoints come ONLY from server configuration (never from a
//   request), so this cannot be abused for SSRF.
// • Hard timeouts, a bounded number of attempts, fallback endpoints,
//   and a small per-instance concurrency cap.
// • Callers are expected to cache aggressively: production traffic is
//   served from a shared snapshot refreshed a few times per day.
// Usage policy: https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances
// ───────────────────────────────────────────────────────────────

export const DEFAULT_OVERPASS_ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

export interface OverpassConfig {
  endpoints: string[];
  userAgent: string;
  fetch: typeof fetch;
  /** Total attempts across all endpoints. */
  maxAttempts: number;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export function overpassConfigFromEnv(env: Record<string, string | undefined>, fetchImpl: typeof fetch = fetch): OverpassConfig {
  const endpoints = (env.OVERPASS_URLS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => {
      try {
        return new URL(s).protocol === 'https:';
      } catch {
        return false;
      }
    });
  const contact = (env.OVERPASS_CONTACT ?? '').replace(/[^\w@.+:/ -]/g, '').slice(0, 120);
  const site = (env.URL ?? '').replace(/[^\w.:/-]/g, '').slice(0, 120);
  return {
    endpoints: endpoints.length ? endpoints : DEFAULT_OVERPASS_ENDPOINTS,
    userAgent: `THIRD-PLACE/1.0 (${[site, contact].filter(Boolean).join('; ') || 'café discovery app'})`,
    fetch: fetchImpl,
    maxAttempts: 3,
  };
}

const fmt = (n: number) => n.toFixed(5);
const bbox = (b: Bounds) => `${fmt(b.south)},${fmt(b.west)},${fmt(b.north)},${fmt(b.east)}`;

/** Every café-like venue in a bounding box. Exact-match filters keep the query cheap. */
export function areaQuery(b: Bounds, timeoutSec: number): string {
  const box = bbox(b);
  return `[out:json][timeout:${Math.max(5, Math.min(60, Math.floor(timeoutSec)))}];(nwr["amenity"="cafe"](${box});nwr["amenity"="ice_cream"](${box});nwr["amenity"="restaurant"]["cuisine"="coffee_shop"](${box}););out center tags;`;
}

/** Specific elements by OSM key (used for saved places missing from the snapshot). */
export function idsQuery(keys: string[], timeoutSec: number): string | null {
  const groups: Record<string, string[]> = { node: [], way: [], relation: [] };
  for (const k of keys) {
    const p = parseOsmKey(k);
    if (p) groups[p.type].push(p.id);
  }
  const parts = Object.entries(groups)
    .filter(([, ids]) => ids.length)
    .map(([type, ids]) => `${type}(id:${ids.join(',')});`);
  if (!parts.length) return null;
  return `[out:json][timeout:${Math.max(5, Math.min(25, Math.floor(timeoutSec)))}];(${parts.join('')});out center tags;`;
}

// Per-instance concurrency cap (the shared snapshot is the real throttle).
let active = 0;
const waiters: (() => void)[] = [];
const MAX_CONCURRENT = 2;
async function acquire() {
  if (active < MAX_CONCURRENT) {
    active++;
    return;
  }
  await new Promise<void>((r) => waiters.push(r));
  active++;
}
function release() {
  active--;
  waiters.shift()?.();
}

export interface OverpassResult {
  elements: unknown[];
  /** Timestamp of the OSM data the server answered from. */
  osmBase: string | null;
}

const RETRYABLE = new Set([429, 502, 503, 504]);

export async function runOverpass(query: string, cfg: OverpassConfig, deadline: number): Promise<OverpassResult> {
  let attempt = 0;
  let lastError: ProviderError = new ProviderError('No Overpass endpoint configured', false);
  await acquire();
  try {
    while (attempt < cfg.maxAttempts) {
      const endpoint = cfg.endpoints[attempt % cfg.endpoints.length];
      attempt++;
      const remaining = deadline - Date.now();
      if (remaining < 1500) break;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), remaining);
      try {
        const res = await cfg.fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': cfg.userAgent, Accept: 'application/json' },
          body: new URLSearchParams({ data: query }).toString(),
          signal: ctrl.signal,
        });
        if (!res.ok) {
          lastError = new ProviderError(`Overpass responded ${res.status}`, RETRYABLE.has(res.status));
          if (!lastError.retryable) break;
          await new Promise((r) => setTimeout(r, Math.min(800 * attempt, Math.max(0, deadline - Date.now() - 1500))));
          continue;
        }
        const text = await res.text();
        if (text.length > 15_000_000) throw new ProviderError('Overpass response too large', false);
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          lastError = new ProviderError('Overpass returned invalid JSON', true);
          continue;
        }
        const body = json as { elements?: unknown; remark?: unknown; osm3s?: { timestamp_osm_base?: unknown } };
        if (!Array.isArray(body.elements)) {
          lastError = new ProviderError('Overpass returned an unexpected shape', true);
          continue;
        }
        // A "remark" with an error means the server gave up part-way: treat as failure, never as "no cafés".
        if (typeof body.remark === 'string' && /error|timeout|out of memory/i.test(body.remark)) {
          lastError = new ProviderError('Overpass query did not complete', true);
          continue;
        }
        const base = typeof body.osm3s?.timestamp_osm_base === 'string' ? body.osm3s.timestamp_osm_base : null;
        return { elements: body.elements, osmBase: base };
      } catch (e) {
        if (e instanceof ProviderError) throw e;
        lastError = new ProviderError((e as Error).name === 'AbortError' ? 'Overpass request timed out' : 'Could not reach Overpass', true);
      } finally {
        clearTimeout(timer);
      }
    }
  } finally {
    release();
  }
  throw lastError;
}
