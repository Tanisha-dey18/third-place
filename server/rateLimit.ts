import { createHash } from 'node:crypto';
import type { BlobLike } from './cache';
import { netlifyBlobStore } from './cache';
import { createMemoryRateLimiter } from './http';

// ───────────────────────────────────────────────────────────────
// Shared rate limiting backed by Netlify Blobs.
//
// Why: Netlify's code-based `config.rateLimit` rules were verified NOT to be
// enforced on this site (36 rapid requests to a 30/min route all returned
// 200), and an in-memory counter only sees one function instance. This
// limiter shares counters across every instance.
//
// Design: fixed one-minute windows; key = route + window + SHA-256 of the
// client IP (raw IPs are never stored). Read-modify-write on Blobs is not
// atomic, so under heavy concurrency a few extra requests may slip through:
// it is an approximate, abuse-limiting control, not an exact quota.
// Old windows are removed by `sweepRateLimits` (called by the scheduled job).
// Falls back to the per-instance limiter when Blobs are unavailable.
// ───────────────────────────────────────────────────────────────

export interface RateRule {
  /** Short route name used in keys and logs, e.g. "ai". */
  route: string;
  /** Requests allowed per client per window. */
  perClient: number;
  windowMs: number;
  /** Optional cap across ALL clients per UTC day (e.g. to bound paid AI usage). */
  globalPerDay?: number;
}

export interface RateDecision {
  allowed: boolean;
  /** Seconds until the client may retry (0 when allowed). */
  retryAfter: number;
  reason?: 'client' | 'global';
  shared: boolean;
}

interface Counter {
  n: number;
}

export interface SharedRateLimiter {
  check(clientId: string): Promise<RateDecision>;
}

const hashClient = (id: string) => createHash('sha256').update(`third-place:${id}`).digest('hex').slice(0, 24);

export function createSharedRateLimiter(rule: RateRule, store: () => Promise<BlobLike | null>, now: () => number = Date.now): SharedRateLimiter {
  const fallback = createMemoryRateLimiter(rule.perClient, rule.windowMs, now);
  return {
    async check(clientId: string): Promise<RateDecision> {
      const t = now();
      const blobs = await store().catch(() => null);
      if (!blobs) {
        const wait = fallback.check(clientId);
        return { allowed: wait === 0, retryAfter: wait, reason: wait ? 'client' : undefined, shared: false };
      }
      const windowStart = Math.floor(t / rule.windowMs) * rule.windowMs;
      const retryAfter = Math.max(1, Math.ceil((windowStart + rule.windowMs - t) / 1000));
      try {
        if (rule.globalPerDay) {
          const day = new Date(t).toISOString().slice(0, 10);
          const gKey = `rl/${rule.route}/day/${day}`;
          const g = ((await blobs.get(gKey, { type: 'json' })) as Counter | null)?.n ?? 0;
          if (g >= rule.globalPerDay) {
            const tomorrow = Date.parse(`${day}T00:00:00Z`) + 86_400_000;
            return { allowed: false, retryAfter: Math.max(1, Math.ceil((tomorrow - t) / 1000)), reason: 'global', shared: true };
          }
          await blobs.setJSON(gKey, { n: g + 1 });
        }
        const key = `rl/${rule.route}/w/${windowStart}/${hashClient(clientId)}`;
        const n = ((await blobs.get(key, { type: 'json' })) as Counter | null)?.n ?? 0;
        if (n >= rule.perClient) return { allowed: false, retryAfter, reason: 'client', shared: true };
        await blobs.setJSON(key, { n: n + 1 });
        return { allowed: true, retryAfter: 0, shared: true };
      } catch {
        // Storage hiccup: degrade to the per-instance limiter rather than failing open entirely.
        const wait = fallback.check(clientId);
        return { allowed: wait === 0, retryAfter: wait, reason: wait ? 'client' : undefined, shared: false };
      }
    },
  };
}

let storePromise: Promise<BlobLike | null> | null = null;
/** Separate store so rate-limit keys never mix with cached data. */
export function rateLimitStore(): Promise<BlobLike | null> {
  storePromise ??= netlifyBlobStore('third-place-ratelimit');
  return storePromise;
}

/** Delete counters from windows older than `keepMs` (and day counters older than 2 days). */
export async function sweepRateLimits(store: BlobLike & { list?: (o: { prefix: string }) => Promise<{ blobs: { key: string }[] }>; delete?: (k: string) => Promise<void> }, now = Date.now(), keepMs = 10 * 60 * 1000): Promise<number> {
  if (!store.list || !store.delete) return 0;
  const { blobs } = await store.list({ prefix: 'rl/' });
  let removed = 0;
  for (const { key } of blobs) {
    const w = key.match(/^rl\/[^/]+\/w\/(\d+)\//);
    const d = key.match(/^rl\/[^/]+\/day\/(\d{4}-\d{2}-\d{2})$/);
    const old = w ? now - Number(w[1]) > keepMs : d ? now - Date.parse(`${d[1]}T00:00:00Z`) > 2 * 86_400_000 : false;
    if (old) {
      await store.delete(key);
      removed++;
    }
  }
  return removed;
}
