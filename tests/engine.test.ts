import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery } from '../src/lib/engine/parse';
import { recommend, relaxPreferences, scoreCafe } from '../src/lib/engine/score';
import { sanitizePreferences } from '../src/lib/engine/sanitize';
import { EMPTY_PREFERENCES, type Preferences } from '../src/lib/engine/types';
import { studySummary } from '../src/lib/study';
import { osmPlace } from './helpers';

const ctx = { ratings: new Map() };
const P = (p: Partial<Preferences>): Preferences => ({ ...EMPTY_PREFERENCES, ...p });

// Near Park Street (22.5535, 88.352)
const wifiYes = osmPlace('Wifi Yes', 22.554, 88.352, { internet_access: 'wlan', opening_hours: 'Mo-Su 08:00-22:00', cuisine: 'coffee_shop' });
const wifiNo = osmPlace('Wifi No', 22.553, 88.351, { internet_access: 'no' });
const wifiUnknown = osmPlace('Wifi Unknown', 22.5535, 88.3525);
const farAway = osmPlace('Far Away', 22.585, 88.475, { internet_access: 'wlan' }); // New Town
const all = [wifiYes, wifiNo, wifiUnknown, farAway];

test('parser: study query → occasion, region, budget, must-have charging, preferred long stay', () => {
  const { prefs } = parseQuery('Find me a quiet café in South Kolkata where I can study for three hours, charge my laptop, and spend less than ₹400.');
  assert.equal(prefs.occasion, 'study');
  assert.deepEqual(prefs.location, { mode: 'region', region: 'south' });
  assert.equal(prefs.maxBudget, 400);
  assert.ok(prefs.atmosphere.includes('quiet'));
  assert.ok(prefs.requiredFacilities.includes('charging'), 'stated need is strict');
  assert.ok(prefs.preferredFacilities.includes('long_stay'));
});

test('parser: neighbourhoods incl. Hindustan Park / New Market; "Park Street" never implies parking', () => {
  assert.deepEqual(parseQuery('cosy date café near Park Street').prefs.location, { mode: 'neighbourhood', slug: 'park-street' });
  assert.equal(parseQuery('cosy date café near Park Street').prefs.requiredFacilities.includes('parking'), false);
  assert.deepEqual(parseQuery('coffee in Hindustan Park').prefs.location, { mode: 'neighbourhood', slug: 'hindustan-park' });
  assert.deepEqual(parseQuery('cake near New Market').prefs.location, { mode: 'neighbourhood', slug: 'new-market' });
  assert.deepEqual(parseQuery('work café in Sector V').prefs.location, { mode: 'neighbourhood', slug: 'sector-v' });
});

test('parser: laptop-friendly never implies Wi-Fi or charging; plain mentions are nice-to-haves', () => {
  const a = parseQuery('laptop-friendly places').prefs;
  assert.deepEqual([...a.requiredFacilities, ...a.preferredFacilities], []);
  const b = parseQuery('Show me laptop-friendly places with Wi-Fi and comfortable seating.').prefs;
  assert.deepEqual(b.requiredFacilities, []);
  assert.ok(b.preferredFacilities.includes('wifi'));
  const c = parseQuery('I need wifi').prefs;
  assert.deepEqual(c.requiredFacilities, ['wifi']);
});

test('strict requirement: only places with evidence pass; unknown is excluded with an explanation', () => {
  const r = recommend(all, P({ requiredFacilities: ['wifi'] }), ctx);
  const ids = r.matches.map((m) => m.cafe.name);
  assert.deepEqual(ids.sort(), ['Far Away', 'Wifi Yes']);
  const unknown = scoreCafe(wifiUnknown, P({ requiredFacilities: ['wifi'] }), ctx);
  assert.equal(unknown.eligible, false);
  assert.match(unknown.failures[0].message, /no information/i);
  const no = scoreCafe(wifiNo, P({ requiredFacilities: ['wifi'] }), ctx);
  assert.equal(no.eligible, false);
});

test('soft preference: unknown stays eligible with an uncertainty penalty; evidence ranks first', () => {
  const r = recommend([wifiUnknown, wifiYes, wifiNo], P({ preferredFacilities: ['wifi'] }), ctx);
  assert.equal(r.matches.length, 3, 'soft preferences never hide places');
  assert.equal(r.matches[0].cafe.name, 'Wifi Yes');
  const unknown = r.matches.find((m) => m.cafe.name === 'Wifi Unknown')!;
  assert.ok(unknown.penalties > 0);
  assert.ok(unknown.unknowns.some((u) => /not verified/i.test(u)));
  assert.ok(!unknown.reasons.some((x) => /wi-fi/i.test(x)), 'never claims an unknown facility');
});

test('neighbourhood = real distance from a verified centre; far places excluded', () => {
  const r = recommend(all, P({ location: { mode: 'neighbourhood', slug: 'park-street' } }), ctx);
  assert.ok(!r.matches.some((m) => m.cafe.name === 'Far Away'));
  assert.equal(r.matches.length, 3);
});

