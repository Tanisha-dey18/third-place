// ───────────────────────────────────────────────────────────────
// Core domain model for THIRD PLACE.
// Every provider (OpenStreetMap, THIRD PLACE curated records, the
// opt-in development demo) produces these shapes, so the UI never
// needs to know where a record came from — but it can always show it.
// This file is shared by the browser, Netlify Functions and tests,
// so it must not import anything.
// ───────────────────────────────────────────────────────────────

/**
 * How trustworthy a piece of information is. Ordered strongest → weakest.
 * `source_provided` means "an external source says so" (e.g. an
 * OpenStreetMap tag). It is NOT a verification: nobody at THIRD PLACE
 * or a visitor has confirmed it.
 */
export type VerificationStatus =
  | 'cafe_verified' // confirmed by the café itself
  | 'visitor_confirmed' // confirmed by a visitor and accepted by a moderator
  | 'source_provided' // supplied by an external data source; not verified
  | 'community_reported' // reported by the community, not yet confirmed
  | 'unverified' // listed but never checked
  | 'unknown'; // we have no information

export type FacilityKey =
  | 'wifi'
  | 'charging'
  | 'ac'
  | 'comfortable_seating'
  | 'outdoor_seating'
  | 'long_stay'
  | 'veg_options'
  | 'parking'
  | 'wheelchair_access';

export type Atmosphere = 'quiet' | 'cosy' | 'romantic' | 'lively' | 'aesthetic' | 'outdoor' | 'work_friendly';

export type Occasion =
  | 'study'
  | 'work'
  | 'date'
  | 'friends'
  | 'birthday'
  | 'solo'
  | 'coffee'
  | 'dessert'
  | 'photography'
  | 'relaxation';

export type MenuCategory = 'coffee' | 'tea' | 'cold_beverages' | 'bakery' | 'desserts' | 'breakfast' | 'main_course' | 'snacks';

export type Dietary = 'veg' | 'non_veg' | 'vegan' | 'contains_egg';

export type NoiseLevel = 'quiet' | 'moderate' | 'lively';

export type Region = 'central' | 'south' | 'east' | 'north';

/** Where a place record comes from. */
export type PlaceProvider = 'openstreetmap' | 'thirdplace' | 'demo';

/** Kind of venue, as far as the source tells us. */
export type PlaceCategory = 'cafe' | 'ice_cream' | 'coffee_shop_restaurant' | 'other';

export interface Neighbourhood {
  slug: string;
  name: string;
  region: Region;
  /** Approximate centre of the neighbourhood (checked against OSM Nominatim). */
  lat: number;
  lng: number;
  /** Approximate radius used for "in this neighbourhood" searches. */
  radiusKm: number;
  blurb: string;
}

export interface FacilityRecord {
  key: FacilityKey;
  /** true = available, false = confirmed NOT available, null = unknown */
  available: boolean | null;
  status: VerificationStatus;
  /** When THIRD PLACE (café or accepted visitor report) last verified it. Never set for raw source data. */
  lastVerified: string | null;
  /** When the external source says its contributors last checked the place (e.g. OSM check_date). */
  sourceCheckedAt?: string | null;
  note?: string | null;
  source?: string | null;
  /** Unverified community reports, summarised (never counted as confirmation). */
  community?: { yes: number; no: number; latest: string | null } | null;
}

export interface VerifiedField<T> {
  value: T | null;
  status: VerificationStatus;
  lastVerified: string | null;
  source?: string | null;
}

export interface OpeningHoursDay {
  /** 0 = Sunday … 6 = Saturday */
  day: number;
  open: string; // "HH:MM" 24h
  close: string; // "HH:MM" 24h; may be ≤ open, meaning past midnight
}

export interface CafePhoto {
  url: string;
  alt: string;
  credit?: string | null;
  /** Stock / illustrative image, not a photo of this specific place. */
  isIllustrative: boolean;
}

