import type {
  Cafe,
  CafePhoto,
  FacilityRecord,
  MenuItem,
  OpeningHoursDay,
  VerificationStatus,
} from '@/types';
import { DEMO_CAFES } from '@/data/demoCafes';
import { config } from '@/lib/config';
import { supabase } from '@/lib/supabase';

/**
 * Read-only access to café records. The UI depends only on this
 * interface, so the bundled demo dataset and the Supabase tables are
 * interchangeable.
 */
export interface CafeRepository {
  readonly source: 'demo' | 'supabase';
  listCafes(): Promise<Cafe[]>;
}

class DemoCafeRepository implements CafeRepository {
  readonly source = 'demo' as const;
  async listCafes(): Promise<Cafe[]> {
    return DEMO_CAFES;
  }
}

// ── Supabase row shapes (snake_case, as stored) ────────────────
interface FacilityRow {
  facility: FacilityRecord['key'];
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
  cafe_id: string;
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
interface CafeRow {
  id: string;
  slug: string;
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
  created_at: string;
  cafe_facilities: FacilityRow[] | null;
  cafe_photos: PhotoRow[] | null;
  menu_items: MenuRow[] | null;
}

export function mapCafeRow(r: CafeRow): Cafe {
  const photos: CafePhoto[] = (r.cafe_photos ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => ({ url: p.url, alt: p.alt ?? r.name, credit: p.credit, isIllustrative: p.is_illustrative }));
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    isDemo: r.is_demo,
    tagline: r.tagline ?? '',
    description: r.description ?? '',
    neighbourhood: r.neighbourhood,
    address: r.address,
    lat: r.latitude == null ? null : Number(r.latitude),
    lng: r.longitude == null ? null : Number(r.longitude),
    priceMin: r.price_min,
    priceMax: r.price_max,
    priceStatus: r.price_status,
    hours: { value: r.opening_hours, status: r.hours_status, lastVerified: r.hours_last_verified_at, source: r.data_source },
    phone: r.phone,
    website: r.website,
    instagram: r.instagram,
    atmosphere: r.atmosphere ?? [],
    occasions: r.occasions ?? [],
    noise: { value: r.noise_level, status: r.noise_status, lastVerified: r.last_verified_at, source: r.data_source },
    seating: { indoor: r.seating_indoor, outdoor: r.seating_outdoor, groupFriendly: r.group_friendly, note: r.seating_note },
    foodTypes: r.food_types ?? [],
    dietary: { value: { veg: r.serves_veg, nonVeg: r.serves_non_veg }, status: r.dietary_status, lastVerified: r.last_verified_at, source: r.data_source },
    facilities: (r.cafe_facilities ?? []).map((f) => ({
      key: f.facility,
      available: f.available,
      status: f.status,
      lastVerified: f.last_verified_at,
      note: f.note,
      source: f.source,
    })),
    photos,
    tags: r.tags ?? [],
    accessibilityNote: r.accessibility_note,
    dataSource: r.data_source,
    verificationStatus: r.verification_status,
    lastVerified: r.last_verified_at,
    createdAt: r.created_at,
    menu: (r.menu_items ?? []).map((m) => ({
      id: m.id,
      cafeId: m.cafe_id,
      name: m.name,
      description: m.description,
      category: m.category,
      priceInr: m.price_inr,
      photoUrl: m.photo_url,
      dietary: m.dietary,
      // Never show a bestseller label without a recorded source.
      isBestseller: m.is_bestseller && !!m.bestseller_source,
      bestsellerSource: m.bestseller_source,
      isSignature: m.is_signature,
      popularityNote: m.popularity_note,
      source: m.source,
      lastUpdated: m.last_updated,
    })),
  };
}

class SupabaseCafeRepository implements CafeRepository {
  readonly source = 'supabase' as const;
  async listCafes(): Promise<Cafe[]> {
    if (!supabase) throw new Error('Supabase is not configured');
    const { data, error } = await supabase
      .from('cafes')
      .select('*, cafe_facilities(*), cafe_photos(*), menu_items(*)')
      .order('name')
      .limit(500);
    if (error) throw new Error(`Could not load cafés: ${error.message}`);
    return (data as CafeRow[]).map(mapCafeRow);
  }
}

export const cafeRepository: CafeRepository =
  config.cafeDataSource === 'supabase' && config.supabaseConfigured ? new SupabaseCafeRepository() : new DemoCafeRepository();
