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
  community_reported: 'Community-reported',
  unverified: 'Unverified',
  unknown: 'Unknown',
};

export const VERIFICATION_HELP: Record<VerificationStatus, string> = {
  cafe_verified: 'Confirmed directly by the café.',
  visitor_confirmed: 'Recently confirmed by a visitor on site.',
  community_reported: 'Reported by the community; not yet confirmed.',
  unverified: 'Listed but never checked.',
  unknown: 'We have no information about this yet.',
};

/** Confidence weight per status, used by the recommendation engine. */
export const VERIFICATION_WEIGHT: Record<VerificationStatus, number> = {
  cafe_verified: 1,
  visitor_confirmed: 0.9,
  community_reported: 0.6,
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

export const NEIGHBOURHOODS: Neighbourhood[] = [
  { slug: 'park-street', name: 'Park Street', region: 'central', lat: 22.5531, lng: 88.3525, blurb: 'Old-world glamour, late evenings and the city’s classic café row.' },
  { slug: 'esplanade', name: 'Esplanade', region: 'central', lat: 22.5646, lng: 88.3511, blurb: 'Trams, tea stalls and quick, cheap pit-stops in the heart of the city.' },
  { slug: 'college-street', name: 'College Street', region: 'north', lat: 22.5755, lng: 88.3628, blurb: 'Book Para — secondhand books, students and long conversations.' },
  { slug: 'salt-lake', name: 'Salt Lake', region: 'east', lat: 22.5803, lng: 88.4153, blurb: 'Planned sectors, IT offices and work-day coffee.' },
  { slug: 'new-town', name: 'New Town', region: 'east', lat: 22.5924, lng: 88.4846, blurb: 'Wide roads, new builds and roomy spaces for groups.' },
  { slug: 'ballygunge', name: 'Ballygunge', region: 'south', lat: 22.5276, lng: 88.3654, blurb: 'Leafy lanes, old bungalows and unhurried afternoons.' },
  { slug: 'gariahat', name: 'Gariahat', region: 'south', lat: 22.5182, lng: 88.3678, blurb: 'Market bustle by day, rooftops and sweets by evening.' },
  { slug: 'southern-avenue', name: 'Southern Avenue', region: 'south', lat: 22.5147, lng: 88.3536, blurb: 'Near the Lakes — morning walks and slow breakfasts.' },
  { slug: 'alipore', name: 'Alipore', region: 'south', lat: 22.5333, lng: 88.3302, blurb: 'Green, quiet and a little grand.' },
  { slug: 'jadavpur', name: 'Jadavpur', region: 'south', lat: 22.4989, lng: 88.3714, blurb: 'University energy and pocket-friendly hangouts.' },
];

export const REGION_LABELS: Record<string, string> = {
  central: 'Central Kolkata',
  south: 'South Kolkata',
  east: 'East Kolkata',
  north: 'North Kolkata',
};

export function neighbourhoodBySlug(slug: string | null | undefined): Neighbourhood | undefined {
  return NEIGHBOURHOODS.find((n) => n.slug === slug);
}

export function neighbourhoodName(slug: string | null | undefined): string {
  return neighbourhoodBySlug(slug)?.name ?? (slug ? slug.replace(/-/g, ' ') : 'Kolkata');
}

export const KOLKATA_CENTER = { lat: 22.5448, lng: 88.3626 };
