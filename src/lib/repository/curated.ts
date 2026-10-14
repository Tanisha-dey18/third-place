import type { Cafe, CafePhoto, FacilityKey, FacilityRecord, MenuItem, OpeningHoursDay, VerificationStatus } from '@/types';
import type { Bounds } from '@/lib/cities';
import { supabase } from '@/lib/supabase';
import { slugFromKey } from '@/lib/places/keys';
import { nearestNeighbourhood, VERIFICATION_WEIGHT } from '@/lib/taxonomy';
import { normaliseName } from '@/lib/places/osm';
import { distanceKm } from '@/lib/geo';

// ───────────────────────────────────────────────────────────────
// THIRD PLACE's own layer in Supabase:
//  • `cafes` rows (is_demo = false) hold VERIFIED facts — menus, prices,
//    facilities confirmed by the café or accepted visitor reports —
//    linked to a provider place by `place_key` (e.g. "osm:node:123"),
//    or standalone places missing from OpenStreetMap ("tp:<uuid>").
//  • `community_fact_summary` aggregates pending (unverified) reports.
// Writes to these tables happen only with the service role (moderators).
// ───────────────────────────────────────────────────────────────

interface FacilityRow {
  facility: FacilityKey;
  available: boolean | null;
  status: VerificationStatus;
  note: string | null;
  source: string | null;
  last_verified_at: string | null;
}
interface PhotoRow {
  url: string;
  alt: string | null;
  credit: string | null;
  is_illustrative: boolean;
  sort_order: number;
}
interface MenuRow {
  id: string;
  name: string;
  description: string | null;
  category: MenuItem['category'];
  price_inr: number | null;
  photo_url: string | null;
  dietary: MenuItem['dietary'];
  is_bestseller: boolean;
  bestseller_source: string | null;
  is_signature: boolean;
  popularity_note: string | null;
  source: string;
  last_updated: string | null;
}
export interface CafeRow {
  id: string;
  place_key: string;
  city: string;
  name: string;
  is_demo: boolean;
  tagline: string | null;
  description: string | null;
  neighbourhood: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  price_min: number | null;
  price_max: number | null;
  price_status: VerificationStatus;
  opening_hours: OpeningHoursDay[] | null;
  hours_status: VerificationStatus;
  hours_last_verified_at: string | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  atmosphere: Cafe['atmosphere'];
  occasions: Cafe['occasions'];
  noise_level: Cafe['noise']['value'];
  noise_status: VerificationStatus;
  seating_indoor: boolean | null;
  seating_outdoor: boolean | null;
  group_friendly: boolean | null;
  seating_note: string | null;
  food_types: string[];
  serves_veg: boolean | null;
  serves_non_veg: boolean | null;
  dietary_status: VerificationStatus;
  tags: string[];
  accessibility_note: string | null;
  data_source: string;
  verification_status: VerificationStatus;
  last_verified_at: string | null;
  menu_known: boolean;
  created_at: string;
  cafe_facilities: FacilityRow[] | null;
  cafe_photos: PhotoRow[] | null;
  menu_items: MenuRow[] | null;
}

const SELECT = '*, cafe_facilities(*), cafe_photos(*), menu_items(*)';
const safeHttp = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

