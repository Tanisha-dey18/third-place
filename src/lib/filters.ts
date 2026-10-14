import type { Atmosphere, BudgetBand, Cafe, FacilityKey, PlaceCategory, RatingSummary } from '../types';
import { budgetOption, CONFIRMING_STATUSES, neighbourhoodName } from './taxonomy';
import { cafeDistanceKm, isOpenAt } from './geo';
import { zonedDayTime } from './time';
import { getCity } from './cities';

// Plain, predictable filters for the Explore page.
// Semantics: categories combine with AND. Within atmosphere, ANY selected
// mood matches. Within facilities, ALL selected must be backed by evidence
// (café-verified, visitor-confirmed or source-provided) — unknown never
// counts as a yes. "Open now" uses the city's timezone and needs known hours.

export interface ExploreFilters {
  q: string;
  budget: BudgetBand | null;
  maxPrice: number | null;
  atmosphere: Atmosphere[];
  facilities: FacilityKey[];
  categories: PlaceCategory[];
  cuisine: string | null;
  openNow: boolean;
  tag: string | null;
}

export const EMPTY_FILTERS: ExploreFilters = { q: '', budget: null, maxPrice: null, atmosphere: [], facilities: [], categories: [], cuisine: null, openNow: false, tag: null };

export type SortKey = 'relevance' | 'distance' | 'name' | 'price_asc' | 'price_desc' | 'rating';

export const SORT_LABELS: Record<SortKey, string> = {
  relevance: 'Best match',
  distance: 'Distance',
  name: 'Name (A–Z)',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  rating: 'Rating (real reviews)',
};

export interface FilterOutcome {
  list: Cafe[];
  /** Places excluded only because something you asked for isn't known there. */
  hiddenUnknown: number;
}

function matchesText(c: Cafe, q: string): boolean {
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const hay = [c.name, c.tagline, c.neighbourhood ? neighbourhoodName(c.neighbourhood) : '', c.address ?? '', c.foodTypes.join(' '), c.tags.join(' '), (c.menu ?? []).map((m) => m.name).join(' ')]
    .join(' ')
    .toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

export function applyFilters(cafes: Cafe[], f: ExploreFilters, now: Date = new Date()): FilterOutcome {
  let hiddenUnknown = 0;
  const band = budgetOption(f.budget);
  const ceiling = f.maxPrice ?? band?.max ?? null;
  const floor = f.maxPrice == null ? band?.min ?? 0 : 0;
  const list = cafes.filter((c) => {
    if (!matchesText(c, f.q)) return false;
    if (f.atmosphere.length && !f.atmosphere.some((a) => c.atmosphere.includes(a))) return false;
    if (f.tag && !c.tags.includes(f.tag)) return false;
    if (f.categories.length && !f.categories.includes(c.category)) return false;
    if (f.cuisine && !c.foodTypes.some((x) => x.toLowerCase() === f.cuisine!.toLowerCase())) return false;
    let unknown = false;
    if (ceiling != null || floor > 0) {
      if (c.priceMin == null) unknown = true;
      else {
        if (ceiling != null && c.priceMin > ceiling) return false;
        if (floor > 0 && (c.priceMax ?? c.priceMin) < floor) return false;
      }
    }
    for (const key of f.facilities) {
      const rec = c.facilities.find((x) => x.key === key);
      if (rec?.available === false && CONFIRMING_STATUSES.includes(rec.status)) return false;
      if (rec?.available !== true || !CONFIRMING_STATUSES.includes(rec.status)) unknown = true;
    }
    if (f.openNow) {
      const { day, time } = zonedDayTime(getCity(c.city).timezone, now);
      const open = isOpenAt(c.hours.value, day, time);
      if (open === false) return false;
      if (open == null) unknown = true;
    }
    if (unknown) {
      hiddenUnknown++;
      return false;
    }
    return true;
  });
  return { list, hiddenUnknown };
}

/** Cuisine values present in a result set (filters only offer what the data has). */
export function cuisineFacets(cafes: Cafe[]): string[] {
  const counts = new Map<string, number>();
  for (const c of cafes) for (const f of c.foodTypes) counts.set(f, (counts.get(f) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12).map(([k]) => k);
}

export function sortCafes(
  list: Cafe[],
  sort: SortKey,
  opts: { origin: { lat: number; lng: number } | null; ratings: Map<string, RatingSummary>; scores?: Map<string, number> },
): Cafe[] {
  const out = [...list];
  const last = Number.POSITIVE_INFINITY;
  switch (sort) {
    case 'distance':
      if (!opts.origin) return out;
      return out.sort((a, b) => (cafeDistanceKm(a, opts.origin) ?? last) - (cafeDistanceKm(b, opts.origin) ?? last));
    case 'name':
      return out.sort((a, b) => a.name.localeCompare(b.name));
    case 'price_asc':
      return out.sort((a, b) => (a.priceMin ?? last) - (b.priceMin ?? last));
    case 'price_desc':
      return out.sort((a, b) => (b.priceMax ?? b.priceMin ?? -1) - (a.priceMax ?? a.priceMin ?? -1));
    case 'rating':
      return out.sort((a, b) => {
        const ra = opts.ratings.get(a.id);
        const rb = opts.ratings.get(b.id);
        if (!ra && !rb) return a.name.localeCompare(b.name);
        if (!ra) return 1;
        if (!rb) return -1;
        return rb.average - ra.average || rb.count - ra.count;
      });
    case 'relevance':
    default:
      if (opts.scores) return out.sort((a, b) => (opts.scores!.get(b.id) ?? 0) - (opts.scores!.get(a.id) ?? 0) || a.name.localeCompare(b.name));
      return out.sort((a, b) => a.name.localeCompare(b.name));
  }
}
