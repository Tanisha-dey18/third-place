import type { Cafe, FacilityKey, FacilityRecord, PlaceCategory } from '../../types';
import { getCity, withinBounds } from '../cities';
import { nearestNeighbourhood } from '../taxonomy';
import { osmKey, slugFromKey, type OsmType } from './keys';
import { parseOpeningHours } from './openingHours';

// ───────────────────────────────────────────────────────────────
// OpenStreetMap element → Cafe.
// Rules:
//  • Only facts present in the element's tags are used. Nothing is
//    inferred from names, photos, neighbourhoods or "vibes".
//  • Everything from OSM is `source_provided` — never "verified".
//  • Elements without a usable name or valid coordinates are skipped
//    (and counted) rather than shown with invented values.
//  • URLs and phone numbers are sanitised before they can reach an href.
// ───────────────────────────────────────────────────────────────

export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';
export const OSM_LICENSE = 'ODbL 1.0';

export interface OsmElement {
  type: OsmType;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export type SkipReason = 'no_name' | 'invalid_coordinates' | 'outside_city' | 'not_a_place';

export type NormalizeResult = { ok: true; place: Cafe } | { ok: false; reason: SkipReason };

const MAX_TAG = 255;

function clean(v: string | undefined): string | null {
  if (v == null) return null;
  const t = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, MAX_TAG) : null;
}

/** Only http(s) URLs survive; everything else (javascript:, data:, junk) is dropped. */
export function safeUrl(v: string | undefined): string | null {
  const t = clean(v);
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(t) ? `https://${t}` : null;
  if (!withScheme) return null;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Keep the first phone number, digits/+/spaces/hyphens only. */
export function safePhone(v: string | undefined): string | null {
  const first = clean(v)?.split(/[;,/]/)[0]?.trim();
  if (!first) return null;
  const normalised = first.replace(/[^\d+\s-]/g, '').replace(/\s+/g, ' ').trim();
  const digits = normalised.replace(/\D/g, '');
  return digits.length >= 6 && digits.length <= 15 ? normalised : null;
}

function safeInstagram(v: string | undefined): string | null {
  const t = clean(v);
  if (!t) return null;
  const m = t.match(/^(?:https?:\/\/(?:www\.)?instagram\.com\/)?@?([A-Za-z0-9._]{1,30})\/?$/);
  return m ? `@${m[1]}` : null;
}

function yesNo(v: string | undefined): boolean | null {
  const t = v?.toLowerCase().trim();
  if (!t) return null;
  if (['yes', 'true', 'only', 'designated'].includes(t)) return true;
  if (['no', 'false', 'none'].includes(t)) return false;
  return null;
}

function validCoordinate(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

function isoDate(v: string | undefined): string | null {
  const t = clean(v);
  if (!t || !/^\d{4}-\d{2}(-\d{2})?$/.test(t)) return null;
  const d = new Date(t.length === 7 ? `${t}-01` : t);
  return Number.isNaN(d.getTime()) ? null : t;
}

function category(tags: Record<string, string>): PlaceCategory | null {
  if (tags.amenity === 'cafe') return 'cafe';
  if (tags.amenity === 'ice_cream') return 'ice_cream';
  if (tags.amenity === 'restaurant' && /(^|;)\s*coffee_shop\s*(;|$)/.test(tags.cuisine ?? '')) return 'coffee_shop_restaurant';
  return null;
}

function address(tags: Record<string, string>): string | null {
  const line1 = [clean(tags['addr:housenumber']), clean(tags['addr:street'])].filter(Boolean).join(' ');
  const parts = [
    clean(tags['addr:full']) ?? (line1 || clean(tags['addr:place'])),
    clean(tags['addr:suburb']) ?? clean(tags['addr:district']),
    clean(tags['addr:city']),
    clean(tags['addr:postcode']),
  ].filter((p): p is string => !!p);
  const unique = parts.filter((p, i) => parts.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i);
  return unique.length ? unique.join(', ') : null;
}

const CUISINE_LABELS: Record<string, string> = {
  coffee_shop: 'Coffee',
  cake: 'Cakes',
  dessert: 'Desserts',
  ice_cream: 'Ice cream',
  tea: 'Tea',
  bubble_tea: 'Bubble tea',
  sandwich: 'Sandwiches',
  pizza: 'Pizza',
  burger: 'Burgers',
  italian: 'Italian',
  indian: 'Indian',
  bengali: 'Bengali',
  chinese: 'Chinese',
  continental: 'Continental',
  breakfast: 'Breakfast',
  bakery: 'Bakery',
  pastry: 'Pastries',
  juice: 'Juice',
  regional: 'Regional',
};

function cuisines(tags: Record<string, string>): string[] {
  const raw = clean(tags.cuisine);
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(';')
        .map((c) => c.trim().toLowerCase())
        .filter((c) => /^[a-z_]{2,30}$/.test(c))
        .map((c) => CUISINE_LABELS[c] ?? c.replace(/_/g, ' ').replace(/^\w/, (x) => x.toUpperCase())),
    ),
  ).slice(0, 8);
}