test('distance limit from device location', () => {
  const r = recommend(all, P({ location: { mode: 'current', lat: 22.5535, lng: 88.352 }, maxDistanceKm: 1 }), ctx);
  assert.ok(r.matches.every((m) => (m.distanceKm ?? 99) <= 1));
  assert.ok(r.matches.length >= 3);
});

test('budget: unknown price is a soft penalty (not exclusion); a known price above the limit is excluded', () => {
  const r = recommend(all, P({ maxBudget: 300 }), ctx);
  assert.equal(r.matches.length, 4);
  assert.ok(r.matches.every((m) => m.budgetFit === 'unknown'));
  const priced = { ...wifiYes, id: 'osm:node:1', priceMin: 500, priceMax: 800 };
  assert.equal(scoreCafe(priced, P({ maxBudget: 300 }), ctx).eligible, false);
});

test('open-at is strict: unknown hours fail, known hours are checked', () => {
  const r = recommend(all, P({ openAt: { day: 1, time: '10:00' } }), ctx);
  assert.deepEqual(r.matches.map((m) => m.cafe.name), ['Wifi Yes']);
  assert.match(scoreCafe(wifiNo, P({ openAt: { day: 1, time: '10:00' } }), ctx).failures[0].message, /unknown/i);
});

test('min rating needs real reviews (none are invented)', () => {
  assert.equal(recommend(all, P({ minRating: 4 }), ctx).matches.length, 0);
  const withReview = recommend(all, P({ minRating: 4 }), { ratings: new Map([[wifiYes.id, { cafeId: wifiYes.id, average: 4.5, count: 2 }]]) });
  assert.deepEqual(withReview.matches.map((m) => m.cafe.name), ['Wifi Yes']);
});

test('relaxing a must-have turns it into a nice-to-have and is offered when results are thin', () => {
  const prefs = P({ requiredFacilities: ['charging'] });
  const r = recommend(all, prefs, ctx);
  assert.equal(r.matches.length, 0);
  const relax = r.relaxations.find((x) => x.constraint === 'facility:charging');
  assert.ok(relax && relax.gain === 4, 'dropping the requirement unlocks every place');
  assert.match(relax!.label, /nice-to-have/);
  const next = relaxPreferences(prefs, 'facility:charging');
  assert.deepEqual(next.requiredFacilities, []);
  assert.deepEqual(next.preferredFacilities, ['charging']);
});

test('occasion evidence comes from source cuisine, never from names', () => {
  const nameOnly = osmPlace('The Coffee Room', 22.5535, 88.352); // name says coffee, tags say nothing
  const s1 = scoreCafe(wifiYes, P({ occasion: 'coffee' }), ctx);
  const s2 = scoreCafe(nameOnly, P({ occasion: 'coffee' }), ctx);
  assert.ok(s1.reasons.some((r) => /serves coffee/i.test(r)));
  assert.ok(!s2.reasons.some((r) => /coffee/i.test(r)));
  assert.ok(s1.score > s2.score);
});

test('incomplete records never crash the engine; scores are deterministic and bounded', () => {
  const bare = { ...wifiUnknown, lat: null, lng: null, facilities: [], foodTypes: [], menu: null };
  const prefs = parseQuery('quiet cafe with wifi near park street open at 9pm under 200 rated 4+').prefs;
  const a = recommend([bare, ...all], prefs, ctx);
  const b = recommend([bare, ...all], prefs, ctx);
  assert.deepEqual(a.matches.map((m) => [m.cafe.id, m.score]), b.matches.map((m) => [m.cafe.id, m.score]));
  for (const m of [...a.matches, ...a.nearMisses]) assert.ok(m.score >= 0 && m.score <= 100);
  assert.equal(scoreCafe(bare, P({ location: { mode: 'neighbourhood', slug: 'park-street' } }), ctx).eligible, false);
});

test('study summary is honest about unknowns', () => {
  assert.equal(studySummary(wifiUnknown).verdict, 'unclear');
});

test('sanitizer drops invented values from untrusted input (e.g. an LLM)', () => {
  const s = sanitizePreferences({
    occasion: 'rave',
    requiredFacilities: ['wifi', 'jacuzzi'],
    preferredFacilities: ['wifi', 'ac'],
    location: { mode: 'neighbourhood', slug: 'atlantis' },
    maxBudget: -5,
  });
  assert.equal(s.occasion, null);
  assert.deepEqual(s.requiredFacilities, ['wifi']);
  assert.deepEqual(s.preferredFacilities, ['ac'], 'a facility is either required or preferred, not both');
  assert.deepEqual(s.location, { mode: 'anywhere' });
  assert.equal(s.maxBudget, null);
});

test('parser: "open now" means now in Kolkata, not on the device', () => {
  const { prefs } = parseQuery('cafe open now near park street', new Date('2026-10-14T19:00:00Z'));
  assert.deepEqual(prefs.openAt, { day: 4, time: '00:30' });
});
