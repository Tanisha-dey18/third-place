import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runOverpass, parseOverpassBody, ProviderError, DEFAULT_OVERPASS_ENDPOINTS, overpassConfigFromEnv, type AttemptLog } from '../server/overpass';
import { netlifyBlobStore, createCache } from '../server/cache';
import { createPlacesHandler } from '../server/handlers/places';
import { createHealthHandler } from '../server/handlers/health';
import { refreshSnapshot, resetSnapshotStateForTests, refreshStatusKey, type RefreshStatus } from '../server/snapshot';
import { el, overpassBody } from './helpers';

const fixture = readFileSync('tests/fixtures/overpass-kolkata-sample.json', 'utf8');
const json = (body: string, status = 200) => new Response(body, { status, headers: { 'content-type': 'application/json' } });

/** Fake fetch keyed by host: each host has a behaviour; records start/end and concurrency. */
function hostFetch(behaviour: Record<string, (signal: AbortSignal) => Promise<Response>>) {
  const calls: { host: string; at: number }[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const host = new URL(String(input)).host;
    calls.push({ host, at: Date.now() });
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      return await behaviour[host](init!.signal as AbortSignal);
    } finally {
      inFlight--;
    }
  }) as typeof fetch;
  return { fetch: fn, calls, maxInFlight: () => maxInFlight };
}
const hang = (signal: AbortSignal) =>
  new Promise<Response>((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
const after = (ms: number, r: () => Response) => (signal: AbortSignal) =>
  new Promise<Response>((resolve, reject) => {
    const t = setTimeout(() => resolve(r()), ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    });
  });
const cfg = (fetchImpl: typeof fetch, endpoints = ['https://a.test/api', 'https://b.test/api', 'https://c.test/api']) => ({
  endpoints,
  userAgent: 'test',
  fetch: fetchImpl,
  maxAttempts: 4,
  hedgeAfterMs: 200,
  attemptTimeoutMs: 5000,
});

beforeEach(() => resetSnapshotStateForTests());

// ── Root cause regression ───────────────────────────────────────

const g = globalThis as { Netlify?: unknown };
let savedNetlify: unknown;
beforeEach(() => (savedNetlify = g.Netlify));
afterEach(() => (g.Netlify = savedNetlify));

test('ROOT CAUSE: Blobs are detected when the context is only exposed via Netlify.env (v2 runtime)', async () => {
  delete process.env.NETLIFY_BLOBS_CONTEXT;
  assert.equal(await netlifyBlobStore('t'), null, 'no context anywhere → no shared store (local/dev)');
  const context = Buffer.from(JSON.stringify({ siteID: 'site-123', token: 'test-token', edgeURL: 'https://edge.test', uncachedEdgeURL: 'https://uncached.test' })).toString('base64');
  const envMap = new Map([['NETLIFY_BLOBS_CONTEXT', context]]);
  g.Netlify = { env: { get: (k: string) => envMap.get(k), has: (k: string) => envMap.has(k), set: (k: string, v: string) => envMap.set(k, v), delete: (k: string) => envMap.delete(k), toObject: () => Object.fromEntries(envMap) } };
  assert.equal(process.env.NETLIFY_BLOBS_CONTEXT, undefined, 'like production: NOT in process.env');
  const store = await netlifyBlobStore('t');
  assert.ok(store, 'the shared store must be created; the old guard returned null here');
  assert.equal(createCache(store).shared, true);
});

// ── Provider behaviour ──────────────────────────────────────────

test('hedging: a hung endpoint does not block — the next backend answers and the hung one is aborted', async () => {
  const f = hostFetch({ 'a.test': hang, 'b.test': after(50, () => json(fixture)), 'c.test': hang });
  const logs: AttemptLog[] = [];
  const started = Date.now();
  const res = await runOverpass('q', cfg(f.fetch), Date.now() + 5000, (a) => logs.push(a));
  assert.equal(res.host, 'b.test');
  assert.ok(Date.now() - started < 1500, 'answered soon after the hedge, not at the timeout');
  assert.ok(res.elements.length > 0);
  assert.ok(f.maxInFlight() <= 2, 'never more than 2 requests in flight');
  assert.deepEqual(logs.map((l) => l.outcome), ['ok']);
});

test('504 on one backend → immediately tries the next; succeeds', async () => {
  const f = hostFetch({ 'a.test': after(10, () => json('busy', 504)), 'b.test': after(10, () => json(fixture)), 'c.test': hang });
  const logs: AttemptLog[] = [];
  const res = await runOverpass('q', cfg(f.fetch), Date.now() + 5000, (a) => logs.push(a));
  assert.equal(res.host, 'b.test');
  assert.deepEqual(logs.map((l) => `${l.host}:${l.status}:${l.outcome}`), ['a.test:504:http_error', 'b.test:200:ok']);
});

test('all backends failing → ProviderError with every attempt recorded; attempts are bounded', async () => {
  const f = hostFetch({ 'a.test': after(5, () => json('x', 504)), 'b.test': after(5, () => json('x', 429)), 'c.test': after(5, () => json('<html>', 200)) });
  await assert.rejects(
    () => runOverpass('q', cfg(f.fetch), Date.now() + 5000),
    (e: ProviderError) => e instanceof ProviderError && e.retryable && e.attempts.length === 4 && f.calls.length === 4,
  );
});

test('a non-retryable 400 stops immediately (no pointless retries)', async () => {
  const f = hostFetch({ 'a.test': after(5, () => json('bad query', 400)), 'b.test': hang, 'c.test': hang });
  await assert.rejects(() => runOverpass('q', { ...cfg(f.fetch), hedgeAfterMs: 1000 }, Date.now() + 5000), (e: ProviderError) => !e.retryable);
  assert.equal(f.calls.length, 1);
});

test('deadline is respected even when every backend hangs', async () => {
  const f = hostFetch({ 'a.test': hang, 'b.test': hang, 'c.test': hang });
  const started = Date.now();
  await assert.rejects(() => runOverpass('q', cfg(f.fetch), Date.now() + 800), ProviderError);
  assert.ok(Date.now() - started < 1500);
});

test('malformed and incomplete bodies are classified, never treated as "no cafés"', () => {
  assert.deepEqual(parseOverpassBody('<?xml?><html>504</html>'), { ok: false, outcome: 'bad_json' });
  assert.deepEqual(parseOverpassBody('null'), { ok: false, outcome: 'bad_shape' });
  assert.deepEqual(parseOverpassBody('{"elements":{}}'), { ok: false, outcome: 'bad_shape' });
  assert.deepEqual(parseOverpassBody('{"elements":[],"remark":"runtime error: Query timed out in \\"query\\""}'), { ok: false, outcome: 'incomplete' });
  const empty = parseOverpassBody('{"elements":[],"osm3s":{"timestamp_osm_base":"2026-10-14T00:00:00Z"}}');
  assert.ok(empty.ok && empty.elements.length === 0, 'a genuinely empty answer is valid');
});

test('default endpoints are the overpass-api.de backends; env overrides with https only', () => {
  assert.deepEqual(DEFAULT_OVERPASS_ENDPOINTS.map((u) => new URL(u).host), ['overpass-api.de', 'z.overpass-api.de', 'lz4.overpass-api.de']);
  assert.deepEqual(overpassConfigFromEnv({ OVERPASS_URLS: 'http://insecure.test/api, https://ok.test/api, javascript:x' }).endpoints, ['https://ok.test/api']);
  assert.match(overpassConfigFromEnv({ OVERPASS_CONTACT: 'ops@example.com', URL: 'https://site.netlify.app' }).userAgent, /ops@example\.com/);
});

// ── End to end through the handler ──────────────────────────────

function handlerWith(f: typeof fetch, cache = createCache(null)) {
  const logs: Record<string, unknown>[] = [];
  const handler = createPlacesHandler({
    getDeps: async () => ({ cache, overpass: cfg(f), log: (e) => logs.push(e) }),
    env: () => ({}),
    budgetMs: 4000,
  });
  return { handler, logs, cache, get: (qs: string) => handler(new Request(`https://site.test/api/places?${qs}`, { headers: { 'x-nf-client-connection-ip': String(Math.random()) } })) };
}

test('valid response: Park Street returns validated real records with attribution', async () => {
  const f = hostFetch({ 'a.test': after(5, () => json('x', 504)), 'b.test': after(5, () => json(fixture)), 'c.test': hang });
  const { get, logs } = handlerWith(f.fetch);
  const res = await get('near=22.55,88.35&r=1.7&city=kolkata&limit=200');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.places.length > 0);
  for (const p of body.places) {
    assert.ok(p.name && typeof p.lat === 'number' && typeof p.lng === 'number');
    assert.equal(p.isDemo, false);
    assert.match(p.id, /^osm:/);
  }
  assert.ok(logs.some((l) => l.evt === 'snapshot_refresh' && l.ok === true), 'refresh outcome is logged');
  assert.ok(logs.some((l) => l.evt === 'overpass_attempt' && l.outcome === 'http_error'), 'failed attempts are logged');
});

