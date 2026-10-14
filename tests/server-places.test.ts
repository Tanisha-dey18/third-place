import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlacesHandler } from '../server/handlers/places';
import { createCache, type Cache } from '../server/cache';
import { refreshSnapshot, resetSnapshotStateForTests, snapshotKey, type Snapshot } from '../server/snapshot';
import { areaQuery, idsQuery } from '../server/overpass';
import { el, ok, overpassBody, scriptedFetch, status } from './helpers';

const fixture = readFileSync('tests/fixtures/overpass-kolkata-sample.json', 'utf8');
const ENV = { URL: 'https://thirdplace.example' };

function setup(responses: Parameters<typeof scriptedFetch>[0], opts: { cache?: Cache; limit?: number; now?: () => number } = {}) {
  const sf = scriptedFetch(responses);
  const cache = opts.cache ?? createCache(null);
  const handler = createPlacesHandler({
    getDeps: async () => ({ cache, overpass: { endpoints: ['https://overpass-a.test/api', 'https://overpass-b.test/api'], userAgent: 'test', fetch: sf.fetch, maxAttempts: 3 }, now: opts.now }),
    env: () => ENV,
    budgetMs: 6000,
    rateLimit: opts.limit ? { limit: opts.limit, windowMs: 60_000 } : undefined,
  });
  const get = (qs: string, headers: Record<string, string> = {}) => handler(new Request(`https://thirdplace.example/api/places?${qs}`, { headers: { 'x-nf-client-connection-ip': `10.0.0.${Math.random()}`, ...headers } }));
  return { handler, get, calls: sf.calls, cache };
}

beforeEach(() => resetSnapshotStateForTests());

test('area query: fetched once, normalised, filtered by radius, sorted by distance, CDN-cacheable', async () => {
  const { get, calls } = setup([ok(fixture)]);
  const res = await get('near=22.55,88.35&r=3');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.meta.provider, 'openstreetmap');
  assert.match(body.meta.attribution, /OpenStreetMap contributors/);
  assert.ok(body.places.length > 0);
  assert.ok(body.places.every((p: { name: string }) => p.name), 'no unnamed places');
  assert.ok(body.places.every((p: { isDemo: boolean }) => p.isDemo === false), 'never demo data');
  assert.match(res.headers.get('cache-control') ?? '', /public/);
  assert.match(res.headers.get('netlify-cdn-cache-control') ?? '', /s-maxage/);
  // second request is served from the snapshot cache — no new provider call
  const again = await get('near=22.55,88.35&r=1');
  assert.equal(again.status, 200);
  assert.equal(calls.length, 1, 'one Overpass request serves many visitor requests');
  assert.ok(calls[0].body.includes('amenity'), 'queries café-like amenities');
});

test('provider down: structured 503 with Retry-After, no fake data, and fast-fail backoff', async () => {
  const { get, calls } = setup([status(504)]);
  const res = await get('near=22.55,88.35&r=2');
  assert.equal(res.status, 503);
  assert.equal(res.headers.get('retry-after'), '60');
  assert.equal(res.headers.get('cache-control'), 'no-store', 'errors are never cached');
  const body = await res.json();
  assert.equal(body.error.code, 'provider_unavailable');
  assert.equal(body.error.retryable, true);
  assert.equal(body.places, undefined, 'no substituted places');
  const attempts = calls.length;
  assert.ok(attempts >= 2 && attempts <= 3, `bounded retries across endpoints (got ${attempts})`);
  assert.equal(new Set(calls.map((c) => c.url)).size, 2, 'falls back to the second endpoint');
  const again = await get('near=22.55,88.35&r=2');
  assert.equal(again.status, 503);
  assert.equal(calls.length, attempts, 'backs off instead of hammering the provider');
});

test('transient failure then success: retried within the budget', async () => {
  const { get, calls } = setup([status(429), ok(fixture)]);
  const res = await get('near=22.55,88.35&r=3');
  assert.equal(res.status, 200);
  assert.equal(calls.length, 2);
});

test('malformed or incomplete provider responses are failures, not "no cafés"', async () => {
  for (const bad of ['<html>busy</html>', JSON.stringify({ elements: 'x' }), JSON.stringify({ elements: [], remark: 'runtime error: Query timed out' })]) {
    resetSnapshotStateForTests();
    const { get } = setup([ok(bad)]);
    const res = await get('near=22.55,88.35&r=2');
    assert.equal(res.status, 503, bad.slice(0, 30));
  }
});