export interface MenuItem {
  id: string;
  cafeId: string;
  name: string;
  description: string | null;
  category: MenuCategory;
  priceInr: number | null;
  photoUrl: string | null;
  dietary: Dietary | null;
  isBestseller: boolean;
  /** Where the bestseller flag comes from; required when isBestseller is true. */
  bestsellerSource: string | null;
  isSignature: boolean;
  popularityNote: string | null;
  source: string;
  lastUpdated: string | null;
}

export interface PlaceSource {
  provider: PlaceProvider;
  /** Provider's own stable identifier, e.g. "node/2561110172". */
  externalId: string;
  /** Link to the record at the source, when appropriate. */
  url: string | null;
  /** Link where anyone can correct the source data (e.g. the OSM editor). */
  editUrl: string | null;
  /** When THIRD PLACE last fetched this record from the source. Not a verification date. */
  fetchedAt: string | null;
  attribution: string;
  license: string | null;
}

export interface Cafe {
  /** Stable place key, e.g. "osm:node:2561110172", "tp:<uuid>", "demo:margin-notes". */
  id: string;
  /** URL-safe form of the key, used in /cafe/:slug. */
  slug: string;
  name: string;
  /** Fictional sample record (opt-in development demo only). Always surfaced in the UI. */
  isDemo: boolean;
  city: string;
  category: PlaceCategory;
  tagline: string;
  description: string;
  /** Nearest known neighbourhood slug, or null when outside all of them. */
  neighbourhood: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  priceMin: number | null; // INR per person
  priceMax: number | null;
  priceStatus: VerificationStatus;
  hours: VerifiedField<OpeningHoursDay[]>;
  /** The schedule exactly as the source supplied it (shown when we can't interpret it). */
  rawOpeningHours: string | null;
  /** parsed = interpreted; unsupported = present but too complex/malformed; missing = not supplied. */
  hoursParse: 'parsed' | 'unsupported' | 'missing';
  hoursNote: string | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  atmosphere: Atmosphere[];
  occasions: Occasion[];
  noise: VerifiedField<NoiseLevel>;
  seating: {
    indoor: boolean | null;
    outdoor: boolean | null;
    groupFriendly: boolean | null;
    note: string | null;
  };
  foodTypes: string[];
  dietary: VerifiedField<{ veg: boolean | null; nonVeg: boolean | null }>;
  facilities: FacilityRecord[];
  photos: CafePhoto[];
  tags: string[];
  accessibilityNote: string | null;
  /** Other source-provided details (takeaway, delivery, smoking…), shown as-is. */
  extras: { label: string; value: string }[];
  dataSource: string;
  source: PlaceSource;
  verificationStatus: VerificationStatus;
  lastVerified: string | null;
  /** When the record entered OUR database (curated records only); null for live source records. */
  createdAt: string | null;
  /** null = no menu information at all; [] = a menu is known to be empty. */
  menu: MenuItem[] | null;
}

export interface RatingSummary {
  cafeId: string;
  average: number;
  count: number;
}

export interface Review {
  id: string;
  cafeId: string;
  userId: string;
  authorName: string;
  rating: number;
  body: string;
  visitedOn: string | null;
  photoUrl: string | null;
  photoPath?: string | null;
  createdAt: string;
  /** Stored only in this browser (demo mode). */
  isLocal: boolean;
}

export type ReportType = 'facility' | 'menu_price' | 'opening_hours' | 'noise' | 'other';

export interface FacilityReport {
  cafeId: string;
  reportType: ReportType;
  facility: FacilityKey | null;
  /** For facility reports: does the reporter say it IS available? */
  reportedAvailable?: boolean | null;
  reportedValue: string | null;
  details: string;
}

export interface UserCollection {
  id: string;
  name: string;
  description: string | null;
  cafeIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  displayName: string | null;
  preferredBudget: BudgetBand | null;
  preferredNeighbourhood: string | null;
  dietaryPreferences: string[];
}

export type BudgetBand = 'under150' | '150to300' | '300to500' | '500to1000' | 'flexible';
