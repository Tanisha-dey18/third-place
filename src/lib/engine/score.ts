import type { Cafe, FacilityKey, RatingSummary } from '../../types';
import {
  ATMOSPHERE_LABELS,
  FACILITY_LABELS,
  OCCASION_LABELS,
  VERIFICATION_LABELS,
  VERIFICATION_WEIGHT,
  budgetOption,
  neighbourhoodBySlug,
  neighbourhoodName,
  REGION_LABELS,
} from '../taxonomy';
import { cafeDistanceKm, formatDistance, isOpenAt } from '../geo';
import { OCCASION_PROFILES } from './profiles';
import type {
  BudgetFit,
  ConstraintFailure,
  ConstraintKey,
  EngineContext,
  FacilityCheck,
  Match,
  Preferences,
  RecommendationResult,
  Relaxation,
} from './types';

// ───────────────────────────────────────────────────────────────
// Deterministic recommendation scoring.
//
// 1. Hard constraints (budget ceiling, location, distance, required
//    facilities, seating, min rating, open-at) decide ELIGIBILITY.
//    A constraint confirmed false → ineligible.
//    A constraint we cannot confirm (missing data) → eligible, but
//    penalised and listed in `unknowns`.
// 2. Soft components (occasion, atmosphere, facility confidence,
//    budget comfort, proximity, keywords, data quality) produce a
//    weighted score normalised to 0–100 over the components that
//    are actually relevant to the request.
// 3. Penalties are subtracted for each unknown/unconfirmed item.
// ───────────────────────────────────────────────────────────────

const UNKNOWN_REQUIRED_PENALTY = 7;
const WEAK_EVIDENCE_PENALTY = 2;

export function effectiveBudgetCeiling(prefs: Preferences): number | null {
  if (prefs.maxBudget != null) return prefs.maxBudget;
  return budgetOption(prefs.budget)?.max ?? null;
}

/** The point distances are measured from, if any. */
export function distanceOrigin(prefs: Preferences): { lat: number; lng: number } | null {
  if (prefs.location.mode === 'current') return { lat: prefs.location.lat, lng: prefs.location.lng };
  if (prefs.location.mode === 'neighbourhood') {
    const n = neighbourhoodBySlug(prefs.location.slug);
    return n ? { lat: n.lat, lng: n.lng } : null;
  }
  return null;
}

function facility(cafe: Cafe, key: FacilityKey) {
  return cafe.facilities.find((f) => f.key === key) ?? null;
}

function textHaystack(cafe: Cafe): string {
  return [
    cafe.name,
    cafe.tagline,
    cafe.description,
    cafe.tags.join(' '),
    cafe.foodTypes.join(' '),
    cafe.menu.map((m) => `${m.name} ${m.description ?? ''} ${m.category}`).join(' '),
    neighbourhoodName(cafe.neighbourhood),
  ]
    .join(' ')
    .toLowerCase();
}

