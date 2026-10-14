import type { Atmosphere, BudgetBand, Cafe, FacilityKey, Occasion, RatingSummary } from '../types';
import { budgetOption, neighbourhoodName } from './taxonomy';
import { cafeDistanceKm } from './geo';

// Plain, predictable filters for the Explore page.
// Semantics: categories combine with AND. Within atmosphere, ANY selected
// mood matches. Within facilities, ALL selected must be CONFIRMED available —
// unknown never counts as a yes.

export interface ExploreFilters {
  q: string;
  area: string | null;
  budget: BudgetBand | null;
  maxPrice: number | null;
  occasion: Occasion | null;
  atmosphere: Atmosphere[];
  facilities: FacilityKey[];
  tag: string | null;
}

export type SortKey = 'relevance' | 'distance' | 'price_asc' | 'price_desc' | 'rating' | 'newest';

export const SORT_LABELS: Record<SortKey, string> = {
  relevance: 'Best match',
  distance: 'Distance',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  rating: 'Verified rating',
  newest: 'Recently added',
};

export interface FilterOutcome {
  list: Cafe[];
  /** Places excluded only because a selected facility or price is unconfirmed. */
  hiddenUnknown: number;
}

function matchesText(c: Cafe, q: string): boolean {
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const hay = [c.name, c.tagline, neighbourhoodName(c.neighbourhood), c.foodTypes.join(' '), c.tags.join(' '), c.menu.map((m) => m.name).join(' ')]
    .join(' ')
    .toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

export function applyFilters(cafes: Cafe[], f: ExploreFilters): FilterOutcome {
  let hiddenUnknown = 0;
  const band = budgetOption(f.budget);
  const ceiling = f.maxPrice ?? band?.max ?? null;
  const floor = f.maxPrice == null ? band?.min ?? 0 : 0;
  const list = cafes.filter((c) => {
    if (!matchesText(c, f.q)) return false;
    if (f.area && c.neighbourhood !== f.area) return false;
    if (f.occasion && !c.occasions.includes(f.occasion)) return false;
    if (f.atmosphere.length && !f.atmosphere.some((a) => c.atmosphere.includes(a))) return false;
    if (f.tag && !c.tags.includes(f.tag)) return false;
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
      if (rec?.available === false) return false;
      // "Confirmed" = available AND checked by the café or a recent visitor.
      if (rec?.available !== true || (rec.status !== 'cafe_verified' && rec.status !== 'visitor_confirmed')) unknown = true;
    }
    if (unknown) {
      hiddenUnknown++;
      return false;
    }
    return true;
  });
  return { list, hiddenUnknown };
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
    case 'newest':
      return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case 'relevance':
    default:
      if (opts.scores) return out.sort((a, b) => (opts.scores!.get(b.id) ?? 0) - (opts.scores!.get(a.id) ?? 0) || a.name.localeCompare(b.name));
      return out.sort((a, b) => a.name.localeCompare(b.name));
  }
}
