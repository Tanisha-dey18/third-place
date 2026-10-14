import type { Atmosphere, BudgetBand, FacilityKey, Occasion, Region } from '../../types';
import { ATMOSPHERE_LABELS, FACILITY_LABELS, NEIGHBOURHOODS, OCCASION_LABELS } from '../taxonomy';
import { EMPTY_PREFERENCES, type Preferences } from './types';

// Validates untrusted preference objects (from an LLM, a URL, or local
// storage) against the controlled vocabularies. Unknown values are dropped,
// never passed through. Used by both the browser and the Netlify function.

const OCCASIONS = Object.keys(OCCASION_LABELS) as Occasion[];
const ATMOSPHERES = Object.keys(ATMOSPHERE_LABELS) as Atmosphere[];
const FACILITIES = Object.keys(FACILITY_LABELS) as FacilityKey[];
const BANDS: BudgetBand[] = ['under150', '150to300', '300to500', '500to1000', 'flexible'];
const REGIONS: Region[] = ['central', 'south', 'east', 'north'];

const num = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;

export function sanitizePreferences(input: unknown): Preferences {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: Preferences = { ...EMPTY_PREFERENCES, atmosphere: [], requiredFacilities: [], keywords: [] };

  if (OCCASIONS.includes(o.occasion as Occasion)) out.occasion = o.occasion as Occasion;
  if (BANDS.includes(o.budget as BudgetBand)) out.budget = o.budget as BudgetBand;
  out.maxBudget = num(o.maxBudget, 30, 20000);

  const loc = o.location as Record<string, unknown> | undefined;
  if (loc && loc.mode === 'neighbourhood' && NEIGHBOURHOODS.some((n) => n.slug === loc.slug)) {
    out.location = { mode: 'neighbourhood', slug: loc.slug as string };
  } else if (loc && loc.mode === 'region' && REGIONS.includes(loc.region as Region)) {
    out.location = { mode: 'region', region: loc.region as Region };
  } else if (loc && loc.mode === 'current' && num(loc.lat, -90, 90) != null && num(loc.lng, -180, 180) != null) {
    out.location = { mode: 'current', lat: loc.lat as number, lng: loc.lng as number };
  }

  if (Array.isArray(o.atmosphere)) out.atmosphere = Array.from(new Set(o.atmosphere.filter((a): a is Atmosphere => ATMOSPHERES.includes(a))));
  if (Array.isArray(o.requiredFacilities))
    out.requiredFacilities = Array.from(new Set(o.requiredFacilities.filter((f): f is FacilityKey => FACILITIES.includes(f))));
  out.maxDistanceKm = num(o.maxDistanceKm, 0.1, 50);
  if (typeof o.foodType === 'string' && o.foodType.length <= 40) out.foodType = o.foodType.trim().toLowerCase() || null;
  if (o.seating === 'indoor' || o.seating === 'outdoor') out.seating = o.seating;
  out.minRating = num(o.minRating, 1, 5);
  const oa = o.openAt as Record<string, unknown> | undefined;
  if (oa && num(oa.day, 0, 6) != null && typeof oa.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(oa.time)) {
    out.openAt = { day: oa.day as number, time: oa.time };
  }
  if (Array.isArray(o.keywords))
    out.keywords = o.keywords.filter((k): k is string => typeof k === 'string' && k.length > 1 && k.length <= 30).slice(0, 8).map((k) => k.toLowerCase());
  out.durationHours = num(o.durationHours, 0.25, 24);
  return out;
}