export function scoreCafe(cafe: Cafe, prefs: Preferences, ctx: EngineContext, ignore: Set<ConstraintKey> = new Set()): Match {
  const reasons: string[] = [];
  const failures: ConstraintFailure[] = [];
  const unknowns: string[] = [];
  const breakdown: Match['breakdown'] = {};
  let penalties = 0;

  const add = (name: string, points: number, max: number) => {
    breakdown[name] = { points: Math.max(0, Math.min(points, max)), max };
  };
  const fail = (constraint: ConstraintKey, message: string) => {
    if (!ignore.has(constraint)) failures.push({ constraint, message });
  };

  const profile = prefs.occasion ? OCCASION_PROFILES[prefs.occasion] : null;
  const rating = ctx.ratings.get(cafe.id) ?? null;

  // ── Location (hard) ──────────────────────────────────────────
  const loc = prefs.location;
  if (loc.mode === 'neighbourhood' && cafe.neighbourhood !== loc.slug) {
    fail('location', `Not in ${neighbourhoodName(loc.slug)}`);
  } else if (loc.mode === 'neighbourhood') {
    reasons.push(`In ${neighbourhoodName(loc.slug)}`);
  }
  if (loc.mode === 'region') {
    const region = neighbourhoodBySlug(cafe.neighbourhood)?.region;
    if (region !== loc.region) fail('location', `Not in ${REGION_LABELS[loc.region]}`);
    else reasons.push(`In ${REGION_LABELS[loc.region]} (${neighbourhoodName(cafe.neighbourhood)})`);
  }

  // ── Distance (hard when a limit is set) ──────────────────────
  const origin = distanceOrigin(prefs);
  const dist = cafeDistanceKm(cafe, origin);
  if (origin) {
    if (dist == null) {
      unknowns.push('Exact location not available, so distance is unknown');
      if (prefs.maxDistanceKm != null && !ignore.has('distance')) penalties += UNKNOWN_REQUIRED_PENALTY;
      add('proximity', 0, 10);
    } else {
      const limit = prefs.maxDistanceKm;
      if (limit != null && dist > limit) {
        fail('distance', `${formatDistance(dist)} away — beyond your ${limit} km limit`);
      }
      const scale = limit ?? 8;
      add('proximity', 10 * Math.max(0, 1 - dist / (scale * 1.5)), 10);
      if (limit == null || dist <= limit) reasons.push(`${formatDistance(dist)} away`);
    }
  }

  // ── Budget (hard ceiling, soft comfort) ──────────────────────
  const ceiling = effectiveBudgetCeiling(prefs);
  const floor = prefs.maxBudget == null ? budgetOption(prefs.budget)?.min ?? 0 : 0;
  let budgetFit: BudgetFit = 'not_requested';
  if (ceiling != null || (prefs.budget && prefs.budget !== 'flexible')) {
    if (cafe.priceMin == null) {
      budgetFit = 'unknown';
      unknowns.push('Price per person not available');
      if (!ignore.has('budget')) penalties += UNKNOWN_REQUIRED_PENALTY;
      add('budget', 4, 15);
    } else if (ceiling != null && cafe.priceMin > ceiling) {
      budgetFit = 'over';
      fail('budget', `Starts at ₹${cafe.priceMin} per person, above your ₹${ceiling} limit`);
      add('budget', 0, 15);
    } else if (ceiling != null && (cafe.priceMax ?? cafe.priceMin) > ceiling) {
      budgetFit = 'partial';
      reasons.push(`Possible within ₹${ceiling} if you order carefully (₹${cafe.priceMin}–₹${cafe.priceMax})`);
      add('budget', 8, 15);
    } else {
      budgetFit = 'within';
      // A ₹500–₹1,000 band should prefer places that actually sit in that band.
      const inBand = (cafe.priceMax ?? cafe.priceMin) >= floor;
      reasons.push(`Fits your budget (₹${cafe.priceMin}–₹${cafe.priceMax ?? cafe.priceMin} per person)`);
      add('budget', inBand ? 15 : 12, 15);
    }
    if (cafe.priceStatus === 'unverified' || cafe.priceStatus === 'community_reported') {
      unknowns.push(`Prices are ${VERIFICATION_LABELS[cafe.priceStatus].toLowerCase()}`);
    }
  }

  // ── Required facilities (hard) + profile facilities (soft) ───
  const facilityChecks: FacilityCheck[] = [];
  const softFacilities = (profile?.facilities ?? []).filter((f) => !prefs.requiredFacilities.includes(f));
  let facPoints = 0;
  let facMax = 0;
  for (const key of prefs.requiredFacilities) {
    const rec = facility(cafe, key);
    const status = rec?.status ?? 'unknown';
    const available = rec?.available ?? null;
    facilityChecks.push({ key, required: true, available, status, lastVerified: rec?.lastVerified ?? null });
    facMax += 10;
    const ck = `facility:${key}` as ConstraintKey;
    if (available === false) {
      fail(ck, `No ${FACILITY_LABELS[key].toLowerCase()} (${VERIFICATION_LABELS[status].toLowerCase()})`);
    } else if (available === true) {
      const w = VERIFICATION_WEIGHT[status];
      facPoints += 10 * Math.max(w, 0.3);
      // Unverified listings are not evidence: they never appear as a reason.
      if (w >= VERIFICATION_WEIGHT.community_reported) reasons.push(`${FACILITY_LABELS[key]} — ${VERIFICATION_LABELS[status].toLowerCase()}`);
      if (w < 0.7 && !ignore.has(ck)) {
        penalties += w < VERIFICATION_WEIGHT.community_reported ? WEAK_EVIDENCE_PENALTY * 2 : WEAK_EVIDENCE_PENALTY;
        unknowns.push(`${FACILITY_LABELS[key]} is only ${VERIFICATION_LABELS[status].toLowerCase()}`);
      }
    } else {
      unknowns.push(`${FACILITY_LABELS[key]}: not confirmed`);
      if (!ignore.has(ck)) penalties += UNKNOWN_REQUIRED_PENALTY;
    }
  }
  for (const key of softFacilities) {
    const rec = facility(cafe, key);
    facilityChecks.push({ key, required: false, available: rec?.available ?? null, status: rec?.status ?? 'unknown', lastVerified: rec?.lastVerified ?? null });
    facMax += 4;
    if (rec?.available === true) facPoints += 4 * Math.max(VERIFICATION_WEIGHT[rec.status], 0.3);
  }
  if (facMax > 0) add('facilities', (facPoints / facMax) * 25, 25);

  // ── Seating (hard) ──────────────────────────────────────────
  if (prefs.seating === 'outdoor') {
    if (cafe.seating.outdoor === false) fail('seating', 'No outdoor seating');
    else if (cafe.seating.outdoor === true) reasons.push('Has outdoor seating');
    else {
      unknowns.push('Outdoor seating not confirmed');
      if (!ignore.has('seating')) penalties += UNKNOWN_REQUIRED_PENALTY;
    }
  } else if (prefs.seating === 'indoor') {
    if (cafe.seating.indoor === false) fail('seating', 'No indoor seating');
    else if (cafe.seating.indoor == null) unknowns.push('Indoor seating not confirmed');
  }

  // ── Minimum rating (hard; only real reviews count) ───────────
  if (prefs.minRating != null) {
    if (!rating || rating.count === 0) {
      fail('minRating', 'No verified ratings yet');
    } else if (rating.average < prefs.minRating) {
      fail('minRating', `Rated ${rating.average.toFixed(1)} from ${rating.count} review${rating.count === 1 ? '' : 's'}`);
    } else {
      reasons.push(`Rated ${rating.average.toFixed(1)} from ${rating.count} review${rating.count === 1 ? '' : 's'}`);
    }
  }

  // ── Open at (hard only when hours are known) ─────────────────
  if (prefs.openAt) {
    const open = isOpenAt(cafe.hours.value, prefs.openAt.day, prefs.openAt.time);
    if (open === false) fail('openAt', `Closed at ${prefs.openAt.time}`);
    else if (open === true) reasons.push(`Open at ${prefs.openAt.time}${cafe.hours.status === 'cafe_verified' ? '' : ` (hours ${VERIFICATION_LABELS[cafe.hours.status].toLowerCase()})`}`);
    else {
      unknowns.push('Opening hours not verified');
      if (!ignore.has('openAt')) penalties += UNKNOWN_REQUIRED_PENALTY;
    }
  }

  // ── Occasion (soft) ──────────────────────────────────────────
  if (prefs.occasion) {
    if (cafe.occasions.includes(prefs.occasion)) {
      add('occasion', 25, 25);
      reasons.unshift(`Suited to ${OCCASION_LABELS[prefs.occasion].toLowerCase()}`);
    } else {
      const overlap = profile!.atmosphere.filter((a) => cafe.atmosphere.includes(a)).length;
      const tagHit = profile!.tags.some((t) => cafe.tags.includes(t));
      add('occasion', overlap * 4 + (tagHit ? 4 : 0), 25);
    }
    if (profile && profile.menuCategories.length) {
      const hasMenu = cafe.menu.some((m) => profile.menuCategories.includes(m.category));
      add('menu', hasMenu ? 5 : 0, 5);
    }
  }

  // ── Atmosphere (soft) ────────────────────────────────────────
  const wantedAtmos = prefs.atmosphere.length ? prefs.atmosphere : profile?.atmosphere ?? [];
  if (wantedAtmos.length) {
    const hits = wantedAtmos.filter((a) => cafe.atmosphere.includes(a));
    add('atmosphere', (hits.length / wantedAtmos.length) * 15, 15);
    if (prefs.atmosphere.length && hits.length) {
      reasons.push(`Atmosphere: ${hits.map((a) => ATMOSPHERE_LABELS[a].toLowerCase()).join(', ')}`);
    }
    if (prefs.atmosphere.includes('quiet') && cafe.noise.value && cafe.noise.value !== 'quiet') {
      unknowns.push(`Noise level reported as ${cafe.noise.value}`);
    }
  }

  // ── Food type (soft) ─────────────────────────────────────────
  if (prefs.foodType) {
    const ft = prefs.foodType.toLowerCase();
    const hit = cafe.foodTypes.some((f) => f.toLowerCase().includes(ft)) || cafe.menu.some((m) => m.name.toLowerCase().includes(ft) || m.category.includes(ft));
    add('food', hit ? 8 : 0, 8);
    if (hit) reasons.push(`Serves ${prefs.foodType}`);
  }

  // ── Keywords (soft) ──────────────────────────────────────────
  if (prefs.keywords.length) {
    const hay = textHaystack(cafe);
    const hits = prefs.keywords.filter((k) => hay.includes(k.toLowerCase()));
    add('keywords', (hits.length / prefs.keywords.length) * 10, 10);
  }

  // ── Long sessions ────────────────────────────────────────────
  if (prefs.durationHours != null && prefs.durationHours >= 2 && !prefs.requiredFacilities.includes('long_stay')) {
    const ls = facility(cafe, 'long_stay');
    if (ls?.available === false) unknowns.push('Not suited to long stays');
  }

  // ── Data quality (always) ────────────────────────────────────
  add('data_quality', 5 * VERIFICATION_WEIGHT[cafe.verificationStatus], 5);

  const totals = Object.values(breakdown).reduce((acc, c) => ({ p: acc.p + c.points, m: acc.m + c.max }), { p: 0, m: 0 });
  const normalised = totals.m > 0 ? (totals.p / totals.m) * 100 : 0;
  const score = Math.max(0, Math.min(100, Math.round(normalised - penalties)));

  return {
    cafe,
    score,
    eligible: failures.length === 0,
    reasons: dedupe(reasons),
    failures,
    unknowns: dedupe(unknowns),
    budgetFit,
    distanceKm: dist,
    facilityChecks,
    rating,
    breakdown,
    penalties,
  };
}

