import type { Region } from '../../types';
import { DEFAULT_CITY, type Bounds } from '../cities';
import { neighbourhoodBySlug, REGION_LABELS } from '../taxonomy';
import type { Preferences } from '../engine/types';
import type { PlacesQuery } from './query';

/** What part of the city the user is looking at. Serialisable and URL-friendly. */
export type AreaSelection =
  | { kind: 'neighbourhood'; slug: string }
  | { kind: 'region'; region: Region }
  | { kind: 'near'; lat: number; lng: number; radiusKm: number; label: string; device: boolean }
  | { kind: 'city' }
  | { kind: 'bounds'; bounds: Bounds };

export const CITY_RESULT_LIMIT = 300;

export function areaToQuery(area: AreaSelection): { query: PlacesQuery; limit: number } {
  switch (area.kind) {
    case 'neighbourhood': {
      const n = neighbourhoodBySlug(area.slug) ?? DEFAULT_CITY.neighbourhoods[0];
      return { query: { kind: 'near', lat: n.lat, lng: n.lng, radiusKm: n.radiusKm + 0.6 }, limit: 200 };
    }
    case 'region': {
      const r = DEFAULT_CITY.regions[area.region];
      return { query: { kind: 'near', lat: r.lat, lng: r.lng, radiusKm: r.radiusKm }, limit: 250 };
    }
    case 'near':
      return { query: { kind: 'near', lat: area.lat, lng: area.lng, radiusKm: area.radiusKm }, limit: 200 };
    case 'bounds':
      return { query: { kind: 'bbox', bounds: area.bounds }, limit: 300 };
    case 'city':
    default:
      return { query: { kind: 'near', lat: DEFAULT_CITY.center.lat, lng: DEFAULT_CITY.center.lng, radiusKm: DEFAULT_CITY.cityRadiusKm }, limit: CITY_RESULT_LIMIT };
  }
}

export function areaLabel(area: AreaSelection): string {
  switch (area.kind) {
    case 'neighbourhood':
      return neighbourhoodBySlug(area.slug)?.name ?? DEFAULT_CITY.name;
    case 'region':
      return REGION_LABELS[area.region];
    case 'near':
      return area.label;
    case 'bounds':
      return 'this map area';
    default:
      return `all of ${DEFAULT_CITY.name}`;
  }
}

/** Centre used for distances when the user hasn't shared a location. */
export function areaCentre(area: AreaSelection): { lat: number; lng: number } {
  switch (area.kind) {
    case 'neighbourhood': {
      const n = neighbourhoodBySlug(area.slug);
      return n ? { lat: n.lat, lng: n.lng } : DEFAULT_CITY.center;
    }
    case 'region':
      return { lat: DEFAULT_CITY.regions[area.region].lat, lng: DEFAULT_CITY.regions[area.region].lng };
    case 'near':
      return { lat: area.lat, lng: area.lng };
    case 'bounds':
      return { lat: (area.bounds.south + area.bounds.north) / 2, lng: (area.bounds.west + area.bounds.east) / 2 };
    default:
      return DEFAULT_CITY.center;
  }
}

/** The data area needed to evaluate a set of preferences. */
export function areaForPreferences(prefs: Preferences): AreaSelection {
  const loc = prefs.location;
  if (loc.mode === 'neighbourhood') {
    if (prefs.maxDistanceKm != null) {
      const n = neighbourhoodBySlug(loc.slug);
      if (n) return { kind: 'near', lat: n.lat, lng: n.lng, radiusKm: Math.max(prefs.maxDistanceKm, 0.5), label: n.name, device: false };
    }
    return { kind: 'neighbourhood', slug: loc.slug };
  }
  if (loc.mode === 'region') return { kind: 'region', region: loc.region };
  if (loc.mode === 'current') return { kind: 'near', lat: loc.lat, lng: loc.lng, radiusKm: Math.min(prefs.maxDistanceKm ?? 5, 20), label: 'near you', device: true };
  return { kind: 'city' };
}

/** Stable string for effect dependencies / cache keys. Device coordinates are rounded. */
export function areaKey(area: AreaSelection): string {
  if (area.kind === 'near') return `near:${area.lat.toFixed(3)},${area.lng.toFixed(3)},${area.radiusKm}`;
  if (area.kind === 'bounds') return `bounds:${Object.values(area.bounds).map((v) => v.toFixed(3)).join(',')}`;
  if (area.kind === 'neighbourhood') return `n:${area.slug}`;
  if (area.kind === 'region') return `r:${area.region}`;
  return 'city';
}