test('empty result for an area is a 200 with an honest empty list', async () => {
  const f = hostFetch({ 'a.test': after(5, () => json(overpassBody([el(1, 'Far Café', 22.6, 88.45)]))), 'b.test': hang, 'c.test': hang });
  const res = await handlerWith(f.fetch).get('near=22.50,88.32&r=0.5');
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).places, []);
});

test('provider failure → 503 with an accurate message, the attempts in the status record, and no data substituted', async () => {
  const f = hostFetch({ 'a.test': after(5, () => json('x', 504)), 'b.test': after(5, () => json('x', 504)), 'c.test': after(5, () => json('x', 504)) });
  const { get, cache } = handlerWith(f.fetch);
  const res = await get('near=22.55,88.35&r=2');
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.error.code, 'provider_unavailable');
  assert.match(body.error.message, /couldn’t be loaded/);
  assert.match(body.error.message, /No other data is shown/);
  assert.equal(body.places, undefined);
  const status = await cache.get<RefreshStatus>(refreshStatusKey('kolkata'));
  assert.equal(status?.value.ok, false);
  assert.equal(status?.value.attempts.length, 4);
});

test('health endpoint reports shared-cache mode, snapshot state and last refresh — without secrets', async () => {
  const cache = createCache(null);
  const f = hostFetch({ 'a.test': after(5, () => json(fixture)), 'b.test': hang, 'c.test': hang });
  const deps = { cache, overpass: cfg(f.fetch), log: () => undefined };
  const health = createHealthHandler({ getDeps: async () => deps, env: () => ({ OVERPASS_CONTACT: 'ops@example.com', ANTHROPIC_API_KEY: 'test-fake-key-value-123' }) });
  const before = await health(new Request('https://site.test/api/health'));
  assert.equal(before.status, 503);
  assert.match((await before.json()).sharedCache, /memory-only/);
  await refreshSnapshot(deps, 'kolkata', Date.now() + 4000);
  const later = await health(new Request('https://site.test/api/health'));
  const text = await later.text();
  assert.equal(later.status, 200);
  const body = JSON.parse(text);
  assert.equal(body.cities[0].snapshot.present, true);
  assert.ok(body.cities[0].snapshot.places > 0);
  assert.equal(body.cities[0].lastRefresh.ok, true);
  assert.equal(body.overpassContactConfigured, true);
  assert.ok(!text.includes('test-fake-key-value-123') && !text.includes('ops@example.com'), 'no secrets or contact details in the output');
  assert.equal(later.headers.get("cache-control"), "no-store");
});

