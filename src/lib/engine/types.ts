import type {
  Atmosphere,
  BudgetBand,
  Cafe,
  FacilityKey,
  Occasion,
  RatingSummary,
  Region,
  VerificationStatus,
} from '../../types';

export type LocationPref =
  | { mode: 'anywhere' }
  | { mode: 'neighbourhood'; slug: string }
  | { mode: 'region'; region: Region }
  | { mode: 'current'; lat: number; lng: number; label?: string };

/**
 * Everything a person can ask for. Every field is optional in spirit:
 * null / empty means "no preference". This object is also the contract
 * an LLM must fill when AI-assisted parsing is enabled.
 */
export interface Preferences {
  occasion: Occasion | null;
  budget: BudgetBand | null;
  /** Explicit per-person ceiling (e.g. "under ₹400"); overrides the band ceiling. */
  maxBudget: number | null;
  location: LocationPref;
  atmosphere: Atmosphere[];
  /** STRICT: places that can't be shown to have these are excluded (with an explanation). */
  requiredFacilities: FacilityKey[];
  /** SOFT: boost places that have these; unknown costs a small uncertainty penalty. */
  preferredFacilities: FacilityKey[];
  maxDistanceKm: number | null;
  foodType: string | null;
  seating: 'indoor' | 'outdoor' | null;
  minRating: number | null;
  /** Wants the place open at this local time. day: 0=Sun…6=Sat. */
  openAt: { day: number; time: string } | null;
  /** Free-text words that should boost relevance (name, menu, tags). */
  keywords: string[];
  durationHours: number | null;
}

export const EMPTY_PREFERENCES: Preferences = {
  occasion: null,
  budget: null,
  maxBudget: null,
  location: { mode: 'anywhere' },
  atmosphere: [],
  requiredFacilities: [],
  preferredFacilities: [],
  maxDistanceKm: null,
  foodType: null,
  seating: null,
  minRating: null,
  openAt: null,
  keywords: [],
  durationHours: null,
};

export type ConstraintKey =
  | 'budget'
  | 'location'
  | 'distance'
  | 'minRating'
  | 'openAt'
  | 'seating'
  | `facility:${FacilityKey}`;

export interface ConstraintFailure {
  constraint: ConstraintKey;
  message: string;
}

export type BudgetFit = 'within' | 'partial' | 'over' | 'unknown' | 'not_requested';

export interface FacilityCheck {
  key: FacilityKey;
  required: boolean;
  available: boolean | null;
  status: VerificationStatus;
  lastVerified: string | null;
}

export interface Match {
  cafe: Cafe;
  /** 0–100 after penalties. */
  score: number;
  eligible: boolean;
  /** Positive, evidence-backed reasons. Never includes unknown facts. */
  reasons: string[];
  /** Mandatory conditions this café fails (makes it ineligible). */
  failures: ConstraintFailure[];
  /** Requested information that is missing or unconfirmed for this café. */
  unknowns: string[];
  budgetFit: BudgetFit;
  distanceKm: number | null;
  facilityChecks: FacilityCheck[];
  rating: RatingSummary | null;
  /** Points breakdown, useful for transparency/debugging. */
  breakdown: Record<string, { points: number; max: number }>;
  penalties: number;
}

export interface Relaxation {
  constraint: ConstraintKey;
  /** What the user would do, e.g. "Make ‘Wi-Fi’ a nice-to-have". */
  label: string;
  /** How many places become eligible if this constraint is dropped. */
  gain: number;
}

export interface RecommendationResult {
  matches: Match[]; // eligible, ranked
  nearMisses: Match[]; // ineligible but closest, ranked
  relaxations: Relaxation[];
  totalConsidered: number;
}

export interface EngineContext {
  ratings: Map<string, RatingSummary>;
  now?: Date;
  /** Exact origin for distances (e.g. device location kept in the browser). Overrides the preference's origin. */
  origin?: { lat: number; lng: number } | null;
}