function dedupe(xs: string[]): string[] {
  return Array.from(new Set(xs));
}

function byScore(a: Match, b: Match): number {
  if (b.score !== a.score) return b.score - a.score;
  if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
  return a.cafe.name.localeCompare(b.cafe.name);
}

/** All hard constraints that are active for these preferences. */
export function activeConstraints(prefs: Preferences): { key: ConstraintKey; label: string }[] {
  const out: { key: ConstraintKey; label: string }[] = [];
  const ceiling = effectiveBudgetCeiling(prefs);
  if (ceiling != null) out.push({ key: 'budget', label: `Budget under ₹${ceiling}` });
  if (prefs.location.mode === 'neighbourhood') out.push({ key: 'location', label: `Only ${neighbourhoodName(prefs.location.slug)}` });
  if (prefs.location.mode === 'region') out.push({ key: 'location', label: `Only ${REGION_LABELS[prefs.location.region]}` });
  if (prefs.maxDistanceKm != null && distanceOrigin(prefs)) out.push({ key: 'distance', label: `Within ${prefs.maxDistanceKm} km` });
  for (const f of prefs.requiredFacilities) out.push({ key: `facility:${f}`, label: `Must have ${FACILITY_LABELS[f].toLowerCase()}` });
  if (prefs.seating) out.push({ key: 'seating', label: `${prefs.seating === 'outdoor' ? 'Outdoor' : 'Indoor'} seating` });
  if (prefs.minRating != null) out.push({ key: 'minRating', label: `Rated ${prefs.minRating}+` });
  if (prefs.openAt) out.push({ key: 'openAt', label: `Open at ${prefs.openAt.time}` });
  return out;
}