test('background refresh is triggered only after the request path fails, never in parallel with it', async () => {
  const events: string[] = [];
  const mk = (ok: boolean) => {
    resetSnapshotStateForTests();
    const fetchImpl = (async () => {
      events.push('overpass');
      return ok ? json(fixture) : json('x', 504);
    }) as typeof fetch;
    return createPlacesHandler({
      getDeps: async () => ({ cache: createCache(null), overpass: cfg(fetchImpl), log: () => undefined }),
      env: () => ({}),
      budgetMs: 3000,
      kickRefresh: async () => events.push('kick'),
    });
  };
  const okRes = await mk(true)(new Request('https://s.test/api/places?near=22.55,88.35&r=2'));
  assert.equal(okRes.status, 200);
  assert.deepEqual(events, ['overpass'], 'no background job when the live fetch works');
  events.length = 0;
  const failRes = await mk(false)(new Request('https://s.test/api/places?near=22.55,88.35&r=2'));
  assert.equal(failRes.status, 503);
  assert.equal(events.at(-1), 'kick', 'kicked only after every request attempt finished');
  assert.ok(events.slice(0, -1).every((e) => e === 'overpass'));
});

// ── Verified production root cause (Oct 2026): HTTP 406 from overpass-api.de ──

test('ROOT CAUSE: the User-Agent never contains the site URL/hostname (overpass-api.de answers 406 to those)', async () => {
  const { buildUserAgent } = await import('../server/overpass');
  const prodEnv = { URL: 'https://spontaneous-malabi-b849d6.netlify.app', DEPLOY_PRIME_URL: 'https://main--spontaneous-malabi-b849d6.netlify.app' };
  const ua = overpassConfigFromEnv(prodEnv).userAgent;
  assert.equal(ua, 'ThirdPlace/1.0 (Kolkata cafe discovery)');
  assert.ok(!/netlify|https?:|\.app\b/.test(ua));
  assert.equal(overpassConfigFromEnv({ ...prodEnv, OVERPASS_CONTACT: 'ops@example.com' }).userAgent, 'ThirdPlace/1.0 (Kolkata cafe discovery; contact: ops@example.com)');
  // A URL/hostname "contact" is ignored rather than reintroducing the 406.
  assert.equal(buildUserAgent('https://spontaneous-malabi-b849d6.netlify.app'), 'ThirdPlace/1.0 (Kolkata cafe discovery)');
  assert.equal(buildUserAgent('me@x.com\r\nX-Injected: 1'), 'ThirdPlace/1.0 (Kolkata cafe discovery)', 'no header injection');
  assert.match(ua, /^[\x20-\x7e]+$/, 'ASCII only (valid header value)');
});

