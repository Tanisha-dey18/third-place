import type {
  Atmosphere,
  BudgetBand,
  Dietary,
  FacilityKey,
  MenuCategory,
  Neighbourhood,
  NoiseLevel,
  Occasion,
  VerificationStatus,
} from '../types';
import { DEFAULT_CITY } from './cities';
import { distanceKm } from './geo';

// Labels and controlled vocabularies shared by the UI, the engine
// and the natural-language parser. Keep this the single source of truth.

export const FACILITY_LABELS: Record<FacilityKey, string> = {
  wifi: 'Wi-Fi',
  charging: 'Charging points',
  ac: 'Air conditioning',
  comfortable_seating: 'Comfortable seating',
  outdoor_seating: 'Outdoor seating',
  long_stay: 'Long-stay friendly',
  veg_options: 'Vegetarian options',
  parking: 'Parking',
  wheelchair_access: 'Step-free access',
};

/** Facilities selectable as hard requirements in the Find My Place engine. */
export const REQUIRABLE_FACILITIES: FacilityKey[] = [
  'charging',
  'wifi',
  'ac',
  'comfortable_seating',
  'outdoor_seating',
  'long_stay',
  'veg_options',
  'parking',
];

export const ATMOSPHERE_LABELS: Record<Atmosphere, string> = {
  quiet: 'Quiet',
  cosy: 'Cosy',
  romantic: 'Romantic',
  lively: 'Lively',
  aesthetic: 'Aesthetic',
  outdoor: 'Outdoor',
  work_friendly: 'Work-friendly',
};

export const OCCASION_LABELS: Record<Occasion, string> = {
  study: 'Study',
  work: 'Work',
  date: 'Date',
  friends: 'Friends',
  birthday: 'Birthday',
  solo: 'Solo time',
  coffee: 'Coffee',
  dessert: 'Dessert',
  photography: 'Photography',
  relaxation: 'Relaxation',
};

export const MENU_CATEGORY_LABELS: Record<MenuCategory, string> = {
  coffee: 'Coffee',
  tea: 'Tea',
  cold_beverages: 'Cold beverages',
  bakery: 'Bakery',
  desserts: 'Desserts',
  breakfast: 'Breakfast',
  main_course: 'Main course',
  snacks: 'Snacks',
};

export const DIETARY_LABELS: Record<Dietary, string> = {
  veg: 'Vegetarian',
  non_veg: 'Non-vegetarian',
  vegan: 'Vegan',
  contains_egg: 'Contains egg',
};

export const NOISE_LABELS: Record<NoiseLevel, string> = {
  quiet: 'Quiet',
  moderate: 'Moderate chatter',
  lively: 'Lively',
};

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  cafe_verified: 'Café-verified',
  visitor_confirmed: 'Visitor-confirmed',
  source_provided: 'Source-provided · not verified',
  community_reported: 'Community-reported',
  unverified: 'Unverified',
  unknown: 'Unknown',
};

export const VERIFICATION_HELP: Record<VerificationStatus, string> = {
  cafe_verified: 'Confirmed directly by the café.',
  visitor_confirmed: 'Confirmed by a visitor and accepted by a moderator.',
  source_provided: 'Supplied by an external data source (e.g. OpenStreetMap contributors). THIRD PLACE has not verified it.',
  community_reported: 'Reported by the community; not yet confirmed.',
  unverified: 'Listed but never checked.',
  unknown: 'We have no information about this yet.',
};

/** Statuses that count as evidence a facility exists, for STRICT requirements. */
export const CONFIRMING_STATUSES: VerificationStatus[] = ['cafe_verified', 'visitor_confirmed', 'source_provided'];

/** Confidence weight per status, used by the recommendation engine. */
export const VERIFICATION_WEIGHT: Record<VerificationStatus, number> = {
  cafe_verified: 1,
  visitor_confirmed: 0.9,
  source_provided: 0.7,
  community_reported: 0.5,
  unverified: 0.35,
  unknown: 0,
};

export interface BudgetOption {
  band: BudgetBand;
  label: string;
  /** Inclusive per-person ceiling in INR; null = no ceiling. */
  max: number | null;
  min: number;
}

export const BUDGET_OPTIONS: BudgetOption[] = [
  { band: 'under150', label: 'Under ₹150', min: 0, max: 150 },
  { band: '150to300', label: '₹150–₹300', min: 150, max: 300 },
  { band: '300to500', label: '₹300–₹500', min: 300, max: 500 },
  { band: '500to1000', label: '₹500–₹1,000', min: 500, max: 1000 },
  { band: 'flexible', label: 'Flexible', min: 0, max: null },
];

export function budgetOption(band: BudgetBand | null | undefined): BudgetOption | undefined {
  return BUDGET_OPTIONS.find((b) => b.band === band);
}

export const DISTANCE_OPTIONS: { value: number | null; label: string }[] = [
  { value: 1, label: 'Within 1 km' },
  { value: 3, label: 'Within 3 km' },
  { value: 5, label: 'Within 5 km' },
  { value: null, label: 'Any distance' },
];

/** Neighbourhoods of the active city (see cities.ts). */
export const NEIGHBOURHOODS: Neighbourhood[] = DEFAULT_CITY.neighbourhoods;

export const REGION_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(DEFAULT_CITY.regions).map(([k, v]) => [k, v.name]),
);

export function neighbourhoodBySlug(slug: string | null | undefined): Neighbourhood | undefined {
  return NEIGHBOURHOODS.find((n) => n.slug === slug);
}

export function neighbourhoodName(slug: string | null | undefined): string {
  return neighbourhoodBySlug(slug)?.name ?? DEFAULT_CITY.name;
}

/**
 * Nearest configured neighbourhood whose (generous) area contains the point.
 * Used only as a display label; returns null rather than guessing.
 */
export function nearestNeighbourhood(lat: number | null, lng: number | null): Neighbourhood | null {
  if (lat == null || lng == null) return null;
  let best: { n: Neighbourhood; d: number } | null = null;
  for (const n of NEIGHBOURHOODS) {
    const d = distanceKm(lat, lng, n.lat, n.lng);
    if (d <= Math.max(n.radiusKm * 1.6, 1) && (!best || d / n.radiusKm < best.d / best.n.radiusKm)) best = { n, d };
  }
  return best?.n ?? null;
}

export const KOLKATA_CENTER = DEFAULT_CITY.center;
