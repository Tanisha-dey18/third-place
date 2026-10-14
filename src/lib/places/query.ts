import type { Cafe } from '../../types';
import { getCity, type Bounds } from '../cities';
import { distanceKm } from '../geo';
import { isValidPlaceKey } from './keys';
import { normaliseName } from './osm';

// ───────────────────────────────────────────────────────────────
// Area queries over a set of places. Pure functions shared by the
// `/api/places` Netlify Function, the opt-in demo provider and tests.
// ───────────────────────────────────────────────────────────────

export type PlacesQuery =
  | { kind: 'near'; lat: number; lng: number; radiusKm: number }
  | { kind: 'bbox'; bounds: Bounds }
  | { kind: 'keys'; keys: string[] }
  | { kind: 'search'; q: string };

export interface PlacesMeta {
  provider: 'openstreetmap' | 'demo';
  attribution: string;
  license: string | null;
  /** When the data snapshot was fetched from the provider. */
  snapshotAt: string | null;
  /** Timestamp of the provider's own database state, when supplied. */
  sourceDataAt: string | null;
  /** Snapshot older than the freshness target (still served, clearly labelled). */
  stale: boolean;
  total: number;
  returned: number;
  truncated: boolean;
  missingKeys?: string[];
}

export interface PlacesResponse {
  places: Cafe[];
  meta: PlacesMeta;
}

export interface ApiError {
  error: { code: string; message: string; retryable: boolean };
}

export const LIMITS = {
  maxLimit: 300,
  defaultLimit: 120,
  maxRadiusKm: 20,
  minRadiusKm: 0.2,
  /** Max bbox span in degrees per side (≈ 44 km); larger views must zoom in. */
  maxBboxSpanDeg: 0.4,
  maxKeys: 50,
  minSearch: 2,
  maxSearch: 60,
} as const;

const num = (v: string | null) => (v != null && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

/** Letters (any script), digits, spaces and a few name punctuation marks only. */
export function sanitizeSearch(q: string): string {
  return q
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} &'.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LIMITS.maxSearch);
}

export type ParseResult = { ok: true; query: PlacesQuery; limit: number; cityId: string } | { ok: false; status: number; error: ApiError };

const bad = (message: string, code = 'invalid_request'): ParseResult => ({ ok: false, status: 400, error: { error: { code, message, retryable: false } } });

export function parseQueryParams(params: URLSearchParams): ParseResult {
  const city = getCity(params.get('city'));
  if (params.get('city') && params.get('city') !== city.id) return bad('Unsupported city.');
  const limitRaw = num(params.get('limit'));
  const limit = Math.min(LIMITS.maxLimit, Math.max(1, Math.floor(limitRaw ?? LIMITS.defaultLimit)));
  const margin = 0.1;
  const inCity = (lat: number, lng: number) =>
    lat >= city.bounds.south - margin && lat <= city.bounds.north + margin && lng >= city.bounds.west - margin && lng <= city.bounds.east + margin;

  const modes = ['near', 'bbox', 'keys', 'q'].filter((k) => params.has(k));
  if (modes.length !== 1) return bad('Provide exactly one of: near, bbox, keys, q.');

  if (params.has('near')) {
    const [latS, lngS] = (params.get('near') ?? '').split(',');
    const lat = num(latS ?? null);
    const lng = num(lngS ?? null);
    const r = num(params.get('r'));
    if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return bad('near must be "lat,lng".');
    if (!inCity(lat, lng)) return bad(`Location is outside ${city.name}.`, 'outside_coverage');
    if (r == null || r < LIMITS.minRadiusKm || r > LIMITS.maxRadiusKm) return bad(`r must be between ${LIMITS.minRadiusKm} and ${LIMITS.maxRadiusKm} km.`);
    return { ok: true, query: { kind: 'near', lat, lng, radiusKm: r }, limit, cityId: city.id };
  }
  if (params.has('bbox')) {
    const parts = (params.get('bbox') ?? '').split(',').map((x) => num(x));
    if (parts.length !== 4 || parts.some((x) => x == null)) return bad('bbox must be "south,west,north,east".');
    const [south, west, north, east] = parts as number[];
    if (south >= north || west >= east || Math.abs(south) > 90 || Math.abs(north) > 90 || Math.abs(west) > 180 || Math.abs(east) > 180) return bad('bbox is not a valid box.');
    if (north - south > LIMITS.maxBboxSpanDeg || east - west > LIMITS.maxBboxSpanDeg) return bad('Area too large. Zoom in.', 'area_too_large');
    if (!inCity((south + north) / 2, (west + east) / 2)) return bad(`Area is outside ${city.name}.`, 'outside_coverage');
    return { ok: true, query: { kind: 'bbox', bounds: { south, west, north, east } }, limit, cityId: city.id };
  }
  if (params.has('keys')) {
    const keys = Array.from(new Set((params.get('keys') ?? '').split(',').map((k) => k.trim()).filter(Boolean)));
    if (!keys.length || keys.length > LIMITS.maxKeys) return bad(`keys must list 1–${LIMITS.maxKeys} place keys.`);
    if (!keys.every(isValidPlaceKey)) return bad('keys contains an invalid place key.');
    return { ok: true, query: { kind: 'keys', keys }, limit: LIMITS.maxKeys, cityId: city.id };
  }
  const q = sanitizeSearch(params.get('q') ?? '');
  if (q.length < LIMITS.minSearch) return bad(`Search needs at least ${LIMITS.minSearch} letters.`);
  return { ok: true, query: { kind: 'search', q }, limit: Math.min(limit, 50), cityId: city.id };
}

