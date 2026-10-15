import type { Bounds } from '../src/lib/cities';
import { parseOsmKey } from '../src/lib/places/keys';

// ───────────────────────────────────────────────────────────────
// Overpass API client (OpenStreetMap data).
// • Endpoints come ONLY from server configuration (never from a
//   request), so this cannot be abused for SSRF.
// • Bounded attempts across backends: a failed attempt (e.g. 504) moves
//   straight on to the next backend; an attempt that hangs past
//   `hedgeAfterMs` gets one parallel hedge. The first valid answer wins and
//   the rest are aborted. Never more than 2 in flight per query, never more
//   than `maxAttempts` in total. (overpass-api.de limits concurrent queries
//   per IP, so parallelism is deliberately minimal.)
// • Every attempt is logged (host, status, duration, outcome), with no user data.
// • Callers cache aggressively: production traffic is served from a
//   shared snapshot refreshed a few times per day.
// Usage policy: https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances
// ───────────────────────────────────────────────────────────────

/**
 * overpass-api.de (FOSSGIS) is served by two backends, z. and lz4. Measured in
 * Oct 2026: the shared hostname returned 504 on about half of requests, each
 * after 6–9 s, while a backend usually answered the whole-city query in
 * 4–8 s. They are tried in turn (see runOverpass). Third-party instances (private.coffee, kumi)
 * did not respond within 30 s from the test network and are left to
 * OVERPASS_URLS.
 */
export const DEFAULT_OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
];

export interface OverpassConfig {
  endpoints: string[];
  userAgent: string;
  fetch: typeof fetch;
  /** Total attempts across all endpoints. */
  maxAttempts: number;
  /** Start the next attempt if the current one hasn't answered after this long. */
  hedgeAfterMs?: number;
  /** Abort a single attempt after this long. */
  attemptTimeoutMs?: number;
}

export interface AttemptLog {
  host: string;
  status: number | null;
  ms: number;
  outcome: 'ok' | 'http_error' | 'rejected' | 'timeout' | 'network' | 'bad_json' | 'bad_shape' | 'incomplete' | 'too_large';
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly attempts: AttemptLog[] = [],
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

const EMAIL = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,180}\.[A-Za-z]{2,24}$/;

/**
 * User-Agent sent to Overpass. Deliberately contains NO site hostname or URL.
 *
 * Verified against overpass-api.de (Oct 2026): a User-Agent containing the
 * deployed site's hostname — "THIRD-PLACE/1.0 (https://spontaneous-malabi-b849d6.netlify.app)",
 * which the previous version built from Netlify's URL variable — was answered with
 * HTTP 406 Not Acceptable in <1 s on every backend, as was the default "node"
 * agent and other "<name>.<domain>" forms. A fixed, descriptive agent with an
 * optional contact e-mail was accepted (HTTP 200). OVERPASS_CONTACT is therefore
 * only used when it is a plain e-mail address; anything else is ignored.
 */
