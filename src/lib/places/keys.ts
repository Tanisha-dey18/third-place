// Stable, provider-agnostic place keys.
//   osm:node:123   → OpenStreetMap element
//   tp:<uuid>      → THIRD PLACE curated record (Supabase `cafes`)
//   demo:<slug>    → opt-in development demo record (never in production)
// Slugs are the URL-safe form used in /cafe/:slug.

export type OsmType = 'node' | 'way' | 'relation';

const OSM_KEY = /^osm:(node|way|relation):(\d{1,15})$/;
const TP_KEY = /^tp:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DEMO_KEY = /^demo:[a-z0-9]+(-[a-z0-9]+)*$/;

export function osmKey(type: OsmType, id: number | string): string {
  return `osm:${type}:${id}`;
}

export function isValidPlaceKey(key: string): boolean {
  return OSM_KEY.test(key) || TP_KEY.test(key) || DEMO_KEY.test(key);
}

export function parseOsmKey(key: string): { type: OsmType; id: string } | null {
  const m = key.match(OSM_KEY);
  return m ? { type: m[1] as OsmType, id: m[2] } : null;
}

export function providerOfKey(key: string): 'openstreetmap' | 'thirdplace' | 'demo' | null {
  if (OSM_KEY.test(key)) return 'openstreetmap';
  if (TP_KEY.test(key)) return 'thirdplace';
  if (DEMO_KEY.test(key)) return 'demo';
  return null;
}

/** "osm:node:123" → "osm-node-123"; "tp:<uuid>" → "tp-<uuid>"; "demo:x-y" → "demo-x-y". */
export function slugFromKey(key: string): string {
  const osm = parseOsmKey(key);
  if (osm) return `osm-${osm.type}-${osm.id}`;
  if (key.startsWith('tp:')) return `tp-${key.slice(3)}`;
  if (key.startsWith('demo:')) return `demo-${key.slice(5)}`;
  return encodeURIComponent(key);
}

export function keyFromSlug(slug: string): string | null {
  let m = slug.match(/^osm-(node|way|relation)-(\d{1,15})$/);
  if (m) return `osm:${m[1]}:${m[2]}`;
  m = slug.match(/^tp-([0-9a-f-]{36})$/);
  if (m && TP_KEY.test(`tp:${m[1]}`)) return `tp:${m[1]}`;
  m = slug.match(/^demo-([a-z0-9-]+)$/);
  if (m && DEMO_KEY.test(`demo:${m[1]}`)) return `demo:${m[1]}`;
  return null;
}