test('the User-Agent actually reaches the provider on every attempt', async () => {
  const seen: string[] = [];
  const f = (async (_u: RequestInfo | URL, init?: RequestInit) => {
    seen.push(new Headers(init?.headers).get('user-agent') ?? '');
    return json(fixture);
  }) as typeof fetch;
  await runOverpass('q', { ...overpassConfigFromEnv({ URL: 'https://spontaneous-malabi-b849d6.netlify.app' }, f) }, Date.now() + 5000);
  assert.deepEqual(seen, ['ThirdPlace/1.0 (Kolkata cafe discovery)']);
});

test('HTTP 406 (as production saw) is logged as "rejected", other endpoints are tried, and it fails fast with a clear reason', async () => {
  const f = hostFetch({ 'a.test': after(5, () => new Response('<html>406 Not Acceptable</html>', { status: 406, headers: { 'content-type': 'text/html' } })), 'b.test': after(5, () => json(fixture)), 'c.test': hang });
  const logs: AttemptLog[] = [];
  const ok = await runOverpass('q', cfg(f.fetch), Date.now() + 5000, (a) => logs.push(a));
  assert.equal(ok.host, 'b.test', 'a rejection on one operator does not stop the others');
  assert.deepEqual(logs.map((l) => `${l.host}:${l.status}:${l.outcome}`), ['a.test:406:rejected', 'b.test:200:ok']);

  const all406 = hostFetch({ 'a.test': after(5, () => new Response('x', { status: 406 })), 'b.test': after(5, () => new Response('x', { status: 406 })), 'c.test': after(5, () => new Response('x', { status: 406 })) });
  const started = Date.now();
  await assert.rejects(
    () => runOverpass('q', cfg(all406.fetch), Date.now() + 5000),
    (e: ProviderError) => /rejected the request \(HTTP 406\)/.test(e.message) && e.attempts.every((a) => a.outcome === 'rejected') && e.attempts.length === 4,
  );
  assert.ok(Date.now() - started < 1500, 'bounded and fast');
});

test('env check warns when OVERPASS_CONTACT is not an e-mail', async () => {
  const { validateEnv } = await import('../src/lib/envCheck');
  assert.ok(validateEnv({ OVERPASS_CONTACT: 'https://spontaneous-malabi-b849d6.netlify.app' }).some((i) => i.variable === 'OVERPASS_CONTACT' && /406/.test(i.message)));
  assert.ok(!validateEnv({ OVERPASS_CONTACT: 'ops@example.com' }).some((i) => i.variable === 'OVERPASS_CONTACT'));
});
