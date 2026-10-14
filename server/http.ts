// Shared HTTP helpers for Netlify Functions: structured errors, CORS for
// the app's own origin, cache headers, and a per-instance safety-net rate
// limiter. The PRIMARY rate limit is Netlify's platform rate limiting
// (declared in each function's `config.rateLimit`), which is shared across
// all instances; the in-memory limiter below only protects a single hot
// instance and local development.

export interface ErrorBody {
  error: { code: string; message: string; retryable: boolean };
}

export function errorBody(code: string, message: string, retryable = false): ErrorBody {
  return { error: { code, message, retryable } };
}

const BASE_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

export function allowedOrigins(env: Record<string, string | undefined>): string[] {
  return [env.APP_ORIGIN, env.URL, env.DEPLOY_PRIME_URL, ...(env.AI_ALLOWED_ORIGINS ?? '').split(',')]
    .map((s) => (s ?? '').trim().replace(/\/$/, ''))
    .filter((s) => /^https?:\/\/[^/]+$/.test(s));
}

/**
 * CORS: same-origin requests don't need it. Cross-origin requests are
 * answered with CORS headers only for configured origins.
 * Returns false when a cross-origin request comes from an unknown origin.
 */
export function corsHeaders(req: Request, env: Record<string, string | undefined>): Record<string, string> | false {
  const origin = req.headers.get('origin');
  if (!origin) return {};
  const self = new URL(req.url).origin;
  if (origin === self) return {};
  if (allowedOrigins(env).includes(origin)) return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
  return false;
}

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...headers } });
}

export const NO_STORE = { 'Cache-Control': 'no-store' };

/** Public, shared-cacheable data (no user-specific content). */
export function publicCache(browserSeconds: number, cdnSeconds: number, staleSeconds: number): Record<string, string> {
  return {
    'Cache-Control': `public, max-age=${browserSeconds}`,
    'Netlify-CDN-Cache-Control': `public, durable, s-maxage=${cdnSeconds}, stale-while-revalidate=${staleSeconds}`,
  };
}

export function clientIp(req: Request): string {
  return req.headers.get('x-nf-client-connection-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

export function createMemoryRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  return {
    /** Returns seconds to wait, or 0 when the request is allowed. */
    check(id: string): number {
      const t = now();
      const recent = (hits.get(id) ?? []).filter((x) => t - x < windowMs);
      if (recent.length >= limit) {
        hits.set(id, recent);
        return Math.max(1, Math.ceil((windowMs - (t - recent[0])) / 1000));
      }
      recent.push(t);
      hits.set(id, recent);
      if (hits.size > 10_000) hits.clear();
      return 0;
    },
  };
}

export function serverEnv(): Record<string, string | undefined> {
  const g = globalThis as { Netlify?: { env?: { toObject?: () => Record<string, string> } } };
  try {
    const fromNetlify = g.Netlify?.env?.toObject?.();
    if (fromNetlify) return { ...process.env, ...fromNetlify };
  } catch {
    /* not on Netlify */
  }
  return process.env;
}
