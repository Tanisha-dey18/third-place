import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFilters, cuisineFacets, EMPTY_FILTERS, sortCafes } from '../src/lib/filters';
import { runQuery, parseQueryParams, queryToSearchParams, sanitizeSearch } from '../src/lib/places/query';
import { createGeocodeHandler } from '../server/handlers/geocode';
import { createCache } from '../server/cache';
import aiHandler from '../netlify/functions/ai-search';
import { osmPlace, scriptedFetch, ok } from './helpers';

const a = osmPlace('Alpha', 22.554, 88.352, { internet_access: 'wlan', cuisine: 'coffee_shop;cake', opening_hours: 'Mo-Su 08:00-22:00' });
const b = osmPlace('Bravo', 22.553, 88.351, { internet_access: 'no', cuisine: 'coffee_shop' });
const c = osmPlace('Charlie', 22.5535, 88.3525);
const icecream = { ...osmPlace('Delta Scoops', 22.556, 88.353, { amenity: 'ice_cream' }), category: 'ice_cream' as const };

test('filters: facilities need evidence; unknown hidden and counted; combine with AND', () => {
  const out = applyFilters([a, b, c], { ...EMPTY_FILTERS, facilities: ['wifi'] });
  assert.deepEqual(out.list.map((x) => x.name), ['Alpha']);
  assert.equal(out.hiddenUnknown, 1, 'Charlie is unknown (hidden, counted); Bravo has none (excluded)');
  const both = applyFilters([a, b, c], { ...EMPTY_FILTERS, facilities: ['wifi'], cuisine: 'Cakes' });
  assert.deepEqual(both.list.map((x) => x.name), ['Alpha']);
});

test('filters: "open now" uses Kolkata time and never assumes unknown hours', () => {
  const tenAmIst = new Date('2026-10-14T04:30:00Z'); // 10:00 IST
  const out = applyFilters([a, b, c], { ...EMPTY_FILTERS, openNow: true }, tenAmIst);
  assert.deepEqual(out.list.map((x) => x.name), ['Alpha']);
  assert.equal(out.hiddenUnknown, 2);
  const lateNight = new Date('2026-10-14T19:30:00Z'); // 01:00 IST
  assert.equal(applyFilters([a], { ...EMPTY_FILTERS, openNow: true }, lateNight).list.length, 0);
});

test('filters: category, budget with unknown prices, facets from data only', () => {
  assert.deepEqual(applyFilters([a, icecream], { ...EMPTY_FILTERS, categories: ['ice_cream'] }).list.map((x) => x.name), ['Delta Scoops']);
  const budget = applyFilters([a, b], { ...EMPTY_FILTERS, budget: 'under150' });
  assert.equal(budget.list.length, 0);
  assert.equal(budget.hiddenUnknown, 2, 'unknown prices are hidden by a budget filter, never assumed cheap');
  assert.deepEqual(cuisineFacets([a, b, c]), ['Coffee', 'Cakes']);
});

test('sorting: distance needs an origin; rating uses only real reviews', () => {
  const origin = { lat: 22.553, lng: 88.351 };
  assert.equal(sortCafes([a, b, c], 'distance', { origin, ratings: new Map() })[0].name, 'Bravo');
  const rated = sortCafes([a, b, c], 'rating', { origin: null, ratings: new Map([[c.id, { cafeId: c.id, average: 4, count: 1 }]]) });
  assert.equal(rated[0].name, 'Charlie');
  assert.deepEqual(sortCafes([c, b, a], 'name', { origin: null, ratings: new Map() }).map((x) => x.name), ['Alpha', 'Bravo', 'Charlie']);
});

test('query layer: geographic bounds and privacy rounding', () => {
  const r = runQuery([a, b, c], { kind: 'bbox', bounds: { south: 22.5532, west: 88.3515, north: 22.555, east: 88.353 } }, 10);
  assert.deepEqual(r.places.map((x) => x.name).sort(), ['Alpha', 'Charlie']);
  const params = queryToSearchParams({ kind: 'near', lat: 22.551234, lng: 88.354321, radiusKm: 2 });
  assert.equal(params.get('near'), '22.55,88.35', 'device location rounded to ~1 km before leaving the browser');
  assert.ok(Number(params.get('r')) >= 2.8, 'radius padded to compensate for rounding');
  assert.equal(sanitizeSearch('café"];out;<script>'), 'café out script');
  assert.ok(parseQueryParams(new URLSearchParams('keys=osm:node:1')).ok);
});

test('geocode: validated, bounded to the city, cached, provider errors are structured', async () => {
  const nominatim = JSON.stringify([
    { name: 'Hindustan Park', display_name: 'Hindustan Park, Ballygunge, Kolkata', lat: '22.5177', lon: '88.3633', addresstype: 'road' },
    { name: 'Hindustan Park', display_name: 'Somewhere far away', lat: '28.6', lon: '77.2', addresstype: 'road' },
  ]);
  const sf = scriptedFetch([ok(nominatim)]);
  const cache = createCache(null);
  const handler = createGeocodeHandler({ cache: async () => cache, fetch: sf.fetch, env: () => ({}) });
  const get = (q: string) => handler(new Request(`https://x.test/api/geocode?q=${encodeURIComponent(q)}`, { headers: { 'x-nf-client-connection-ip': String(Math.random()) } }));
  assert.equal((await get('ab')).status, 400);
  const res = await get('Hindustan Park');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.results.map((r: { lat: number }) => r.lat), [22.5177], 'results outside the city are dropped');
  assert.match(sf.calls[0].url, /bounded=1/);
  assert.match(sf.calls[0].url, /nominatim\.openstreetmap\.org/);
  await get('Hindustan Park');
  assert.equal(sf.calls.length, 1, 'cached');

  const down = createGeocodeHandler({ cache: async () => createCache(null), fetch: scriptedFetch([() => new Response('x', { status: 500 })]).fetch, env: () => ({}) });
  await new Promise((r) => setTimeout(r, 1150));
  const err = await down(new Request('https://x.test/api/geocode?q=Gariahat'));
  assert.equal(err.status, 503);
  assert.equal((await err.json()).error.code, 'provider_unavailable');
});

test('AI function: unconfigured → 503; method/origin/size guards; no provider key needed for discovery', async () => {
  delete process.env.AI_PROVIDER;
  const res = await aiHandler(new Request('http://localhost/api/ai-search', { method: 'POST', body: JSON.stringify({ action: 'parse', query: 'quiet cafe' }) }));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error.code, 'not_configured');
  const evil = await aiHandler(new Request('http://localhost/api/ai-search', { method: 'POST', headers: { origin: 'https://evil.example' }, body: '{}' }));
  assert.equal(evil.status, 403);
  process.env.AI_PROVIDER = 'groq';
  process.env.GROQ_API_KEY = 'test-key-not-real';
  try {
    assert.equal((await aiHandler(new Request('http://localhost/api/ai-search', { method: 'GET' }))).status, 405);
    assert.equal((await aiHandler(new Request('http://localhost/api/ai-search', { method: 'POST', body: JSON.stringify({ action: 'parse', query: 'x'.repeat(400) }) }))).status, 400);
    assert.equal((await aiHandler(new Request('http://localhost/api/ai-search', { method: 'POST', body: 'y'.repeat(9000) }))).status, 413);
  } finally {
    delete process.env.AI_PROVIDER;
    delete process.env.GROQ_API_KEY;
  }
});
