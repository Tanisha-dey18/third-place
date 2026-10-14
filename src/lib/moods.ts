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
  /**
   * Hard filter ONLY where data can support it (a known price ceiling).
   * Occasions/atmosphere are used for ranking, never to hide places,
   * because most real listings don't record ambience.
   */
  match: { occasions?: Occasion[]; atmosphere?: Atmosphere[]; maxPrice?: number };
  /** Plain-language note on how this mood is ranked with the data we have. */
  evidence: string;
}

const img = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=900&q=70`;

export const MOODS: Mood[] = [
  { slug: 'study', title: 'Study Mode', kicker: 'Head down', blurb: 'Quiet corners, laptop-friendly tables and budgets that survive a long session.', occasion: 'study', atmosphere: ['quiet', 'work_friendly'], suggestedFacilities: ['charging', 'wifi', 'long_stay'], maxBudget: null, image: img('1521017432531-fbd92d768814'), match: { occasions: ['study'] }, evidence: "Ranked by listed Wi-Fi, air conditioning and power, plus verified study details where we have them. Most places don’t list these yet; use “Must have” to see only places that do." },
  { slug: 'date', title: 'Date Mode', kicker: 'Two chairs, one table', blurb: 'Soft light, cosy seating and menus made for sharing.', occasion: 'date', atmosphere: ['romantic', 'cosy'], suggestedFacilities: ['comfortable_seating'], maxBudget: null, image: img('1517248135467-4c7edcad34c4'), match: { occasions: ['date'] }, evidence: "Few listings describe ambience, so this is ranked by verified details and your filters. Places aren’t labelled “romantic” unless someone verified it." },
  { slug: 'friends', title: 'Friends Mode', kicker: 'Pull up a chair', blurb: 'Group tables, lively rooms and food that doesn’t empty the wallet.', occasion: 'friends', atmosphere: ['lively'], suggestedFacilities: ['comfortable_seating'], maxBudget: null, image: img('1525610553991-2bede1a236e2'), match: { occasions: ['friends'] }, evidence: "Ranked by verified group-seating details where available. Listings rarely include seating information." },
  { slug: 'aesthetic', title: 'Aesthetic Mode', kicker: 'Good light', blurb: 'Photogenic interiors, natural light and beautifully plated things.', occasion: 'photography', atmosphere: ['aesthetic'], suggestedFacilities: [], maxBudget: null, image: img('1600093463592-8e36ae95ef56'), match: { atmosphere: ['aesthetic'] }, evidence: "We don’t judge looks from photos or names. Places appear higher only when ambience has been verified." },
  { slug: 'budget', title: 'Budget Mode', kicker: 'Under ₹300', blurb: 'Places that respect your spending limit without feeling like a compromise.', occasion: null, atmosphere: [], suggestedFacilities: [], maxBudget: 300, image: img('1445116572660-236099ec97a0'), match: { maxPrice: 300 }, evidence: "Shows only places with a known price per person of ₹300 or less. Most listings don’t publish prices yet, so this list may be short." },
  { slug: 'coffee-dessert', title: 'Coffee & Dessert', kicker: 'Something sweet', blurb: 'Serious coffee, cold drinks, pastries and signature desserts.', occasion: 'dessert', atmosphere: [], suggestedFacilities: [], maxBudget: null, image: img('1551024506-0bccd828d307'), match: { occasions: ['dessert', 'coffee'] }, evidence: "Ranked by what each source lists: coffee shops, cakes, desserts and ice cream." },
  { slug: 'solo', title: 'Solo Escape', kicker: 'Table for one', blurb: 'Comfortable spaces to read, write, think or simply be alone.', occasion: 'solo', atmosphere: ['quiet', 'cosy'], suggestedFacilities: ['comfortable_seating'], maxBudget: null, image: img('1481833761820-0509d3217039'), match: { occasions: ['solo'] }, evidence: "Ranked by verified quiet/cosy details where available; otherwise by distance." },
  { slug: 'work', title: 'Work Mode', kicker: 'Inbox zero', blurb: 'Wi-Fi, charging and tables you can actually work at.', occasion: 'work', atmosphere: ['work_friendly'], suggestedFacilities: ['wifi', 'charging'], maxBudget: null, image: img('1554118811-1e0d58224f24'), match: { occasions: ['work'] }, evidence: "Ranked by listed Wi-Fi, power and air conditioning. Unknown facilities are never treated as available." },
  { slug: 'birthday', title: 'Birthday Mode', kicker: 'Make a wish', blurb: 'Room for the group, cake on the menu and a little celebration.', occasion: 'birthday', atmosphere: ['lively'], suggestedFacilities: ['comfortable_seating'], maxBudget: null, image: img('1578985545062-69928b1d9587'), match: { occasions: ['birthday'] }, evidence: "Ranked by verified group-seating details where available. Call ahead to confirm bookings." },
];

export function moodBySlug(slug: string | null | undefined): Mood | undefined {
  return MOODS.find((m) => m.slug === slug);
}
