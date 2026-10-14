import type { Atmosphere, FacilityKey, Occasion } from '../types';

/**
 * Mood-based discovery categories. Each mood maps to a preset for the
 * recommendation engine, so a mood page is a real ranked, filtered
 * result set — not a decorative screen.
 */
export interface Mood {
  slug: string;
  title: string;
  kicker: string;
  blurb: string;
  occasion: Occasion | null;
  atmosphere: Atmosphere[];
  /** Soft facility preferences shown as quick toggles on the mood page. */
  suggestedFacilities: FacilityKey[];
  maxBudget: number | null;
  image: string;
  /** Which places belong to this mood (hard filter, any-of within each list). */
  match: { occasions?: Occasion[]; atmosphere?: Atmosphere[]; maxPrice?: number };
}

const img = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=900&q=70`;

export const MOODS: Mood[] = [
  { slug: 'study', title: 'Study Mode', kicker: 'Head down', blurb: 'Quiet corners, laptop-friendly tables and budgets that survive a long session.', occasion: 'study', atmosphere: ['quiet', 'work_friendly'], suggestedFacilities: ['charging', 'wifi', 'long_stay'], maxBudget: null, image: img('1521017432531-fbd92d768814'), match: { occasions: ['study'] } },
  { slug: 'date', title: 'Date Mode', kicker: 'Two chairs, one table', blurb: 'Soft light, cosy seating and menus made for sharing.', occasion: 'date', atmosphere: ['romantic', 'cosy'], suggestedFacilities: ['comfortable_seating'], maxBudget: null, image: img('1517248135467-4c7edcad34c4'), match: { occasions: ['date'] } },
  { slug: 'friends', title: 'Friends Mode', kicker: 'Pull up a chair', blurb: 'Group tables, lively rooms and food that doesn’t empty the wallet.', occasion: 'friends', atmosphere: ['lively'], suggestedFacilities: ['comfortable_seating'], maxBudget: null, image: img('1525610553991-2bede1a236e2'), match: { occasions: ['friends'] } },
  { slug: 'aesthetic', title: 'Aesthetic Mode', kicker: 'Good light', blurb: 'Photogenic interiors, natural light and beautifully plated things.', occasion: 'photography', atmosphere: ['aesthetic'], suggestedFacilities: [], maxBudget: null, image: img('1600093463592-8e36ae95ef56'), match: { atmosphere: ['aesthetic'] } },
  { slug: 'budget', title: 'Budget Mode', kicker: 'Under ₹300', blurb: 'Places that respect your spending limit without feeling like a compromise.', occasion: null, atmosphere: [], suggestedFacilities: [], maxBudget: 300, image: img('1445116572660-236099ec97a0'), match: { maxPrice: 300 } },
  { slug: 'coffee-dessert', title: 'Coffee & Dessert', kicker: 'Something sweet', blurb: 'Serious coffee, cold drinks, pastries and signature desserts.', occasion: 'dessert', atmosphere: [], suggestedFacilities: [], maxBudget: null, image: img('1551024506-0bccd828d307'), match: { occasions: ['dessert', 'coffee'] } },
  { slug: 'solo', title: 'Solo Escape', kicker: 'Table for one', blurb: 'Comfortable spaces to read, write, think or simply be alone.', occasion: 'solo', atmosphere: ['quiet', 'cosy'], suggestedFacilities: ['comfortable_seating'], maxBudget: null, image: img('1481833761820-0509d3217039'), match: { occasions: ['solo'] } },
  { slug: 'work', title: 'Work Mode', kicker: 'Inbox zero', blurb: 'Wi-Fi, charging and tables you can actually work at.', occasion: 'work', atmosphere: ['work_friendly'], suggestedFacilities: ['wifi', 'charging'], maxBudget: null, image: img('1554118811-1e0d58224f24'), match: { occasions: ['work'] } },
  { slug: 'birthday', title: 'Birthday Mode', kicker: 'Make a wish', blurb: 'Room for the group, cake on the menu and a little celebration.', occasion: 'birthday', atmosphere: ['lively'], suggestedFacilities: ['comfortable_seating'], maxBudget: null, image: img('1578985545062-69928b1d9587'), match: { occasions: ['birthday'] } },
];

export function moodBySlug(slug: string | null | undefined): Mood | undefined {
  return MOODS.find((m) => m.slug === slug);
}