export function buildUserAgent(contact: string | undefined): string {
  const email = (contact ?? '').trim();
  return EMAIL.test(email) ? `ThirdPlace/1.0 (Kolkata cafe discovery; contact: ${email})` : 'ThirdPlace/1.0 (Kolkata cafe discovery)';
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
  return {
    endpoints: endpoints.length ? endpoints : DEFAULT_OVERPASS_ENDPOINTS,
    userAgent: buildUserAgent(env.OVERPASS_CONTACT),
    fetch: fetchImpl,
    maxAttempts: 4,
    // Hedge only when an attempt hangs: normal answers take 3–8 s, and parallel queries
    // from one IP compete for the same small pool of Overpass slots.
    hedgeAfterMs: 8_000,
    attemptTimeoutMs: 20_000,
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

export interface OverpassResult {
  elements: unknown[];
  /** Timestamp of the OSM data the server answered from. */
  osmBase: string | null;
  /** Host that answered (diagnostics). */
  host: string;
  attempts: AttemptLog[];
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const REJECTED = new Set([401, 403, 406]);

function hostOf(u: string): string {
  try {
    return new URL(u).host;
  } catch {
    return 'invalid';
  }
}

/** Validates an Overpass body. Returns the data, or the kind of failure. */
export function parseOverpassBody(text: string): { ok: true; elements: unknown[]; osmBase: string | null } | { ok: false; outcome: AttemptLog['outcome'] } {
  if (text.length > 15_000_000) return { ok: false, outcome: 'too_large' };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, outcome: 'bad_json' };
  }
  const body = json as { elements?: unknown; remark?: unknown; osm3s?: { timestamp_osm_base?: unknown } } | null;
  if (!body || !Array.isArray(body.elements)) return { ok: false, outcome: 'bad_shape' };
  // A "remark" with an error means the server gave up part-way: a failure, never "no cafés".
  if (typeof body.remark === 'string' && /error|timeout|timed out|out of memory/i.test(body.remark)) return { ok: false, outcome: 'incomplete' };
  return { ok: true, elements: body.elements, osmBase: typeof body.osm3s?.timestamp_osm_base === 'string' ? body.osm3s.timestamp_osm_base : null };
}

export async function runOverpass(query: string, cfg: OverpassConfig, deadline: number, log: (a: AttemptLog) => void = () => undefined): Promise<OverpassResult> {
  if (!cfg.endpoints.length) throw new ProviderError('No Overpass endpoint configured', false);
  const hedgeAfter = cfg.hedgeAfterMs ?? 12_000;
  const attemptTimeout = cfg.attemptTimeoutMs ?? 30_000;
  const attempts: AttemptLog[] = [];
  const controllers = new Set<AbortController>();

  return new Promise<OverpassResult>((resolve, reject) => {
    let launched = 0;
    let running = 0;
    let settled = false;
    let lastError = new ProviderError('Overpass did not answer in time', true);
    let hedgeTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (result?: OverpassResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadlineTimer);
      if (hedgeTimer) clearTimeout(hedgeTimer);
      for (const c of controllers) c.abort();
      if (result) resolve(result);
      else reject(new ProviderError(lastError.message, lastError.retryable, attempts));
    };
    const deadlineTimer = setTimeout(() => finish(), Math.max(0, deadline - Date.now()));

    const record = (entry: AttemptLog) => {
      attempts.push(entry);
      log(entry);
    };

    const launch = (): void => {
      if (settled || launched >= cfg.maxAttempts || running >= 2) return;
      const remaining = deadline - Date.now();
      if (remaining < 1500) return;
      const endpoint = cfg.endpoints[launched % cfg.endpoints.length];
      launched++;
      running++;
      const host = hostOf(endpoint);
      const started = Date.now();
      const ctrl = new AbortController();
      controllers.add(ctrl);
      const timer = setTimeout(() => ctrl.abort(), Math.min(attemptTimeout, remaining));
      if (hedgeTimer) clearTimeout(hedgeTimer);
      hedgeTimer = setTimeout(launch, hedgeAfter);

      cfg
        .fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': cfg.userAgent, Accept: 'application/json' },
          body: new URLSearchParams({ data: query }).toString(),
          signal: ctrl.signal,
        })
        .then(async (res): Promise<'done' | 'retry' | 'fatal'> => {
          if (!res.ok) {
            // 401/403/406: the server refused this client (e.g. its User-Agent policy). Not load-related, so not retried.
            const rejected = REJECTED.has(res.status);
            record({ host, status: res.status, ms: Date.now() - started, outcome: rejected ? 'rejected' : 'http_error' });
            lastError = new ProviderError(rejected ? `Overpass rejected the request (HTTP ${res.status}); check the User-Agent policy` : `Overpass responded ${res.status}`, RETRYABLE.has(res.status));
            // A rejection may be specific to one operator's policy: try the next endpoint (bounded by maxAttempts).
            return lastError.retryable || rejected ? 'retry' : 'fatal';
          }
          const parsed = parseOverpassBody(await res.text());
          if (!parsed.ok) {
            record({ host, status: res.status, ms: Date.now() - started, outcome: parsed.outcome });
            lastError = new ProviderError(`Overpass returned an unusable response (${parsed.outcome})`, true);
            return 'retry';
          }
          record({ host, status: res.status, ms: Date.now() - started, outcome: 'ok' });
          finish({ elements: parsed.elements, osmBase: parsed.osmBase, host, attempts });
          return 'done';
        })
        .catch((e: Error): 'done' | 'retry' => {
          if (settled) return 'done'; // aborted because another attempt won, or the deadline passed
          const aborted = e.name === 'AbortError';
          record({ host, status: null, ms: Date.now() - started, outcome: aborted ? 'timeout' : 'network' });
          lastError = new ProviderError(aborted ? 'Overpass request timed out' : 'Could not reach Overpass', true);
          return 'retry';
        })
        .then((next) => {
          clearTimeout(timer);
          controllers.delete(ctrl);
          running--;
          if (settled) return;
          if (next === 'fatal') return finish();
          if (next === 'retry') launch();
          // Nothing running and nothing left to try: fail now rather than at the deadline.
          if (running === 0 && (launched >= cfg.maxAttempts || deadline - Date.now() < 1500)) finish();
        });
    };

    launch();
  });
}
