import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Cafe } from '../src/types';
import { normalizeOsmElement, normalizeOsmElements, safePhone, safeUrl, dedupePlaces } from '../src/lib/places/osm';
import { keyFromSlug, slugFromKey, isValidPlaceKey } from '../src/lib/places/keys';

const fixture = JSON.parse(readFileSync('tests/fixtures/overpass-kolkata-sample.json', 'utf8'));
const opts = { cityId: 'kolkata', fetchedAt: '2026-10-14T17:00:00.000Z' };

test('parses a real Overpass response: names, coordinates, provenance', () => {
  const out = normalizeOsmElements(fixture.elements, opts);
  assert.ok(out.places.length >= 8, `expected most fixture places, got ${out.places.length}`);
  for (const p of out.places) {
    assert.match(p.id, /^osm:(node|way|relation):\d+$/);
    assert.equal(p.isDemo, false);
    assert.ok(p.name.length > 0);
    assert.ok(p.lat! > 22 && p.lat! < 23 && p.lng! > 88 && p.lng! < 89);
    assert.equal(p.verificationStatus, 'source_provided', 'source data is never "verified"');
    assert.equal(p.lastVerified, null);
    assert.equal(p.priceMin, null, 'no invented prices');
    assert.equal(p.menu, null, 'no invented menus');
    assert.deepEqual(p.photos, [], 'no stock photos for real places');
    assert.equal(p.source.provider, 'openstreetmap');
    assert.equal(p.source.fetchedAt, opts.fetchedAt);
    assert.ok(p.source.url?.startsWith('https://www.openstreetmap.org/'));
    for (const f of p.facilities) {
      assert.equal(f.status, 'source_provided');
      assert.equal(f.lastVerified, null);
    }
  }
});

test('elements without a name are skipped, not given an invented name', () => {
  const out = normalizeOsmElements(fixture.elements, opts);
  const unnamed = fixture.elements.filter((e: { tags?: Record<string, string> }) => !e.tags?.name && !e.tags?.['name:en'] && !e.tags?.brand).length;
  assert.ok(unnamed >= 1);
  assert.equal(out.skipped.no_name, unnamed);
});

test('way elements use their centre coordinates', () => {
  const r = normalizeOsmElement({ type: 'way', id: 42, center: { lat: 22.55, lon: 88.35 }, tags: { amenity: 'cafe', name: 'Centre Test' } }, opts);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual([r.place.lat, r.place.lng], [22.55, 88.35]);
});

test('missing, invalid and out-of-city coordinates are rejected', () => {
  const base = { type: 'node' as const, tags: { amenity: 'cafe', name: 'X' } };
  assert.deepEqual(normalizeOsmElement({ ...base, id: 1 }, opts), { ok: false, reason: 'invalid_coordinates' });
  assert.deepEqual(normalizeOsmElement({ ...base, id: 2, lat: NaN, lon: 88.3 }, opts), { ok: false, reason: 'invalid_coordinates' });
  assert.deepEqual(normalizeOsmElement({ ...base, id: 3, lat: 0, lon: 0 }, opts), { ok: false, reason: 'invalid_coordinates' });
  assert.deepEqual(normalizeOsmElement({ ...base, id: 4, lat: 95, lon: 88.3 }, opts), { ok: false, reason: 'invalid_coordinates' });
  assert.deepEqual(normalizeOsmElement({ ...base, id: 5, lat: 28.61, lon: 77.2 }, opts), { ok: false, reason: 'outside_city' });
});

test('non-café elements and junk input are ignored safely', () => {
  assert.deepEqual(normalizeOsmElement({ type: 'node', id: 9, lat: 22.5, lon: 88.3, tags: { amenity: 'bank', name: 'Bank' } }, opts), { ok: false, reason: 'not_a_place' });
  const out = normalizeOsmElements([null, 'x', { type: 'node', id: -1 }, { type: 'area', id: 5 }], opts);
  assert.equal(out.places.length, 0);
  assert.deepEqual(normalizeOsmElements('nope', opts).places, []);
});

test('facilities come only from tags: wlan means yes, no means no, absent stays unknown', () => {
  const mk = (tags: Record<string, string>) => normalizeOsmElement({ type: 'node', id: 7, lat: 22.55, lon: 88.35, tags: { amenity: 'cafe', name: 'T', ...tags } }, opts);
  const yes = mk({ internet_access: 'wlan' });
  const no = mk({ internet_access: 'no' });
  const none = mk({});
  assert.ok(yes.ok && no.ok && none.ok);
  if (yes.ok && no.ok && none.ok) {
    assert.equal(yes.place.facilities.find((f) => f.key === 'wifi')?.available, true);
    assert.equal(no.place.facilities.find((f) => f.key === 'wifi')?.available, false);
    assert.equal(none.place.facilities.length, 0, 'nothing inferred from a bare listing');
    assert.equal(none.place.address, null, 'missing address stays missing');
    assert.equal(none.place.hoursParse, 'missing');
  }
});

test('address is assembled only from supplied parts', () => {
  const r = normalizeOsmElement(
    { type: 'node', id: 8, lat: 22.55, lon: 88.35, tags: { amenity: 'cafe', name: 'A', 'addr:housenumber': '12', 'addr:street': 'Park Street', 'addr:city': 'Kolkata', 'addr:postcode': '700016' } },
    opts,
  );
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.place.address, '12 Park Street, Kolkata, 700016');
});

test('unsafe links are dropped; phones are sanitised', () => {
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('data:text/html,hi'), null);
  assert.equal(safeUrl('https://user:pw@evil.example'), null);
  assert.equal(safeUrl('example.com/menu'), 'https://example.com/menu');
  assert.equal(safeUrl('https://cafe.example/'), 'https://cafe.example/');
  assert.equal(safePhone('+91 33 1234 5678; +91 98300 00000'), '+91 33 1234 5678');
  assert.equal(safePhone('<script>'), null);
  assert.equal(safePhone('12'), null);
});

test('duplicates: same key once; same venue mapped twice within 60 m merged; distant branches kept', () => {
  const mk = (type: 'node' | 'way', id: number, lat: number, lon: number, name: string, extra: Record<string, string> = {}): Cafe => {
    const r = normalizeOsmElement({ type, id, lat, lon, tags: { amenity: 'cafe', name, ...extra } }, opts);
    if (!r.ok) throw new Error('fixture should normalise');
    return r.place;
  };
  const a = mk('node', 1, 22.55, 88.35, 'Blue Door Café');
  const aAgain = mk('node', 1, 22.55, 88.35, 'Blue Door Café', { opening_hours: '24/7' });
  const aWay = mk('way', 2, 22.5502, 88.3501, 'Blue Door Cafe');
  const branch = mk('node', 3, 22.6, 88.4, 'Blue Door Café');
  const out = dedupePlaces([a, aAgain, aWay, branch]);
  assert.equal(out.length, 2);
  assert.ok(out.some((p) => p.rawOpeningHours === '24/7'), 'keeps the richer duplicate');
});

test('place keys round-trip through URL slugs and reject junk', () => {
  for (const k of ['osm:node:2561110172', 'osm:way:35875256', 'tp:123e4567-e89b-42d3-a456-426614174000', 'demo:margin-notes']) {
    assert.ok(isValidPlaceKey(k));
    assert.equal(keyFromSlug(slugFromKey(k)), k);
  }
  for (const bad of ['osm:node:abc', 'osm:area:1', 'node/1', '../etc/passwd', 'tp:not-a-uuid', '']) assert.equal(isValidPlaceKey(bad), false);
  assert.equal(keyFromSlug('margin-notes'), null);
});