function facility(key: FacilityKey, available: boolean | null, checkedAt: string | null, note?: string | null): FacilityRecord | null {
  if (available == null) return null;
  return { key, available, status: 'source_provided', lastVerified: null, sourceCheckedAt: checkedAt, note: note ?? null, source: 'OpenStreetMap' };
}

export function normalizeOsmElement(el: OsmElement, opts: { cityId: string; fetchedAt: string }): NormalizeResult {
  const tags = el.tags ?? {};
  const cat = category(tags);
  if (!cat) return { ok: false, reason: 'not_a_place' };
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (!validCoordinate(lat, lng)) return { ok: false, reason: 'invalid_coordinates' };
  const city = getCity(opts.cityId);
  // A small margin keeps places right on the edge of the snapshot.
  const pad = 0.02;
  if (!withinBounds(lat, lng as number, { south: city.bounds.south - pad, west: city.bounds.west - pad, north: city.bounds.north + pad, east: city.bounds.east + pad })) {
    return { ok: false, reason: 'outside_city' };
  }
  const name = clean(tags.name) ?? clean(tags['name:en']) ?? clean(tags.brand);
  if (!name) return { ok: false, reason: 'no_name' };

  const key = osmKey(el.type, el.id);
  const checkedAt = isoDate(tags.check_date) ?? isoDate(tags['survey:date']);
  const hours = parseOpeningHours(tags.opening_hours);
  const wifiTag = tags.internet_access?.toLowerCase();
  const wifi = wifiTag ? (['wlan', 'yes', 'wifi'].includes(wifiTag) ? true : wifiTag === 'no' ? false : null) : null;
  const wifiFee = yesNo(tags['internet_access:fee']);
  const wheelchair = tags.wheelchair?.toLowerCase();
  const veg = yesNo(tags['diet:vegetarian']);
  const vegan = yesNo(tags['diet:vegan']);
  const nonVeg = yesNo(tags['diet:meat']) ?? yesNo(tags['diet:non-vegetarian']);
  const indoor = yesNo(tags.indoor_seating);
  const outdoor = yesNo(tags.outdoor_seating);
  const ac = yesNo(tags.air_conditioning);
  const power = yesNo(tags.power_supply);

  const facilities = [
    facility('wifi', wifi, checkedAt, wifi && wifiFee != null ? (wifiFee ? 'Source says Wi-Fi is paid.' : 'Source says Wi-Fi is free.') : null),
    facility('ac', ac, checkedAt),
    facility('outdoor_seating', outdoor, checkedAt),
    facility('charging', power, checkedAt, power ? 'Source lists power supply for customers.' : null),
    facility('veg_options', veg === true || vegan === true ? true : veg, checkedAt, tags['diet:vegetarian'] === 'only' ? 'Source says vegetarian only.' : null),
    facility(
      'wheelchair_access',
      wheelchair === 'yes' || wheelchair === 'designated' ? true : wheelchair === 'no' ? false : wheelchair === 'limited' ? true : null,
      checkedAt,
      wheelchair === 'limited' ? 'Source says access is limited.' : null,
    ),
  ].filter((f): f is FacilityRecord => !!f);

  const extras: { label: string; value: string }[] = [];
  const addExtra = (label: string, v: string | undefined) => {
    const t = clean(v);
    if (t && t.length <= 60) extras.push({ label, value: t.replace(/_/g, ' ') });
  };
  addExtra('Takeaway', tags.takeaway);
  addExtra('Delivery', tags.delivery);
  addExtra('Smoking', tags.smoking);
  addExtra('Brand', tags.brand);
  addExtra('Operator', tags.operator !== tags.brand ? tags.operator : undefined);
  addExtra('Floor', tags.level);
  if (tags.capacity && /^\d{1,4}$/.test(tags.capacity)) addExtra('Seats (as listed)', tags.capacity);

  const nb = nearestNeighbourhood(lat, lng as number);
  const sourceUrl = `https://www.openstreetmap.org/${el.type}/${el.id}`;

  const place: Cafe = {
    id: key,
    slug: slugFromKey(key),
    name,
    isDemo: false,
    city: city.id,
    category: cat,
    tagline: '',
    description: clean(tags.description) ?? '',
    neighbourhood: nb?.slug ?? null,
    address: address(tags),
    lat,
    lng: lng as number,
    priceMin: null,
    priceMax: null,
    priceStatus: 'unknown',
    hours: {
      value: hours.status === 'parsed' ? hours.schedule : null,
      status: hours.status === 'missing' ? 'unknown' : 'source_provided',
      lastVerified: null,
      source: 'OpenStreetMap',
    },
    rawOpeningHours: hours.raw,
    hoursParse: hours.status,
    hoursNote: hours.note,
    phone: safePhone(tags['contact:phone'] ?? tags.phone),
    website: safeUrl(tags['contact:website'] ?? tags.website),
    instagram: safeInstagram(tags['contact:instagram']),
    atmosphere: outdoor === true ? ['outdoor'] : [],
    occasions: [],
    noise: { value: null, status: 'unknown', lastVerified: null },
    seating: { indoor, outdoor, groupFriendly: null, note: null },
    foodTypes: cuisines(tags),
    dietary: {
      value: { veg: veg === true || vegan === true ? true : veg, nonVeg },
      status: veg != null || nonVeg != null ? 'source_provided' : 'unknown',
      lastVerified: null,
      source: 'OpenStreetMap',
    },
    facilities,
    photos: [],
    tags: [],
    accessibilityNote: wheelchair === 'limited' ? 'Wheelchair access listed as limited at the source.' : null,
    extras,
    dataSource: 'OpenStreetMap',
    source: {
      provider: 'openstreetmap',
      externalId: `${el.type}/${el.id}`,
      url: sourceUrl,
      editUrl: `https://www.openstreetmap.org/edit?${el.type}=${el.id}`,
      fetchedAt: opts.fetchedAt,
      attribution: OSM_ATTRIBUTION,
      license: OSM_LICENSE,
    },
    verificationStatus: 'source_provided',
    lastVerified: null,
    createdAt: null,
    menu: null,
  };
  return { ok: true, place };
}

