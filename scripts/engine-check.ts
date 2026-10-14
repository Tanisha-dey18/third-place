// Lightweight checks for the parser, recommendation engine, filters,
// sanitizer and the AI function's no-credentials path. Run: npm test
import assert from 'node:assert/strict';
import { DEMO_CAFES } from '../src/data/demoCafes';
import { parseQuery } from '../src/lib/engine/parse';
import { recommend, relaxPreferences, scoreCafe } from '../src/lib/engine/score';
import { sanitizePreferences } from '../src/lib/engine/sanitize';
import { EMPTY_PREFERENCES, type Preferences } from '../src/lib/engine/types';
import { applyFilters } from '../src/lib/filters';
import { isOpenAt } from '../src/lib/geo';
import { studySummary } from '../src/lib/study';
import handler from '../netlify/functions/ai-search';

let passed = 0;
const test = async (name: string, fn: () => void | Promise<void>) => {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}\n    ${(e as Error).message}`);
    process.exitCode = 1;
  }
};
const ctx = { ratings: new Map() };
const P = (p: Partial<Preferences>): Preferences => ({ ...EMPTY_PREFERENCES, ...p });

console.log('Parser');
await test('study query extracts occasion, region, budget, facilities, duration', () => {
  const { prefs } = parseQuery('Find me a quiet café in South Kolkata where I can study for three hours, charge my laptop, and spend less than ₹400.');
  assert.equal(prefs.occasion, 'study');
  assert.deepEqual(prefs.location, { mode: 'region', region: 'south' });
  assert.equal(prefs.maxBudget, 400);
  assert.ok(prefs.atmosphere.includes('quiet'));
  assert.ok(prefs.requiredFacilities.includes('charging'));
  assert.ok(prefs.requiredFacilities.includes('long_stay'));
  assert.equal(prefs.durationHours, 3);
});
await test('date query near Park Street', () => {
  const { prefs } = parseQuery('Suggest a cosy date café near Park Street.');
  assert.equal(prefs.occasion, 'date');
  assert.deepEqual(prefs.location, { mode: 'neighbourhood', slug: 'park-street' });
  assert.ok(prefs.atmosphere.includes('cosy'));
  assert.equal(prefs.requiredFacilities.includes('parking'), false, '"Park Street" must not imply parking');
});
await test('affordable desserts in Salt Lake', () => {
  const { prefs } = parseQuery('Find affordable cafés with good desserts in Salt Lake.');
  assert.equal(prefs.occasion, 'dessert');
  assert.equal(prefs.maxBudget, 300);
  assert.deepEqual(prefs.location, { mode: 'neighbourhood', slug: 'salt-lake' });
});
await test('laptop-friendly never implies Wi-Fi or charging', () => {
  const a = parseQuery('laptop-friendly places').prefs;
  assert.deepEqual(a.requiredFacilities, []);
  assert.ok(a.atmosphere.includes('work_friendly'));
  const b = parseQuery('Show me laptop-friendly places with Wi-Fi and comfortable seating.').prefs;
  assert.ok(b.requiredFacilities.includes('wifi'));
  assert.ok(b.requiredFacilities.includes('comfortable_seating'));
  assert.equal(b.requiredFacilities.includes('charging'), false);
});

console.log('Engine');
await test('required facility confirmed false → ineligible; unknown → eligible with penalty', () => {
  const brass = DEMO_CAFES.find((c) => c.slug === 'brass-and-bean')!; // charging: false
  const fern = DEMO_CAFES.find((c) => c.slug === 'fern-courtyard')!; // charging: unknown
  const prefs = P({ requiredFacilities: ['charging'] });
  const a = scoreCafe(brass, prefs, ctx);
  const b = scoreCafe(fern, prefs, ctx);
  assert.equal(a.eligible, false);
  assert.equal(b.eligible, true);
  assert.ok(b.penalties > 0);
  assert.ok(b.unknowns.some((u) => u.includes('Charging')));
  assert.ok(!b.reasons.some((r) => r.toLowerCase().includes('charging')), 'never claims an unknown facility');
});
await test('budget ceiling excludes places starting above it', () => {
  const r = recommend(DEMO_CAFES, P({ maxBudget: 200 }), ctx);
  assert.ok(r.matches.every((m) => (m.cafe.priceMin ?? 0) <= 200));
});
await test('neighbourhood + distance constraints', () => {
  const r = recommend(DEMO_CAFES, P({ location: { mode: 'neighbourhood', slug: 'new-town' }, maxDistanceKm: 3 }), ctx);
  assert.ok(r.matches.length >= 1);
  assert.ok(r.matches.every((m) => m.cafe.neighbourhood === 'new-town' && (m.distanceKm ?? 0) <= 3));
});
await test('study ranking puts verified study spots first', () => {
  const r = recommend(DEMO_CAFES, P({ occasion: 'study', requiredFacilities: ['charging', 'wifi'] }), ctx);
  assert.equal(r.matches[0].cafe.slug, 'saltwater-study-room');
  assert.ok(r.matches.every((m) => !m.failures.length));
});
await test('impossible request yields relaxation suggestions', () => {
  const prefs = P({ maxBudget: 100, requiredFacilities: ['wifi', 'charging', 'parking'], location: { mode: 'neighbourhood', slug: 'alipore' } });
  const r = recommend(DEMO_CAFES, prefs, ctx);
  assert.equal(r.matches.length, 0);
  assert.ok(r.relaxations.length > 0 || r.nearMisses.length > 0);
  const relaxed = relaxPreferences(prefs, 'location');
  assert.deepEqual(relaxed.location, { mode: 'anywhere' });
});
await test('min rating requires real reviews', () => {
  const r = recommend(DEMO_CAFES, P({ minRating: 4 }), ctx);
  assert.equal(r.matches.length, 0, 'no reviews → nothing can satisfy a rating requirement');
  const withReview = recommend(DEMO_CAFES, P({ minRating: 4 }), { ratings: new Map([[DEMO_CAFES[0].id, { cafeId: DEMO_CAFES[0].id, average: 4.5, count: 2 }]]) });
  assert.equal(withReview.matches.length, 1);
});
await test('scores are within 0–100 and deterministic', () => {
  const p = parseQuery('cosy romantic dinner with desserts under 900').prefs;
  const a = recommend(DEMO_CAFES, p, ctx).matches.map((m) => [m.cafe.id, m.score]);
  const b = recommend(DEMO_CAFES, p, ctx).matches.map((m) => [m.cafe.id, m.score]);
  assert.deepEqual(a, b);
  assert.ok(a.every(([, s]) => (s as number) >= 0 && (s as number) <= 100));
});

console.log('Filters, hours, study, sanitizer');
await test('explore filters: facilities must be confirmed; unknown counted as hidden', () => {
  const out = applyFilters(DEMO_CAFES, { q: '', area: null, budget: null, maxPrice: null, occasion: null, atmosphere: [], facilities: ['charging'], tag: null });
  assert.ok(out.list.every((c) => { const f = c.facilities.find((x) => x.key === 'charging'); return f?.available === true && ['cafe_verified', 'visitor_confirmed'].includes(f.status); }));
  assert.ok(out.hiddenUnknown > 0);
});
await test('filters combine (area AND budget AND occasion)', () => {
  const out = applyFilters(DEMO_CAFES, { q: '', area: 'salt-lake', budget: '150to300', maxPrice: null, occasion: 'study', atmosphere: [], facilities: [], tag: null });
  assert.deepEqual(out.list.map((c) => c.slug).sort(), ['quiet-hours', 'second-shift-coffee']);
});
await test('opening hours incl. past midnight', () => {
  const sched = [{ day: 5, open: '16:00', close: '00:30' }];
  assert.equal(isOpenAt(sched, 5, '23:59'), true);
  assert.equal(isOpenAt(sched, 6, '00:15'), true);
  assert.equal(isOpenAt(sched, 6, '01:00'), false);
  assert.equal(isOpenAt(null, 1, '10:00'), null);
});
await test('study summary is honest about unknowns', () => {
  assert.equal(studySummary(DEMO_CAFES.find((c) => c.slug === 'saltwater-study-room')!).verdict, 'strong');
  assert.equal(studySummary(DEMO_CAFES.find((c) => c.slug === 'brass-and-bean')!).verdict, 'not_ideal');
  assert.equal(studySummary(DEMO_CAFES.find((c) => c.slug === 'inkwell-coffee-lab')!).verdict, 'unclear');
});
await test('sanitizer drops invented values', () => {
  const s = sanitizePreferences({ occasion: 'rave', requiredFacilities: ['wifi', 'jacuzzi'], location: { mode: 'neighbourhood', slug: 'atlantis' }, maxBudget: -5 });
  assert.equal(s.occasion, null);
  assert.deepEqual(s.requiredFacilities, ['wifi']);
  assert.deepEqual(s.location, { mode: 'anywhere' });
  assert.equal(s.maxBudget, null);
});
await test('demo data integrity: unique ids/slugs, bestsellers have sources, all flagged demo', () => {
  assert.equal(new Set(DEMO_CAFES.map((c) => c.id)).size, DEMO_CAFES.length);
  assert.equal(new Set(DEMO_CAFES.map((c) => c.slug)).size, DEMO_CAFES.length);
  const items = DEMO_CAFES.flatMap((c) => c.menu);
  assert.equal(new Set(items.map((i) => i.id)).size, items.length);
  assert.ok(items.every((i) => !i.isBestseller || i.bestsellerSource));
  assert.ok(DEMO_CAFES.every((c) => c.isDemo));
  assert.ok(DEMO_CAFES.every((c) => c.priceMin == null || c.priceMax == null || c.priceMax >= c.priceMin));
});

console.log('AI function (no credentials)');
await test('returns 503 when no provider is configured', async () => {
  delete process.env.AI_PROVIDER;
  const res = await handler(new Request('http://localhost/.netlify/functions/ai-search', { method: 'POST', body: JSON.stringify({ action: 'parse', query: 'quiet cafe' }) }));
  assert.equal(res.status, 503);
});
await test('rejects other origins and non-POST', async () => {
  const bad = await handler(new Request('http://localhost/x', { method: 'POST', headers: { origin: 'https://evil.example' }, body: '{}' }));
  assert.equal(bad.status, 403);
  process.env.AI_PROVIDER = 'groq';
  process.env.GROQ_API_KEY = 'test-key-not-real';
  const get = await handler(new Request('http://localhost/x', { method: 'GET' }));
  assert.equal(get.status, 405);
  const invalid = await handler(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify({ action: 'parse', query: 'x'.repeat(400) }) }));
  assert.equal(invalid.status, 400);
  delete process.env.AI_PROVIDER;
  delete process.env.GROQ_API_KEY;
});

console.log(`\n${passed} checks passed${process.exitCode ? ', some FAILED' : ''}.`);