test('empty area is a 200 with no places (honest empty state)', async () => {
  const { get } = setup([ok(overpassBody([el(1, 'Only Café', 22.6, 88.45)]))]);
  const res = await get('near=22.50,88.32&r=0.5');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.places, []);
  assert.equal(body.meta.total, 0);
});

test('bbox query, limits and truncation metadata', async () => {
  const many = Array.from({ length: 30 }, (_, i) => el(100 + i, `Café ${i}`, 22.55 + i * 0.0005, 88.35));
  const { get } = setup([ok(overpassBody(many))]);
  const res = await get('bbox=22.54,88.34,22.58,88.36&limit=10');
  const body = await res.json();
  assert.equal(body.places.length, 10);
  assert.equal(body.meta.total, 30);
  assert.equal(body.meta.truncated, true);
});

test('duplicate elements across the city are returned once', async () => {
  const { get } = setup([ok(overpassBody([el(1, 'Twin Café', 22.55, 88.35), el(1, 'Twin Café', 22.55, 88.35), { type: 'way', id: 2, center: { lat: 22.5501, lon: 88.3501 }, tags: { amenity: 'cafe', name: 'Twin Cafe' } }]))]);
  const body = await (await get('near=22.55,88.35&r=1')).json();
  assert.equal(body.places.length, 1);
});

test('input validation: 400s with structured errors; nothing reaches the provider', async () => {
  const { get, handler, calls } = setup([ok(fixture)]);
  const cases: [string, string][] = [
    ['', 'invalid_request'],
    ['near=abc&r=2', 'invalid_request'],
    ['near=22.55,88.35', 'invalid_request'],
    ['near=22.55,88.35&r=500', 'invalid_request'],
    ['near=28.61,77.20&r=2', 'outside_coverage'],
    ['bbox=22.0,88.0,23.0,89.0', 'area_too_large'],
    ['bbox=22.6,88.3,22.5,88.4', 'invalid_request'],
    ['keys=osm:node:1,../../etc', 'invalid_request'],
    ['q=a', 'invalid_request'],
    ['near=22.55,88.35&r=2&q=x', 'invalid_request'],
    ['city=delhi&near=22.55,88.35&r=2', 'invalid_request'],
  ];
  for (const [qs, code] of cases) {
    const res = await get(qs);
    assert.equal(res.status, 400, qs);
    assert.equal((await res.json()).error.code, code, qs);
  }
  assert.equal(calls.length, 0);
  const post = await handler(new Request('https://thirdplace.example/api/places?near=22.55,88.35&r=2', { method: 'POST', body: '{}' }));
  assert.equal(post.status, 405);
  const long = await get(`q=${'a'.repeat(3000)}`);
  assert.equal(long.status, 414);
});

test('cross-origin requests from unknown origins are refused; the app origin is allowed', async () => {
  const { get } = setup([ok(fixture)]);
  const evil = await get('near=22.55,88.35&r=2', { origin: 'https://evil.example' });
  assert.equal(evil.status, 403);
  const own = await get('near=22.55,88.35&r=2', { origin: 'https://thirdplace.example' });
  assert.equal(own.status, 200);
});

test('name search uses the snapshot only and neutralises injection attempts', async () => {
  const { get, calls } = setup([ok(overpassBody([el(1, 'Cafe Coffee Day', 22.55, 88.35), el(2, 'Tea Junction', 22.56, 88.36)]))]);
  const res = await get(`q=${encodeURIComponent('"Coffee Day"')}`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.places.map((p: { name: string }) => p.name), ['Cafe Coffee Day']);
  const hostile = await get(`q=${encodeURIComponent('x"];out;node(1);')}`);
  assert.equal(hostile.status, 200);
  assert.deepEqual((await hostile.json()).places, []);
  assert.equal(calls.length, 1, 'only the snapshot fetch; search never builds Overpass queries from user text');
  assert.ok(!calls[0].body.includes('out;node(1)'));
});