export function runQuery(all: Cafe[], query: PlacesQuery, limit: number): { places: Cafe[]; total: number; missingKeys?: string[] } {
  if (query.kind === 'keys') {
    const map = new Map(all.map((p) => [p.id, p]));
    const places = query.keys.map((k) => map.get(k)).filter((p): p is Cafe => !!p);
    return { places, total: places.length, missingKeys: query.keys.filter((k) => !map.has(k)) };
  }
  if (query.kind === 'search') {
    const needle = normaliseName(query.q) || query.q.toLowerCase();
    const scored = all
      .map((p) => {
        const hay = normaliseName(p.name) || p.name.toLowerCase();
        const raw = p.name.toLowerCase();
        const q = query.q.toLowerCase();
        const score = raw === q ? 4 : raw.startsWith(q) ? 3 : hay.includes(needle) || raw.includes(q) ? 2 : 0;
        return { p, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name));
    return { places: scored.slice(0, limit).map((x) => x.p), total: scored.length };
  }
  let centre: { lat: number; lng: number };
  let inside: (p: Cafe) => boolean;
  if (query.kind === 'near') {
    centre = { lat: query.lat, lng: query.lng };
    inside = (p) => distanceKm(query.lat, query.lng, p.lat!, p.lng!) <= query.radiusKm;
  } else {
    const b = query.bounds;
    centre = { lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2 };
    inside = (p) => p.lat! >= b.south && p.lat! <= b.north && p.lng! >= b.west && p.lng! <= b.east;
  }
  const matches = all
    .filter((p) => p.lat != null && p.lng != null && inside(p))
    .map((p) => ({ p, d: distanceKm(centre.lat, centre.lng, p.lat!, p.lng!) }))
    .sort((a, b) => a.d - b.d);
  return { places: matches.slice(0, limit).map((m) => m.p), total: matches.length };
}

/** Client helper: build the request URL. Coordinates are rounded for privacy and cacheability. */
export function queryToSearchParams(query: PlacesQuery, opts: { cityId?: string; limit?: number } = {}): URLSearchParams {
  const p = new URLSearchParams();
  if (opts.cityId) p.set('city', opts.cityId);
  if (query.kind === 'near') {
    // ~1 km precision: the server never sees an exact device location.
    p.set('near', `${query.lat.toFixed(2)},${query.lng.toFixed(2)}`);
    p.set('r', String(Math.min(LIMITS.maxRadiusKm, Math.ceil((query.radiusKm + 0.8) * 2) / 2)));
  } else if (query.kind === 'bbox') {
    // Snap outward to a 0.01° grid so nearby viewports share cache entries.
    const f = (v: number, up: boolean) => (up ? Math.ceil(v * 100) : Math.floor(v * 100)) / 100;
    const b = query.bounds;
    p.set('bbox', [f(b.south, false), f(b.west, false), f(b.north, true), f(b.east, true)].map((v) => v.toFixed(2)).join(','));
  } else if (query.kind === 'keys') {
    p.set('keys', [...query.keys].sort().join(','));
  } else {
    p.set('q', sanitizeSearch(query.q).toLowerCase());
  }
  if (opts.limit && query.kind !== 'keys') p.set('limit', String(opts.limit));
  return p;
}
