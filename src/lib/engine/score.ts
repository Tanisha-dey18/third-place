import type { Cafe, FacilityKey, FacilityRecord, RatingSummary } from '../../types';
import {
  ATMOSPHERE_LABELS,
  CONFIRMING_STATUSES,
  FACILITY_LABELS,
  OCCASION_LABELS,
  VERIFICATION_LABELS,
  VERIFICATION_WEIGHT,
  budgetOption,
  neighbourhoodBySlug,
  neighbourhoodName,
  REGION_LABELS,
} from '../taxonomy';
import { DEFAULT_CITY } from '../cities';
import { cafeDistanceKm, distanceKm, formatDistance, isOpenAt } from '../geo';
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
// 1. STRICT requirements decide eligibility:
//    location / distance, must-have facilities, seating, minimum
//    rating, open-at time, and a KNOWN price above the budget.
//    A strict requirement must be shown to be met: "unknown" fails it
//    and the card explains what information is missing. Evidence counts
//    when it is café-verified, visitor-confirmed or source-provided
//    (e.g. an OpenStreetMap tag) — never when merely community-reported.
// 2. SOFT preferences rank: occasion fit, atmosphere, nice-to-have
//    facilities, budget comfort (unknown price = uncertainty penalty),
//    proximity, food, keywords, and how well-sourced the record is.
// 3. Penalties are subtracted for uncertainty on soft preferences.
// No ratings or popularity are ever invented: ratings come only from
// real reviews, and only when the user asks for them.
// ───────────────────────────────────────────────────────────────

const SOFT_UNKNOWN_PENALTY = 3;
const BUDGET_UNKNOWN_PENALTY = 4;

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
  if (prefs.location.mode === 'region') {
    const r = DEFAULT_CITY.regions[prefs.location.region];
    return { lat: r.lat, lng: r.lng };
  }
  return null;
}

function facility(cafe: Cafe, key: FacilityKey): FacilityRecord | null {
  return cafe.facilities.find((f) => f.key === key) ?? null;
}

/** Does the record positively show the facility exists? */
export function isConfirmedAvailable(rec: FacilityRecord | null | undefined): boolean {
  return !!rec && rec.available === true && CONFIRMING_STATUSES.includes(rec.status);
}

function textHaystack(cafe: Cafe): string {
  return [
    cafe.name,
    cafe.tagline,
    cafe.description,
    cafe.tags.join(' '),
    cafe.foodTypes.join(' '),
    (cafe.menu ?? []).map((m) => `${m.name} ${m.description ?? ''} ${m.category}`).join(' '),
    neighbourhoodName(cafe.neighbourhood),
  ]
    .join(' ')
    .toLowerCase();
}

const COFFEE_FOOD = /coffee|espresso|tea|chai/i;
const DESSERT_FOOD = /dessert|cake|ice cream|pastr|bakery|sweet|waffle|gelato/i;