test('keys lookup: snapshot hits, element lookups for misses, and gone places reported as missing', async () => {
  const snap = overpassBody([el(1, 'Snapshot Café', 22.55, 88.35)]);
  const lookup = overpassBody([el(77, 'Just Outside', 22.43, 88.30)]);
  const { get, calls } = setup([ok(snap), ok(lookup)]);
  const res = await get('keys=osm:node:1,osm:node:77,osm:node:999');
  const body = await res.json();
  assert.deepEqual(body.places.map((p: { name: string }) => p.name).sort(), ['Just Outside', 'Snapshot Café']);
  assert.deepEqual(body.meta.missingKeys, ['osm:node:999']);
  assert.equal(calls.length, 2);
  assert.match(calls[1].body, /node%28id%3A77%2C999%29|node\(id:77,999\)/);
});

test('per-instance safety-net rate limit returns 429 with Retry-After', async () => {
  const sf = scriptedFetch([ok(fixture)]);
  const cache = createCache(null);
  const handler = createPlacesHandler({
    getDeps: async () => ({ cache, overpass: { endpoints: ['https://o.test'], userAgent: 't', fetch: sf.fetch, maxAttempts: 1 } }),
    env: () => ENV,
    rateLimit: { limit: 2, windowMs: 60_000 },
  });
  const req = () => handler(new Request('https://thirdplace.example/api/places?near=22.55,88.35&r=2', { headers: { 'x-nf-client-connection-ip': '1.2.3.4' } }));
  assert.equal((await req()).status, 200);
  assert.equal((await req()).status, 200);
  const third = await req();
  assert.equal(third.status, 429);
  assert.ok(Number(third.headers.get('retry-after')) > 0);
});

test('stale snapshots are served but flagged; refresh never replaces good data with a partial response', async () => {
  const cache = createCache(null);
  const { get } = setup([ok(fixture)], { cache });
  // Seed a real (but old) snapshot via a refresh with a fake clock.
  const sf = scriptedFetch([ok(fixture), ok(overpassBody([el(5, 'Lonely', 22.55, 88.35)]))]);
  const deps = { cache, overpass: { endpoints: ['https://o.test'], userAgent: 't', fetch: sf.fetch, maxAttempts: 1 }, now: () => Date.parse('2026-01-01T00:00:00Z') };
  const first = await refreshSnapshot(deps, 'kolkata', Date.now() + 5000);
  assert.equal(first.updated, true);
  const second = await refreshSnapshot(deps, 'kolkata', Date.now() + 5000);
  assert.equal(second.updated, false, 'a much smaller response is treated as partial');
  assert.ok((await cache.get<Snapshot>(snapshotKey('kolkata')))!.value.places.length > 1);
  const res = await get('near=22.55,88.35&r=3');
  assert.equal((await res.json()).meta.stale, true);
});

test('Overpass queries are bounded and built only from server data', () => {
  const q = areaQuery({ south: 22.42, west: 88.24, north: 22.7, east: 88.52 }, 999);
  assert.match(q, /\[timeout:60\]/);
  assert.match(q, /"amenity"="cafe"/);
  assert.equal(idsQuery(['tp:123e4567-e89b-42d3-a456-426614174000'], 10), null);
  assert.match(idsQuery(['osm:node:1', 'osm:way:2'], 10)!, /node\(id:1\);way\(id:2\);/);
});

test('background refresh: skips when fresh, respects the shared lock, refreshes when stale', async () => {
  const { backgroundRefresh } = await import('../server/snapshot');
  const cache = createCache(null);
  const sf = scriptedFetch([ok(fixture)]);
  const deps = { cache, overpass: { endpoints: ['https://o.test'], userAgent: 't', fetch: sf.fetch, maxAttempts: 1 } };
  const first = await backgroundRefresh(deps, 'kolkata', { maxMs: 30_000 });
  assert.equal(first.updated, true);
  const second = await backgroundRefresh(deps, 'kolkata', { maxMs: 30_000 });
  assert.equal(second.updated, false);
  assert.match(second.reason, /fresh/);
  assert.equal(sf.calls.length, 1, 'repeated triggers cannot amplify traffic to OpenStreetMap');
  await cache.set('refresh-lock/kolkata', Date.now());
  const locked = await backgroundRefresh(deps, 'kolkata', { maxMs: 30_000, minAgeMs: 0 });
  assert.match(locked.reason, /in progress/);
});
