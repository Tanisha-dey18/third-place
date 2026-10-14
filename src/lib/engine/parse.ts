import type { Atmosphere, FacilityKey, Occasion, Region } from '../../types';
import { ATMOSPHERE_LABELS, FACILITY_LABELS, OCCASION_LABELS, NEIGHBOURHOODS, REGION_LABELS } from '../taxonomy';
import { EMPTY_PREFERENCES, type Preferences } from './types';
import { zonedDayTime } from '../time';
import { DEFAULT_CITY } from '../cities';

// ───────────────────────────────────────────────────────────────
// Deterministic natural-language → Preferences extraction.
// Pure keyword/regex rules: no network, no model, fully predictable.
// The optional LLM path produces the same Preferences shape and is
// validated against the same vocabularies.
// ───────────────────────────────────────────────────────────────

export interface Understood {
  kind: 'occasion' | 'budget' | 'location' | 'atmosphere' | 'facility' | 'distance' | 'food' | 'duration' | 'time' | 'rating' | 'keyword';
  label: string;
}

export interface ParseResult {
  prefs: Preferences;
  understood: Understood[];
  /** The text mentions "near me" etc. — the UI should offer to use location. */
  wantsNearby: boolean;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, a: 1, an: 1, couple: 2, few: 3,
};

const OCCASION_RULES: [Occasion, RegExp][] = [
  ['study', /\b(study|studying|studies|exams?|revis(e|ion|ing)|homework|assignments?|prep)\b/],
  ['work', /\b(work|working|meetings?|remote|wfh|deadline|clients?|zoom calls?)\b/],
  ['date', /\b(date|dates|girlfriend|boyfriend|partner|anniversary|bae|romantic evening)\b/],
  ['birthday', /\b(birthday|bday|celebrat(e|ion|ing)|party)\b/],
  ['friends', /\b(friends|gang|group|buddies|squad|hang ?out|catch up)\b/],
  ['solo', /\b(alone|solo|by myself|me time|reading|read a book|journal(ing)?)\b/],
  ['photography', /\b(photos?|photography|pictures|pics|shoot|instagram(mable)?|reels?)\b/],
  ['dessert', /\b(desserts?|cakes?|pastr(y|ies)|sweets?|brownies?|cheesecakes?|waffles?|ice ?cream|gelato)\b/],
  ['coffee', /\b(coffee|espresso|latte|cappuccino|pour ?over|cold brew|flat white|americano)\b/],
  ['relaxation', /\b(relax(ing)?|chill|unwind|slow afternoon|calm afternoon|breather)\b/],
];

const ATMOSPHERE_RULES: [Atmosphere, RegExp][] = [
  ['quiet', /\b(quiet|peaceful|calm|silent|serene|not (too )?noisy|noise[- ]free)\b/],
  ['cosy', /\b(cosy|cozy|snug|warm and|homely)\b/],
  ['romantic', /\b(romantic|intimate|candle ?lit|date night)\b/],
  ['lively', /\b(lively|buzzing|vibrant|energetic|live music|happening)\b/],
  ['aesthetic', /\b(aesthetic|pretty|beautiful|photogenic|gorgeous|instagrammable|cute interiors?)\b/],
  ['outdoor', /\b(outdoors?|open[- ]air|garden|rooftop|terrace|al fresco|alfresco)\b/],
  ['work_friendly', /\b(laptop[- ]friendly|work[- ]friendly|workspace|co-?working|laptop)\b/],
];

const FACILITY_RULES: [FacilityKey, RegExp][] = [
  ['charging', /\b(charg(e|ing|er)|plugs?|sockets?|power (outlets?|points?|sockets?))\b/],
  ['wifi', /\b(wi-?fi|wi fi|internet)\b/],
  ['ac', /\b(a\/?c|air[- ]?condition(ed|ing)?|aircon)\b/],
  ['comfortable_seating', /\b(comfortable|comfy) (seat(s|ing)?|chairs?|sofas?|couch(es)?)\b|\bsofas?\b|\bcouch(es)?\b/],
  ['outdoor_seating', /\b(outdoor seating|sit outside|seating outside)\b/],
  ['long_stay', /\b(long stay|sit for long|all day|for hours|linger)\b/],
  ['veg_options', /\b(veg|vegetarian|pure veg|vegan)\b/],
  ['parking', /\b(parking|car park|park (my|the) car)\b/],
];