/** Occasion evidence from source data (cuisine/category), never from names or looks. */
function occasionEvidence(cafe: Cafe, occasion: string): string | null {
  if (occasion === 'coffee' && (cafe.foodTypes.some((f) => COFFEE_FOOD.test(f)) || cafe.category === 'coffee_shop_restaurant')) return 'Serves coffee (per source)';
  if (occasion === 'dessert' && (cafe.foodTypes.some((f) => DESSERT_FOOD.test(f)) || cafe.category === 'ice_cream')) return 'Desserts listed (per source)';
  return null;
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

  // ── Location (strict) — by real distance from a known centre ──
  const loc = prefs.location;
  const hasCoords = cafe.lat != null && cafe.lng != null;
  if (loc.mode === 'neighbourhood' || loc.mode === 'region') {
    const area =
      loc.mode === 'neighbourhood'
        ? (() => {
            const n = neighbourhoodBySlug(loc.slug);
            return n ? { name: n.name, lat: n.lat, lng: n.lng, r: n.radiusKm } : null;
          })()
        : (() => {
            const r = DEFAULT_CITY.regions[loc.region];
            return { name: REGION_LABELS[loc.region], lat: r.lat, lng: r.lng, r: r.radiusKm };
          })();
    if (area) {
      if (!hasCoords) fail('location', `Exact location unknown, so we can’t confirm it’s in ${area.name}`);
      else {
        const d = distanceKm(area.lat, area.lng, cafe.lat!, cafe.lng!);
        // With an explicit distance limit, that limit decides (checked below).
        if (prefs.maxDistanceKm == null && d > area.r) fail('location', `Not in ${area.name} (${formatDistance(d)} from its centre)`);
        else if (d <= area.r) reasons.push(`In ${area.name}`);
      }
    }
  }

  // ── Distance (strict when a limit is set) ────────────────────
  const origin = ctx.origin ?? distanceOrigin(prefs);
  const dist = cafeDistanceKm(cafe, origin);
  if (origin) {
    if (dist == null) {
      if (prefs.maxDistanceKm != null) fail('distance', 'Exact location unknown, so distance can’t be confirmed');
      add('proximity', 0, 10);
    } else {
      const limit = prefs.maxDistanceKm;
      if (limit != null && dist > limit) fail('distance', `${formatDistance(dist)} away, beyond your ${limit} km limit`);
      const scale = limit ?? 5;
      add('proximity', 10 * Math.max(0, 1 - dist / (scale * 1.5)), 10);
      if (limit == null || dist <= limit) reasons.push(`${formatDistance(dist)} away`);
    }
  }

  // ── Budget: known price above the ceiling fails; unknown price is a soft penalty ──
  const ceiling = effectiveBudgetCeiling(prefs);
  const floor = prefs.maxBudget == null ? budgetOption(prefs.budget)?.min ?? 0 : 0;
  let budgetFit: BudgetFit = 'not_requested';
  if (ceiling != null || (prefs.budget && prefs.budget !== 'flexible')) {
    if (cafe.priceMin == null) {
      budgetFit = 'unknown';
      unknowns.push('Price per person not known');
      if (!ignore.has('budget')) penalties += BUDGET_UNKNOWN_PENALTY;
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
      const inBand = (cafe.priceMax ?? cafe.priceMin) >= floor;
      reasons.push(`Fits your budget (₹${cafe.priceMin}–₹${cafe.priceMax ?? cafe.priceMin} per person)`);
      add('budget', inBand ? 15 : 12, 15);
    }
    if (cafe.priceMin != null && (cafe.priceStatus === 'unverified' || cafe.priceStatus === 'community_reported')) {
      unknowns.push(`Prices are ${VERIFICATION_LABELS[cafe.priceStatus].toLowerCase()}`);
    }
  }

  // ── Facilities ───────────────────────────────────────────────
  const facilityChecks: FacilityCheck[] = [];
  const required = prefs.requiredFacilities;
  const preferred = prefs.preferredFacilities.filter((f) => !required.includes(f));
  const profileSoft = (profile?.facilities ?? []).filter((f) => !required.includes(f) && !preferred.includes(f));
  let facPoints = 0;
  let facMax = 0;

  for (const key of required) {
    const rec = facility(cafe, key);
    const status = rec?.status ?? 'unknown';
    const available = rec?.available ?? null;
    facilityChecks.push({ key, required: true, available, status, lastVerified: rec?.lastVerified ?? null });
    facMax += 10;
    const ck = `facility:${key}` as ConstraintKey;
    if (available === false && status !== 'community_reported' && status !== 'unverified') {
      fail(ck, `No ${FACILITY_LABELS[key].toLowerCase()} (${VERIFICATION_LABELS[status].toLowerCase()})`);
    } else if (isConfirmedAvailable(rec)) {
      facPoints += 10 * VERIFICATION_WEIGHT[status];
      reasons.push(`${FACILITY_LABELS[key]}: ${VERIFICATION_LABELS[status].toLowerCase()}`);
    } else if (available === true) {
      fail(ck, `${FACILITY_LABELS[key]} only ${VERIFICATION_LABELS[status].toLowerCase()}; not confirmed`);
    } else {
      fail(ck, `${FACILITY_LABELS[key]}: no information`);
    }
  }
  for (const key of preferred) {
    const rec = facility(cafe, key);
    facilityChecks.push({ key, required: false, available: rec?.available ?? null, status: rec?.status ?? 'unknown', lastVerified: rec?.lastVerified ?? null });
    facMax += 6;
    if (isConfirmedAvailable(rec)) {
      facPoints += 6 * VERIFICATION_WEIGHT[rec!.status];
      reasons.push(`${FACILITY_LABELS[key]}: ${VERIFICATION_LABELS[rec!.status].toLowerCase()}`);
    } else if (rec?.available === false) {
      unknowns.push(`No ${FACILITY_LABELS[key].toLowerCase()} (${VERIFICATION_LABELS[rec.status].toLowerCase()})`);
    } else {
      unknowns.push(`${FACILITY_LABELS[key]}: ${rec?.available ? `only ${VERIFICATION_LABELS[rec.status].toLowerCase()}` : 'not verified'}`);
      if (!ignore.has(`facility:${key}` as ConstraintKey)) penalties += SOFT_UNKNOWN_PENALTY;
    }
  }
  for (const key of profileSoft) {
    const rec = facility(cafe, key);
    facilityChecks.push({ key, required: false, available: rec?.available ?? null, status: rec?.status ?? 'unknown', lastVerified: rec?.lastVerified ?? null });
    facMax += 3;
    if (isConfirmedAvailable(rec)) facPoints += 3 * VERIFICATION_WEIGHT[rec!.status];
  }
  if (facMax > 0) add('facilities', (facPoints / facMax) * 25, 25);

  // ── Seating (strict) ─────────────────────────────────────────
  if (prefs.seating) {
    const v = prefs.seating === 'outdoor' ? cafe.seating.outdoor : cafe.seating.indoor;
    const label = prefs.seating === 'outdoor' ? 'Outdoor seating' : 'Indoor seating';
    if (v === true) reasons.push(`Has ${label.toLowerCase()}`);
    else if (v === false) fail('seating', `No ${label.toLowerCase()}`);
    else fail('seating', `${label}: no information`);
  }

  // ── Minimum rating (strict; only real reviews count) ─────────
  if (prefs.minRating != null) {
    if (!rating || rating.count === 0) fail('minRating', 'No reviews yet');
    else if (rating.average < prefs.minRating) fail('minRating', `Rated ${rating.average.toFixed(1)} from ${rating.count} review${rating.count === 1 ? '' : 's'}`);
    else reasons.push(`Rated ${rating.average.toFixed(1)} from ${rating.count} review${rating.count === 1 ? '' : 's'}`);
  }

  // ── Open at (strict: unknown hours can't confirm "open") ─────
  if (prefs.openAt) {
    const open = isOpenAt(cafe.hours.value, prefs.openAt.day, prefs.openAt.time);
    if (open === true) reasons.push(`Open at ${prefs.openAt.time} (hours ${VERIFICATION_LABELS[cafe.hours.status].toLowerCase()})`);
    else if (open === false) fail('openAt', `Closed at ${prefs.openAt.time}`);
    else fail('openAt', cafe.hoursParse === 'unsupported' ? 'Opening hours listed in a format we can’t interpret' : 'Opening hours unknown');
  }

  // ── Occasion (soft) ──────────────────────────────────────────
  if (prefs.occasion) {
    const evidence = occasionEvidence(cafe, prefs.occasion);
    if (cafe.occasions.includes(prefs.occasion)) {
      add('occasion', 25, 25);
      reasons.unshift(`Suited to ${OCCASION_LABELS[prefs.occasion].toLowerCase()}`);
    } else if (evidence) {
      add('occasion', 18, 25);
      reasons.unshift(evidence);
    } else {
      const overlap = profile!.atmosphere.filter((a) => cafe.atmosphere.includes(a)).length;
      const tagHit = profile!.tags.some((t) => cafe.tags.includes(t));
      add('occasion', overlap * 4 + (tagHit ? 4 : 0), 25);
    }
    if (profile && profile.menuCategories.length && cafe.menu) {
      add('menu', cafe.menu.some((m) => profile.menuCategories.includes(m.category)) ? 5 : 0, 5);
    }
  }

  // ── Atmosphere (soft) ────────────────────────────────────────
  const wantedAtmos = prefs.atmosphere.length ? prefs.atmosphere : profile?.atmosphere ?? [];
  if (wantedAtmos.length) {
    const hits = wantedAtmos.filter((a) => cafe.atmosphere.includes(a));
    add('atmosphere', (hits.length / wantedAtmos.length) * 15, 15);
    if (prefs.atmosphere.length && hits.length) reasons.push(`Atmosphere: ${hits.map((a) => ATMOSPHERE_LABELS[a].toLowerCase()).join(', ')}`);
    if (prefs.atmosphere.length && !hits.length && cafe.atmosphere.length === 0) unknowns.push('Atmosphere not verified');
    if (prefs.atmosphere.includes('quiet') && cafe.noise.value && cafe.noise.value !== 'quiet') unknowns.push(`Noise level reported as ${cafe.noise.value}`);
  }

  // ── Food type (soft) ─────────────────────────────────────────
  if (prefs.foodType) {
    const ft = prefs.foodType.toLowerCase();
    const hit = cafe.foodTypes.some((f) => f.toLowerCase().includes(ft)) || (cafe.menu ?? []).some((m) => m.name.toLowerCase().includes(ft) || m.category.includes(ft));
    add('food', hit ? 8 : 0, 8);
    if (hit) reasons.push(`Serves ${prefs.foodType}`);
  }

  // ── Keywords (soft) ──────────────────────────────────────────
  if (prefs.keywords.length) {
    const hay = textHaystack(cafe);
    const hits = prefs.keywords.filter((k) => hay.includes(k.toLowerCase()));
    add('keywords', (hits.length / prefs.keywords.length) * 10, 10);
  }

  if (prefs.durationHours != null && prefs.durationHours >= 2 && !required.includes('long_stay')) {
    const ls = facility(cafe, 'long_stay');
    if (ls?.available === false) unknowns.push('Not suited to long stays');
  }

  // ── How well-sourced the record is (always) ──────────────────
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

/** Every strict requirement active for these preferences, with what relaxing it means. */
export function activeConstraints(prefs: Preferences): { key: ConstraintKey; label: string }[] {
  const out: { key: ConstraintKey; label: string }[] = [];
  const ceiling = effectiveBudgetCeiling(prefs);
  if (ceiling != null) out.push({ key: 'budget', label: `Drop the ₹${ceiling} budget` });
  if (prefs.location.mode === 'neighbourhood') out.push({ key: 'location', label: `Search beyond ${neighbourhoodName(prefs.location.slug)}` });
  if (prefs.location.mode === 'region') out.push({ key: 'location', label: `Search beyond ${REGION_LABELS[prefs.location.region]}` });
  if (prefs.maxDistanceKm != null && distanceOrigin(prefs)) out.push({ key: 'distance', label: `Drop the ${prefs.maxDistanceKm} km limit` });
  for (const f of prefs.requiredFacilities) out.push({ key: `facility:${f}`, label: `Make ‘${FACILITY_LABELS[f]}’ a nice-to-have` });
  if (prefs.seating) out.push({ key: 'seating', label: `Any seating` });
  if (prefs.minRating != null) out.push({ key: 'minRating', label: `Drop the ${prefs.minRating}+ rating` });
  if (prefs.openAt) out.push({ key: 'openAt', label: `Ignore opening time` });
  return out;
}

export function recommend(cafes: Cafe[], prefs: Preferences, ctx: EngineContext): RecommendationResult {
  const all = cafes.map((c) => scoreCafe(c, prefs, ctx));
  const matches = all.filter((m) => m.eligible).sort(byScore);
  const nearMisses = all
    .filter((m) => !m.eligible)
    .sort((a, b) => a.failures.length - b.failures.length || byScore(a, b))
    .slice(0, 3);

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

/** Relax one strict requirement. Must-have facilities become nice-to-haves rather than disappearing. */
export function relaxPreferences(prefs: Preferences, key: ConstraintKey): Preferences {
  const next: Preferences = { ...prefs, requiredFacilities: [...prefs.requiredFacilities], preferredFacilities: [...prefs.preferredFacilities] };
  if (key === 'budget') {
    next.budget = 'flexible';
    next.maxBudget = null;
  } else if (key === 'location') next.location = { mode: 'anywhere' };
  else if (key === 'distance') next.maxDistanceKm = null;
  else if (key === 'seating') next.seating = null;
  else if (key === 'minRating') next.minRating = null;
  else if (key === 'openAt') next.openAt = null;
  else if (key.startsWith('facility:')) {
    const f = key.slice('facility:'.length) as FacilityKey;
    next.requiredFacilities = next.requiredFacilities.filter((x) => x !== f);
    if (!next.preferredFacilities.includes(f)) next.preferredFacilities.push(f);
  }
  return next;
}

export function ratingsMap(list: RatingSummary[]): Map<string, RatingSummary> {
  return new Map(list.map((r) => [r.cafeId, r]));
}