export function recommend(cafes: Cafe[], prefs: Preferences, ctx: EngineContext): RecommendationResult {
  const all = cafes.map((c) => scoreCafe(c, prefs, ctx));
  const matches = all.filter((m) => m.eligible).sort(byScore);
  const nearMisses = all
    .filter((m) => !m.eligible)
    .sort((a, b) => a.failures.length - b.failures.length || byScore(a, b))
    .slice(0, 3);

  // Relaxation analysis: what would dropping each single constraint unlock?
  let relaxations: Relaxation[] = [];
  if (matches.length < 3) {
    relaxations = activeConstraints(prefs)
      .map(({ key, label }) => {
        const gain = cafes.filter((c) => scoreCafe(c, prefs, ctx, new Set([key])).eligible).length - matches.length;
        return { constraint: key, label, gain };
      })
      .filter((r) => r.gain > 0)
      .sort((a, b) => b.gain - a.gain);
  }

  return { matches, nearMisses, relaxations, totalConsidered: cafes.length };
}

/** Remove one hard constraint from a preferences object. */
export function relaxPreferences(prefs: Preferences, key: ConstraintKey): Preferences {
  const next: Preferences = { ...prefs, requiredFacilities: [...prefs.requiredFacilities] };
  if (key === 'budget') {
    next.budget = 'flexible';
    next.maxBudget = null;
  } else if (key === 'location') next.location = { mode: 'anywhere' };
  else if (key === 'distance') next.maxDistanceKm = null;
  else if (key === 'seating') next.seating = null;
  else if (key === 'minRating') next.minRating = null;
  else if (key === 'openAt') next.openAt = null;
  else if (key.startsWith('facility:')) {
    const f = key.slice('facility:'.length);
    next.requiredFacilities = next.requiredFacilities.filter((x) => x !== f);
  }
  return next;
}

export function ratingsMap(list: RatingSummary[]): Map<string, RatingSummary> {
  return new Map(list.map((r) => [r.cafeId, r]));
}
