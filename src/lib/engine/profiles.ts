import type { Atmosphere, FacilityKey, MenuCategory, Occasion } from '../../types';

/**
 * What each occasion usually benefits from. These are SOFT preferences:
 * they boost ranking but never make a place ineligible, and they never
 * let us claim a facility exists. Hard requirements come only from the user.
 */
export interface OccasionProfile {
  atmosphere: Atmosphere[];
  facilities: FacilityKey[];
  menuCategories: MenuCategory[];
  tags: string[];
}

export const OCCASION_PROFILES: Record<Occasion, OccasionProfile> = {
  study: { atmosphere: ['quiet', 'work_friendly'], facilities: ['wifi', 'charging', 'comfortable_seating', 'long_stay'], menuCategories: ['coffee', 'tea'], tags: ['study', 'books'] },
  work: { atmosphere: ['work_friendly', 'quiet'], facilities: ['wifi', 'charging', 'long_stay', 'ac'], menuCategories: ['coffee'], tags: ['work'] },
  date: { atmosphere: ['romantic', 'cosy', 'aesthetic'], facilities: ['comfortable_seating'], menuCategories: ['desserts', 'coffee', 'main_course'], tags: ['date'] },
  friends: { atmosphere: ['lively'], facilities: ['comfortable_seating'], menuCategories: ['snacks', 'main_course', 'cold_beverages'], tags: ['groups'] },
  birthday: { atmosphere: ['lively', 'aesthetic'], facilities: ['comfortable_seating'], menuCategories: ['desserts', 'main_course'], tags: ['celebrations', 'groups'] },
  solo: { atmosphere: ['quiet', 'cosy'], facilities: ['comfortable_seating'], menuCategories: ['coffee', 'tea', 'bakery'], tags: ['books', 'reading'] },
  coffee: { atmosphere: [], facilities: [], menuCategories: ['coffee', 'cold_beverages'], tags: ['specialty-coffee', 'coffee'] },
  dessert: { atmosphere: [], facilities: [], menuCategories: ['desserts', 'bakery'], tags: ['desserts', 'bakery'] },
  photography: { atmosphere: ['aesthetic', 'outdoor'], facilities: [], menuCategories: [], tags: ['natural-light', 'photogenic'] },
  relaxation: { atmosphere: ['quiet', 'cosy', 'outdoor'], facilities: ['comfortable_seating'], menuCategories: ['tea', 'coffee'], tags: ['slow'] },
};