const NEIGHBOURHOOD_ALIASES: Record<string, RegExp> = {
  'park-street': /\b(park st(reet)?|mother teresa sarani)\b/,
  'new-market': /\b(new market|hogg market|lindsay st(reet)?)\b/,
  esplanade: /\b(esplanade|dharmatala|chandni chowk)\b/,
  'camac-street': /\b(camac st(reet)?|shakespeare sarani)\b/,
  'college-street': /\b(college st(reet)?|boi ?para|book para)\b/,
  shyambazar: /\b(shyambazar|shyam bazar)\b/,
  'sector-v': /\b(sector (v|5|five)|salt ?lake sector v)\b/,
  'salt-lake': /\b(salt ?lake|bidhannagar)\b/,
  'new-town': /\b(new ?town|rajarhat|eco ?park)\b/,
  'lake-town': /\b(lake ?town)\b/,
  'hindustan-park': /\b(hindustan park)\b/,
  ballygunge: /\b(ballygunge|ballygunj)\b/,
  gariahat: /\b(gariahat)\b/,
  'southern-avenue': /\b(southern avenue|southern ave|rabindra sarobar|the lakes?)\b/,
  bhowanipore: /\b(bhowanipore|bhawanipur|bhowanipur)\b/,
  alipore: /\b(alipore|alipur)\b/,
  tollygunge: /\b(tollygunge|tolly)\b/,
  jadavpur: /\b(jadavpur|jadavpore)\b/,
  behala: /\b(behala)\b/,
};

const REGION_RULES: [Region, RegExp][] = [
  ['south', /\bsouth (kolkata|calcutta|kol)\b/],
  ['north', /\bnorth (kolkata|calcutta|kol)\b/],
  ['central', /\bcentral (kolkata|calcutta|kol)\b/],
  ['east', /\beast (kolkata|calcutta|kol)\b/],
];

const FOOD_WORDS = [
  'pasta', 'pizza', 'sandwich', 'sandwiches', 'burger', 'burgers', 'momo', 'momos', 'waffle', 'waffles', 'pancake', 'pancakes',
  'croissant', 'croissants', 'cheesecake', 'brownie', 'breakfast', 'brunch', 'continental', 'bengali', 'italian', 'bakery',
  'matcha', 'chai', 'tea', 'cold coffee', 'shakes', 'smoothie', 'smoothies', 'salad', 'salads', 'mishti', 'sourdough',
];

const STOPWORDS = new Set(
  ('find me a an the some please suggest show want need looking for place places cafe cafes café cafés spot spots where can i ' +
    'to in at on with and or of that has have good nice best great kolkata calcutta near around somewhere which is are be my me ' +
    'less than under below rs inr rupees per person spend hours hour friendly also really very quite something any like would ' +
    'go get sit stay just some few couple').split(/\s+/),
);

const ALL_RULES: RegExp[] = [
  ...OCCASION_RULES.map((r) => r[1]),
  ...ATMOSPHERE_RULES.map((r) => r[1]),
  ...FACILITY_RULES.map((r) => r[1]),
  ...Object.values(NEIGHBOURHOOD_ALIASES),
  /\b(cheap|affordable|budget|nearby|late|night|open|rated|street|south|north|east|central|kilometres?|kms?|three|hours?)\b/,
];

function toNumber(token: string): number | null {
  if (/^\d+(\.\d+)?$/.test(token)) return Number(token);
  return NUMBER_WORDS[token] ?? null;
}