export function mapCafeRow(r: CafeRow): Cafe {
  const key = r.place_key;
  const photos: CafePhoto[] = (r.cafe_photos ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .filter((p) => /^https:\/\//.test(p.url))
    .map((p) => ({ url: p.url, alt: p.alt ?? r.name, credit: p.credit, isIllustrative: p.is_illustrative }));
  const items = r.menu_items ?? [];
  const lat = r.latitude == null ? null : Number(r.latitude);
  const lng = r.longitude == null ? null : Number(r.longitude);
  return {
    id: key,
    slug: slugFromKey(key),
    name: r.name,
    isDemo: r.is_demo,
    city: r.city,
    category: 'cafe',
    tagline: r.tagline ?? '',
    description: r.description ?? '',
    neighbourhood: r.neighbourhood || nearestNeighbourhood(lat, lng)?.slug || null,
    address: r.address,
    lat,
    lng,
    priceMin: r.price_min,
    priceMax: r.price_max,
    priceStatus: r.price_status,
    hours: { value: r.opening_hours, status: r.hours_status, lastVerified: r.hours_last_verified_at, source: 'THIRD PLACE' },
    rawOpeningHours: null,
    hoursParse: r.opening_hours ? 'parsed' : 'missing',
    hoursNote: null,
    phone: r.phone,
    website: safeHttp(r.website),
    instagram: r.instagram,
    atmosphere: r.atmosphere ?? [],
    occasions: r.occasions ?? [],
    noise: { value: r.noise_level, status: r.noise_status, lastVerified: r.last_verified_at, source: 'THIRD PLACE' },
    seating: { indoor: r.seating_indoor, outdoor: r.seating_outdoor, groupFriendly: r.group_friendly, note: r.seating_note },
    foodTypes: r.food_types ?? [],
    dietary: { value: { veg: r.serves_veg, nonVeg: r.serves_non_veg }, status: r.dietary_status, lastVerified: r.last_verified_at, source: 'THIRD PLACE' },
    facilities: (r.cafe_facilities ?? []).map((f) => ({ key: f.facility, available: f.available, status: f.status, lastVerified: f.last_verified_at, note: f.note, source: f.source })),
    photos,
    tags: r.tags ?? [],
    accessibilityNote: r.accessibility_note,
    extras: [],
    dataSource: r.data_source,
    source: { provider: 'thirdplace', externalId: r.id, url: null, editUrl: null, fetchedAt: null, attribution: 'THIRD PLACE', license: null },
    verificationStatus: r.verification_status,
    lastVerified: r.last_verified_at,
    createdAt: r.created_at,
    // menu_known distinguishes "no menu information" from "menu known to be empty".
    menu: items.length || r.menu_known
      ? items.map((m) => ({
          id: m.id,
          cafeId: key,
          name: m.name,
          description: m.description,
          category: m.category,
          priceInr: m.price_inr,
          photoUrl: m.photo_url,
          dietary: m.dietary,
          isBestseller: m.is_bestseller && !!m.bestseller_source,
          bestsellerSource: m.bestseller_source,
          isSignature: m.is_signature,
          popularityNote: m.popularity_note,
          source: m.source,
          lastUpdated: m.last_updated,
        }))
      : null,
  };
}

export async function fetchCuratedByKeys(keys: string[]): Promise<Cafe[]> {
  if (!supabase || !keys.length) return [];
  const { data, error } = await supabase.from('cafes').select(SELECT).in('place_key', keys.slice(0, 100)).eq('is_demo', false);
  if (error) throw new Error(error.message);
  return (data as CafeRow[]).map(mapCafeRow);
}

export async function fetchCuratedInBounds(b: Bounds): Promise<Cafe[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('cafes')
    .select(SELECT)
    .eq('is_demo', false)
    .gte('latitude', b.south)
    .lte('latitude', b.north)
    .gte('longitude', b.west)
    .lte('longitude', b.east)
    .limit(200);
  if (error) throw new Error(error.message);
  return (data as CafeRow[]).map(mapCafeRow);
}

/** Curated records with a known menu (for the Menu explorer). */
export async function fetchCuratedMenus(limit = 60): Promise<Cafe[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('cafes').select(SELECT).eq('is_demo', false).eq('menu_known', true).limit(limit);
  if (error) throw new Error(error.message);
  return (data as CafeRow[]).map(mapCafeRow);
}

export async function fetchRecentlyAdded(limit = 8): Promise<Cafe[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('cafes').select(SELECT).eq('is_demo', false).order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data as CafeRow[]).map(mapCafeRow);
}

export interface CommunitySummaryRow {
  place_key: string;
  facility: FacilityKey;
  yes_count: number;
  no_count: number;
  latest_at: string | null;
}

export async function fetchCommunitySummary(keys: string[]): Promise<CommunitySummaryRow[]> {
  if (!supabase || !keys.length) return [];
  const { data, error } = await supabase.from('community_fact_summary').select('place_key, facility, yes_count, no_count, latest_at').in('place_key', keys.slice(0, 200));
  if (error) throw new Error(error.message);
  return (data ?? []) as CommunitySummaryRow[];
}

// ── Merging ──────────────────────────────────────────────────────

const stronger = (a: VerificationStatus, b: VerificationStatus) => VERIFICATION_WEIGHT[a] >= VERIFICATION_WEIGHT[b];

/** Overlay THIRD PLACE's verified layer on a provider record. Stronger evidence wins, field by field. */
export function mergeCurated(base: Cafe, curated: Cafe | undefined): Cafe {
  if (!curated) return base;
  const facilities = new Map<FacilityKey, FacilityRecord>(base.facilities.map((f) => [f.key, f]));
  for (const f of curated.facilities) {
    const prev = facilities.get(f.key);
    if (f.available == null) {
      if (!prev) facilities.set(f.key, f);
    } else if (!prev || stronger(f.status, prev.status)) facilities.set(f.key, f);
  }
  const hoursFromCurated = curated.hours.value != null && (base.hours.value == null || stronger(curated.hours.status, base.hours.status));
  return {
    ...base,
    tagline: curated.tagline || base.tagline,
    description: curated.description || base.description,
    priceMin: curated.priceMin ?? base.priceMin,
    priceMax: curated.priceMax ?? base.priceMax,
    priceStatus: curated.priceMin != null ? curated.priceStatus : base.priceStatus,
    hours: hoursFromCurated ? curated.hours : base.hours,
    hoursParse: hoursFromCurated ? 'parsed' : base.hoursParse,
    rawOpeningHours: hoursFromCurated ? null : base.rawOpeningHours,
    atmosphere: Array.from(new Set([...base.atmosphere, ...curated.atmosphere])),
    occasions: curated.occasions.length ? curated.occasions : base.occasions,
    noise: curated.noise.value != null ? curated.noise : base.noise,
    seating: {
      indoor: curated.seating.indoor ?? base.seating.indoor,
      outdoor: curated.seating.outdoor ?? base.seating.outdoor,
      groupFriendly: curated.seating.groupFriendly ?? base.seating.groupFriendly,
      note: curated.seating.note ?? base.seating.note,
    },
    foodTypes: Array.from(new Set([...base.foodTypes, ...curated.foodTypes])),
    facilities: [...facilities.values()],
    photos: curated.photos.length ? curated.photos : base.photos,
    tags: Array.from(new Set([...base.tags, ...curated.tags])),
    accessibilityNote: curated.accessibilityNote ?? base.accessibilityNote,
    phone: base.phone ?? curated.phone,
    website: base.website ?? curated.website,
    instagram: base.instagram ?? curated.instagram,
    dataSource: `${base.dataSource} + THIRD PLACE`,
    verificationStatus: stronger(curated.verificationStatus, base.verificationStatus) ? curated.verificationStatus : base.verificationStatus,
    lastVerified: curated.lastVerified ?? base.lastVerified,
    createdAt: curated.createdAt,
    menu: curated.menu ?? base.menu,
  };
}

/** Attach unverified community report counts; fill unknown facilities as community-reported (never "confirmed"). */
export function applyCommunity(place: Cafe, rows: CommunitySummaryRow[]): Cafe {
  const mine = rows.filter((r) => r.place_key === place.id);
  if (!mine.length) return place;
  const facilities = [...place.facilities];
  for (const r of mine) {
    const community = { yes: r.yes_count, no: r.no_count, latest: r.latest_at };
    const i = facilities.findIndex((f) => f.key === r.facility);
    if (i >= 0) facilities[i] = { ...facilities[i], community };
    else
      facilities.push({
        key: r.facility,
        available: r.yes_count === r.no_count ? null : r.yes_count > r.no_count,
        status: 'community_reported',
        lastVerified: null,
        note: null,
        source: 'Community reports (unverified)',
        community,
      });
  }
  return { ...place, facilities };
}

/** True when a curated standalone record looks like the same venue as a provider record. */
export function samePlace(a: Cafe, b: Cafe): boolean {
  if (a.id === b.id) return true;
  if (a.lat == null || b.lat == null || a.lng == null || b.lng == null) return false;
  return normaliseName(a.name) === normaliseName(b.name) && distanceKm(a.lat, a.lng, b.lat, b.lng) < 0.06;
}