export interface NormalizeSummary {
  places: Cafe[];
  skipped: Record<SkipReason, number>;
  duplicatesRemoved: number;
}

export function normalizeOsmElements(elements: unknown, opts: { cityId: string; fetchedAt: string }): NormalizeSummary {
  const skipped: Record<SkipReason, number> = { no_name: 0, invalid_coordinates: 0, outside_city: 0, not_a_place: 0 };
  const list: Cafe[] = [];
  if (!Array.isArray(elements)) return { places: [], skipped, duplicatesRemoved: 0 };
  for (const raw of elements) {
    if (!raw || typeof raw !== 'object') continue;
    const el = raw as OsmElement;
    if (!['node', 'way', 'relation'].includes(el.type) || !Number.isSafeInteger(el.id) || el.id <= 0) {
      skipped.not_a_place++;
      continue;
    }
    const r = normalizeOsmElement(el, opts);
    if (r.ok) list.push(r.place);
    else skipped[r.reason]++;
  }
  const deduped = dedupePlaces(list);
  return { places: deduped, skipped, duplicatesRemoved: list.length - deduped.length };
}

// ── Deduplication ────────────────────────────────────────────────

export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\b(the|cafe|café|coffee|house|kolkata)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function richness(c: Cafe): number {
  return c.facilities.length + (c.address ? 2 : 0) + (c.rawOpeningHours ? 2 : 0) + (c.phone ? 1 : 0) + (c.website ? 1 : 0) + c.foodTypes.length;
}

const haversineM = (a: Cafe, b: Cafe) => {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat! - a.lat!);
  const dLng = toRad(b.lng! - a.lng!);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat!)) * Math.cos(toRad(b.lat!)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/**
 * Removes duplicates: identical keys first, then the same venue mapped twice
 * (e.g. a node AND a building outline) — same normalised name within 60 m.
 * Different branches of a chain far apart are kept.
 */
export function dedupePlaces(places: Cafe[], maxDistanceM = 60): Cafe[] {
  const byKey = new Map<string, Cafe>();
  for (const p of places) {
    const prev = byKey.get(p.id);
    if (!prev || richness(p) > richness(prev)) byKey.set(p.id, p);
  }
  const out: Cafe[] = [];
  for (const p of [...byKey.values()].sort((a, b) => richness(b) - richness(a))) {
    const key = (c: Cafe) => normaliseName(c.name) || c.name.toLowerCase().trim();
    const n = key(p);
    const dup = out.some((q) => q.lat != null && p.lat != null && key(q) === n && haversineM(p, q) <= maxDistanceM);
    if (!dup) out.push(p);
  }
  return out;
}
