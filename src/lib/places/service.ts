import type { Cafe } from '../../types';
import { config } from '../config';
import { DEFAULT_CITY, type Bounds } from '../cities';
import { distanceKm } from '../geo';
import { applyCommunity, fetchCommunitySummary, fetchCuratedByKeys, fetchCuratedInBounds, mergeCurated, samePlace } from '../repository/curated';
import { areaToQuery, type AreaSelection } from './area';
import { fetchPlaces } from './client';
import { providerOfKey } from './keys';
import { runQuery, type PlacesMeta, type PlacesQuery, type PlacesResponse } from './query';

// ───────────────────────────────────────────────────────────────
// One entry point for place data used by every page:
//   live provider (OpenStreetMap via /api/places)
//     + THIRD PLACE verified layer (Supabase)
//     + unverified community summaries (Supabase)
// or, only when VITE_DEMO_MODE=true, the fictional demo dataset.
// The live path NEVER falls back to demo data: failures surface as errors.
// ───────────────────────────────────────────────────────────────

export interface PlacesResult extends PlacesResponse {
  /** The Supabase enrichment failed; base provider data is still shown. */
  enrichmentError?: string;
}

let demoData: Promise<Cafe[]> | null = null;
function loadDemo(): Promise<Cafe[]> {
  // Build-time constant: when demo mode is off the import (and the fictional
  // dataset) is removed from the production bundle entirely.
  demoData ??= import.meta.env.VITE_DEMO_MODE === 'true' ? import('../../data/demoCafes').then((m) => m.DEMO_CAFES) : Promise.resolve([]);
  return demoData;
}

function demoMeta(total: number, returned: number, missing?: string[]): PlacesMeta {
  return {
    provider: 'demo',
    attribution: 'Fictional demo data',
    license: null,
    snapshotAt: null,
    sourceDataAt: null,
    stale: false,
    total,
    returned,
    truncated: total > returned,
    ...(missing ? { missingKeys: missing } : {}),
  };
}

async function demoQuery(query: PlacesQuery, limit: number): Promise<PlacesResult> {
  const all = await loadDemo();
  const r = runQuery(all, query, limit);
  return { places: r.places, meta: demoMeta(r.total, r.places.length, r.missingKeys) };
}

function boundsOf(query: PlacesQuery): Bounds | null {
  if (query.kind === 'bbox') return query.bounds;
  if (query.kind === 'near') {
    const dLat = query.radiusKm / 111;
    const dLng = query.radiusKm / (111 * Math.cos((query.lat * Math.PI) / 180));
    return { south: query.lat - dLat, north: query.lat + dLat, west: query.lng - dLng, east: query.lng + dLng };
  }
  return null;
}

async function enrich(res: PlacesResponse, query: PlacesQuery): Promise<PlacesResult> {
  if (!config.supabaseConfigured) return res;
  try {
    const keys = res.places.map((p) => p.id);
    const area = boundsOf(query);
    const [curatedLinked, curatedArea, community] = await Promise.all([
      fetchCuratedByKeys(keys),
      area ? fetchCuratedInBounds(area) : query.kind === 'keys' ? fetchCuratedByKeys(query.keys.filter((k) => providerOfKey(k) === 'thirdplace')) : Promise.resolve([]),
      fetchCommunitySummary(keys),
    ]);
    const byKey = new Map(curatedLinked.map((c) => [c.id, c]));
    let places = res.places.map((p) => applyCommunity(mergeCurated(p, byKey.get(p.id)), community));
    // Standalone THIRD PLACE records (e.g. cafés missing from OpenStreetMap) inside this area.
    const extras = curatedArea.filter((c) => providerOfKey(c.id) === 'thirdplace' && !places.some((p) => samePlace(p, c)));
    if (query.kind === 'near') {
      places = [...places, ...extras.filter((c) => c.lat != null && distanceKm(query.lat, query.lng, c.lat, c.lng!) <= query.radiusKm)];
    } else places = [...places, ...extras];
    return { places, meta: { ...res.meta, total: res.meta.total + extras.length, returned: places.length } };
  } catch (e) {
    return { ...res, enrichmentError: (e as Error).message || 'Verified details could not be loaded.' };
  }
}

export async function loadArea(area: AreaSelection, signal?: AbortSignal): Promise<PlacesResult> {
  const { query, limit } = areaToQuery(area);
  if (config.demoMode) return demoQuery(query, limit);
  const res = await fetchPlaces(query, { signal, limit, cityId: DEFAULT_CITY.id });
  return enrich(res, query);
}

export async function loadByKeys(keys: string[], signal?: AbortSignal): Promise<PlacesResult> {
  const unique = Array.from(new Set(keys));
  if (!unique.length) return { places: [], meta: demoMeta(0, 0) };
  if (config.demoMode) return demoQuery({ kind: 'keys', keys: unique }, unique.length);
  const providerKeys = unique.filter((k) => providerOfKey(k) === 'openstreetmap');
  const curatedKeys = unique.filter((k) => providerOfKey(k) === 'thirdplace');
  const results: PlacesResult[] = [];
  for (let i = 0; i < providerKeys.length; i += 50) {
    const query: PlacesQuery = { kind: 'keys', keys: providerKeys.slice(i, i + 50) };
    results.push(await enrich(await fetchPlaces(query, { signal }), query));
  }
  let curated: Cafe[] = [];
  if (curatedKeys.length && config.supabaseConfigured) curated = await fetchCuratedByKeys(curatedKeys);
  const places = [...results.flatMap((r) => r.places), ...curated];
  const found = new Set(places.map((p) => p.id));
  const meta = results[0]?.meta ?? demoMeta(0, 0);
  return {
    places: unique.map((k) => places.find((p) => p.id === k)).filter((p): p is Cafe => !!p),
    meta: { ...meta, provider: meta.provider, total: places.length, returned: places.length, truncated: false, missingKeys: unique.filter((k) => !found.has(k)) },
    enrichmentError: results.find((r) => r.enrichmentError)?.enrichmentError,
  };
}

export async function searchByName(q: string, signal?: AbortSignal): Promise<PlacesResult> {
  const query: PlacesQuery = { kind: 'search', q };
  if (config.demoMode) return demoQuery(query, 30);
  const res = await fetchPlaces(query, { signal, limit: 30 });
  return enrich(res, query);
}