export function parseQuery(raw: string, now: Date = new Date()): ParseResult {
  const text = ` ${raw.toLowerCase().replace(/[“”"’]/g, ' ').replace(/\s+/g, ' ')} `;
  const prefs: Preferences = { ...EMPTY_PREFERENCES, atmosphere: [], requiredFacilities: [], preferredFacilities: [], keywords: [] };
  const understood: Understood[] = [];

  // Occasion: first matching rule wins (rules are ordered by specificity).
  for (const [occ, re] of OCCASION_RULES) {
    if (re.test(text)) {
      prefs.occasion = occ;
      understood.push({ kind: 'occasion', label: OCCASION_LABELS[occ] });
      break;
    }
  }

  // Budget
  const budgetMatch =
    text.match(/(?:under|below|less than|within|upto|up to|max(?:imum)?|not more than|no more than|<)\s*(?:₹|rs\.?|inr)?\s*(\d{2,5})/) ??
    text.match(/(?:₹|rs\.?\s?|inr\s?)(\d{2,5})/) ??
    text.match(/(\d{2,5})\s*(?:₹|rs\b|rupees|inr|bucks)/);
  if (budgetMatch) {
    const n = Number(budgetMatch[1]);
    if (n >= 50 && n <= 10000) {
      prefs.maxBudget = n;
      understood.push({ kind: 'budget', label: `Under ₹${n}` });
    }
  } else if (/\b(cheap|affordable|budget|pocket[- ]friendly|inexpensive|low[- ]cost|student budget)\b/.test(text)) {
    prefs.maxBudget = 300;
    understood.push({ kind: 'budget', label: 'Affordable (under ₹300)' });
  }

  // Location: specific neighbourhood beats region.
  for (const slug of Object.keys(NEIGHBOURHOOD_ALIASES)) {
    const n = NEIGHBOURHOODS.find((x) => x.slug === slug);
    const re = NEIGHBOURHOOD_ALIASES[slug];
    if (!n) continue;
    if (re && re.test(text)) {
      prefs.location = { mode: 'neighbourhood', slug: n.slug };
      understood.push({ kind: 'location', label: n.name });
      break;
    }
  }
  if (prefs.location.mode === 'anywhere') {
    for (const [region, re] of REGION_RULES) {
      if (re.test(text)) {
        prefs.location = { mode: 'region', region };
        understood.push({ kind: 'location', label: REGION_LABELS[region] });
        break;
      }
    }
  }
  const wantsNearby = /\b(near me|nearby|close to me|around me|walking distance)\b/.test(text);

  // Distance
  const dm = text.match(/within\s+(\d+(?:\.\d+)?)\s*(?:km|kms|kilomet)/);
  if (dm) {
    prefs.maxDistanceKm = Number(dm[1]);
    understood.push({ kind: 'distance', label: `Within ${dm[1]} km` });
  }

  // Atmosphere
  for (const [a, re] of ATMOSPHERE_RULES) {
    if (re.test(text)) {
      prefs.atmosphere.push(a);
      understood.push({ kind: 'atmosphere', label: ATMOSPHERE_LABELS[a] });
    }
  }

  // Facilities (only when explicitly mentioned — never inferred from "laptop-friendly").
  // Stated needs ("need", "must", "charge my laptop") are strict; otherwise they're nice-to-haves.
  const strict = /\b(must|need|needs|needed|require[sd]?|essential|have to|has to|should have|charge my|charging my|definitely)\b/.test(text);
  const soft = /\b(ideally|preferably|if possible|nice to have|bonus|maybe)\b/.test(text);
  for (const [f, re] of FACILITY_RULES) {
    if (re.test(text)) {
      if (strict && !soft) prefs.requiredFacilities.push(f);
      else prefs.preferredFacilities.push(f);
      understood.push({ kind: 'facility', label: `${FACILITY_LABELS[f]} (${strict && !soft ? 'must-have' : 'nice-to-have'})` });
    }
  }
  if (/\b(outdoor seating|sit outside)\b/.test(text)) prefs.seating = 'outdoor';

  // Duration ("for three hours", "2 hrs")
  const dur = text.match(/\b(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|a|an|couple|few)\s*(?:of\s+)?(?:hours?|hrs?)\b/);
  if (dur) {
    const h = toNumber(dur[1]);
    if (h != null) {
      prefs.durationHours = h;
      understood.push({ kind: 'duration', label: `${h} hour${h === 1 ? '' : 's'}` });
      if (h >= 2 && !prefs.requiredFacilities.includes('long_stay') && !prefs.preferredFacilities.includes('long_stay')) {
        prefs.preferredFacilities.push('long_stay');
        understood.push({ kind: 'facility', label: `${FACILITY_LABELS.long_stay} (nice-to-have)` });
      }
    }
  }

  // Opening time ("open at 9pm", "open till 11 pm", "open late")
  const tm = text.match(/\bopen\s+(?:at|till|until|after|by|past)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (tm) {
    let h = Number(tm[1]);
    const m = tm[2] ? Number(tm[2]) : 0;
    if (tm[3] === 'pm' && h < 12) h += 12;
    if (tm[3] === 'am' && h === 12) h = 0;
    if (h <= 23) {
      const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      prefs.openAt = { day: zonedDayTime(DEFAULT_CITY.timezone, now).day, time };
      understood.push({ kind: 'time', label: `Open at ${time}` });
    }
  } else if (/\b(open now|open right now|currently open|still open)\b/.test(text)) {
    // "Now" in the city's timezone, not the device's.
    prefs.openAt = zonedDayTime(DEFAULT_CITY.timezone, now);
    understood.push({ kind: 'time', label: `Open now (${prefs.openAt.time}, ${DEFAULT_CITY.name} time)` });
  } else if (/\b(open late|late night|late-night)\b/.test(text)) {
    prefs.openAt = { day: zonedDayTime(DEFAULT_CITY.timezone, now).day, time: '22:00' };
    understood.push({ kind: 'time', label: 'Open at 22:00' });
  }

  // Rating
  const rm = text.match(/\b([1-5](?:\.\d)?)\s*(?:\+|stars?|and above)/);
  if (rm) {
    prefs.minRating = Number(rm[1]);
    understood.push({ kind: 'rating', label: `Rated ${rm[1]}+` });
  } else if (/\b(highly rated|top rated|well rated)\b/.test(text)) {
    prefs.minRating = 4;
    understood.push({ kind: 'rating', label: 'Rated 4+' });
  }

  // Food
  for (const f of FOOD_WORDS) {
    if (new RegExp(`\\b${f}\\b`).test(text)) {
      prefs.foodType = f.replace(/s$/, '');
      understood.push({ kind: 'food', label: prefs.foodType });
      break;
    }
  }

  // Leftover keywords for soft relevance boosting.
  const consumed = new Set(understood.map((u) => u.label.toLowerCase()));
  const words = text
    .replace(/[^a-z\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w) && !consumed.has(w) && !(w in NUMBER_WORDS))
    .filter((w) => !ALL_RULES.some((re) => re.test(` ${w} `)));
  prefs.keywords = Array.from(new Set(words)).slice(0, 6);

  return { prefs, understood, wantsNearby };
}
