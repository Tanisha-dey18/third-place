// Test-only helpers. Synthetic records here exist only inside the test suite.
import type { Cafe } from '../src/types';
import { normalizeOsmElement } from '../src/lib/places/osm';

let nextId = 9_000_000_000;

/** Build a normalised OSM place from tags, exactly as production would. */
export function osmPlace(name: string, lat: number, lng: number, tags: Record<string, string> = {}): Cafe {
  const r = normalizeOsmElement({ type: 'node', id: nextId++, lat, lon: lng, tags: { amenity: 'cafe', name, ...tags } }, { cityId: 'kolkata', fetchedAt: '2026-10-14T00:00:00.000Z' });
  if (!r.ok) throw new Error(`test place ${name} did not normalise: ${r.reason}`);
  return r.place;
}

/** Minimal Overpass JSON body. */
export function overpassBody(elements: unknown[]) {
  return JSON.stringify({ version: 0.6, osm3s: { timestamp_osm_base: '2026-10-14T16:55:20Z' }, elements });
}

export function el(id: number, name: string | null, lat: number, lon: number, tags: Record<string, string> = {}) {
  return { type: 'node', id, lat, lon, tags: { amenity: 'cafe', ...(name ? { name } : {}), ...tags } };
}

/** Fake fetch that records calls and replays scripted responses. */
export function scriptedFetch(responses: (() => Response | Promise<Response>)[]) {
  const calls: { url: string; body: string }[] = [];
  let i = 0;
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: String(init?.body ?? '') });
    const next = responses[Math.min(i, responses.length - 1)];
    i++;
    return next();
  }) as typeof fetch;
  return { fetch: fn, calls };
}

export const ok = (body: string) => () => new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
export const status = (code: number) => () => new Response('busy', { status: code });
