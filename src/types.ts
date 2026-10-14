// ───────────────────────────────────────────────────────────────
// Core domain model for THIRD PLACE.
// The same shapes are produced by the demo repository and the
// Supabase repository, so the UI never needs to know the source.
// ───────────────────────────────────────────────────────────────

/** How trustworthy a piece of information is. Ordered strongest → weakest. */
export type VerificationStatus =
  | 'cafe_verified' // confirmed by the café itself
  | 'visitor_confirmed' // recently confirmed by a visitor
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

export type Atmosphere =
  | 'quiet'
  | 'cosy'
  | 'romantic'
  | 'lively'
  | 'aesthetic'
  | 'outdoor'
  | 'work_friendly';

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

export type MenuCategory =
  | 'coffee'
  | 'tea'
  | 'cold_beverages'
  | 'bakery'
  | 'desserts'
  | 'breakfast'
  | 'main_course'
  | 'snacks';

export type Dietary = 'veg' | 'non_veg' | 'vegan' | 'contains_egg';

export type NoiseLevel = 'quiet' | 'moderate' | 'lively';

export type Region = 'central' | 'south' | 'east' | 'north';

export interface Neighbourhood {
  slug: string;
  name: string;
  region: Region;
  /** Approximate centre of the neighbourhood (used for distance + map). */
  lat: number;
  lng: number;
  blurb: string;
}

export interface FacilityRecord {
  key: FacilityKey;
  /** true = available, false = confirmed NOT available, null = unknown */
  available: boolean | null;
  status: VerificationStatus;
  lastVerified: string | null; // ISO date
  note?: string | null;
  source?: string | null;
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
  close: string; // "HH:MM" 24h; may be past midnight e.g. "01:00"
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

export interface Cafe {
  id: string;
  slug: string;
  name: string;
  /** Fictional sample record. Always surfaced in the UI. */
  isDemo: boolean;
  tagline: string;
  description: string;
  neighbourhood: string; // Neighbourhood.slug
  address: string | null;
  lat: number | null;
  lng: number | null;
  priceMin: number | null; // INR per person
  priceMax: number | null;
  priceStatus: VerificationStatus;
  hours: VerifiedField<OpeningHoursDay[]>;
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
  dataSource: string;
  verificationStatus: VerificationStatus;
  lastVerified: string | null;
  createdAt: string;
  menu: MenuItem[];
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
  createdAt: string;
  /** Stored only in this browser (demo mode). */
  isLocal: boolean;
}

export type ReportType = 'facility' | 'menu_price' | 'opening_hours' | 'noise' | 'other';

export interface FacilityReport {
  cafeId: string;
  reportType: ReportType;
  facility: FacilityKey | null;
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
