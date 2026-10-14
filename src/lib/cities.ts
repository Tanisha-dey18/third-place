import type { Neighbourhood, Region } from '../types';

// ───────────────────────────────────────────────────────────────
// City configuration. Adding a city = adding an entry here (bounds,
// timezone, neighbourhood centres). Nothing else in the app is
// Kolkata-specific.
//
// Neighbourhood centres were checked against OpenStreetMap Nominatim
// (October 2026). Radii are deliberately approximate: they describe
// "roughly this area", not legal boundaries.
// ───────────────────────────────────────────────────────────────

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface CityConfig {
  id: string;
  name: string;
  state: string;
  country: string;
  /** IANA timezone used for opening-hours logic. */
  timezone: string;
  /** Default map view. This is NOT the user's location. */
  center: { lat: number; lng: number };
  defaultZoom: number;
  /** Area covered by the data snapshot and city-wide searches. */
  bounds: Bounds;
  /** Default radius for "anywhere in the city" queries from the centre. */
  cityRadiusKm: number;
  regions: Record<Region, { name: string; lat: number; lng: number; radiusKm: number }>;
  neighbourhoods: Neighbourhood[];
}

export const KOLKATA: CityConfig = {
  id: 'kolkata',
  name: 'Kolkata',
  state: 'West Bengal',
  country: 'IN',
  timezone: 'Asia/Kolkata',
  center: { lat: 22.5448, lng: 88.3626 },
  defaultZoom: 13,
  bounds: { south: 22.42, west: 88.24, north: 22.7, east: 88.52 },
  cityRadiusKm: 16,
  regions: {
    central: { name: 'Central Kolkata', lat: 22.556, lng: 88.354, radiusKm: 2.6 },
    north: { name: 'North Kolkata', lat: 22.592, lng: 88.37, radiusKm: 3.2 },
    south: { name: 'South Kolkata', lat: 22.512, lng: 88.356, radiusKm: 4 },
    east: { name: 'East Kolkata', lat: 22.588, lng: 88.44, radiusKm: 5 },
  },
  neighbourhoods: [
    { slug: 'park-street', name: 'Park Street', region: 'central', lat: 22.5535, lng: 88.352, radiusKm: 1.2, blurb: 'Old-world glamour, late evenings and the city’s classic café row.' },
    { slug: 'new-market', name: 'New Market', region: 'central', lat: 22.5602, lng: 88.353, radiusKm: 0.9, blurb: 'Hogg Market lanes, bakeries and errands with a coffee break.' },
    { slug: 'esplanade', name: 'Esplanade', region: 'central', lat: 22.5645, lng: 88.351, radiusKm: 1, blurb: 'Trams, tea stalls and quick pit-stops in the heart of the city.' },
    { slug: 'camac-street', name: 'Camac Street', region: 'central', lat: 22.5433, lng: 88.3521, radiusKm: 0.8, blurb: 'Offices by day, coffee meetings in between.' },
    { slug: 'college-street', name: 'College Street', region: 'north', lat: 22.5735, lng: 88.3625, radiusKm: 1, blurb: 'Boi Para: secondhand books, students and long conversations.' },
    { slug: 'shyambazar', name: 'Shyambazar', region: 'north', lat: 22.6013, lng: 88.3725, radiusKm: 1.2, blurb: 'Old North Kolkata, five-point crossings and sweet shops.' },
    { slug: 'salt-lake', name: 'Salt Lake', region: 'east', lat: 22.585, lng: 88.415, radiusKm: 2.5, blurb: 'Planned sectors, wide avenues and neighbourhood cafés.' },
    { slug: 'sector-v', name: 'Sector V', region: 'east', lat: 22.5755, lng: 88.4323, radiusKm: 1.2, blurb: 'IT offices and work-day coffee.' },
    { slug: 'new-town', name: 'New Town', region: 'east', lat: 22.585, lng: 88.475, radiusKm: 3, blurb: 'New builds, Eco Park and roomy spaces for groups.' },
    { slug: 'lake-town', name: 'Lake Town', region: 'east', lat: 22.6057, lng: 88.403, radiusKm: 1.5, blurb: 'Residential calm near the northern lakes.' },
    { slug: 'ballygunge', name: 'Ballygunge', region: 'south', lat: 22.528, lng: 88.3659, radiusKm: 1.3, blurb: 'Leafy lanes, old bungalows and unhurried afternoons.' },
    { slug: 'gariahat', name: 'Gariahat', region: 'south', lat: 22.518, lng: 88.367, radiusKm: 0.9, blurb: 'Market bustle by day, rooftops and sweets by evening.' },
    { slug: 'hindustan-park', name: 'Hindustan Park', region: 'south', lat: 22.5177, lng: 88.3633, radiusKm: 0.6, blurb: 'Quiet residential lanes just off Gariahat.' },
    { slug: 'southern-avenue', name: 'Southern Avenue', region: 'south', lat: 22.514, lng: 88.355, radiusKm: 0.9, blurb: 'Near the Lakes: morning walks and slow breakfasts.' },
    { slug: 'bhowanipore', name: 'Bhowanipore', region: 'south', lat: 22.5326, lng: 88.3454, radiusKm: 1.2, blurb: 'Busy, old and full of places to eat.' },
    { slug: 'alipore', name: 'Alipore', region: 'south', lat: 22.53, lng: 88.331, radiusKm: 1.3, blurb: 'Green, quiet and a little grand.' },
    { slug: 'tollygunge', name: 'Tollygunge', region: 'south', lat: 22.4986, lng: 88.3454, radiusKm: 1.5, blurb: 'Film studios, metro stops and neighbourhood hangouts.' },
    { slug: 'jadavpur', name: 'Jadavpur', region: 'south', lat: 22.4955, lng: 88.3709, radiusKm: 1.5, blurb: 'University energy and pocket-friendly hangouts.' },
    { slug: 'behala', name: 'Behala', region: 'south', lat: 22.5016, lng: 88.3209, radiusKm: 2, blurb: 'Sprawling, local and easy-going.' },
  ],
};

export const CITIES: Record<string, CityConfig> = { kolkata: KOLKATA };
export const DEFAULT_CITY = KOLKATA;

export function getCity(id: string | null | undefined): CityConfig {
  return (id && CITIES[id]) || DEFAULT_CITY;
}

export function withinBounds(lat: number, lng: number, b: Bounds): boolean {
  return lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
}
