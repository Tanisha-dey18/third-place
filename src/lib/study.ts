import type { Cafe, FacilityKey, VerificationStatus } from '../types';

export interface StudyFactor {
  key: FacilityKey | 'quiet';
  label: string;
  state: 'yes' | 'no' | 'unknown';
  status: VerificationStatus;
  lastVerified: string | null;
  note?: string | null;
}

export interface StudySummary {
  verdict: 'strong' | 'workable' | 'not_ideal' | 'unclear';
  headline: string;
  factors: StudyFactor[];
  lastVerified: string | null;
}

const CORE: { key: FacilityKey; label: string }[] = [
  { key: 'wifi', label: 'Wi-Fi' },
  { key: 'charging', label: 'Charging points' },
  { key: 'comfortable_seating', label: 'Comfortable tables & seating' },
  { key: 'long_stay', label: 'OK to stay long' },
  { key: 'ac', label: 'Air conditioning' },
];

/**
 * Transparent study-suitability summary. Every factor shows its own
 * evidence; unknown is never treated as yes, and "laptop-friendly"
 * never implies Wi-Fi or charging.
 */
export function studySummary(cafe: Cafe): StudySummary {
  const factors: StudyFactor[] = CORE.map(({ key, label }) => {
    const f = cafe.facilities.find((x) => x.key === key);
    return {
      key,
      label,
      state: f?.available === true ? 'yes' : f?.available === false ? 'no' : 'unknown',
      status: f?.status ?? 'unknown',
      lastVerified: f?.lastVerified ?? null,
      note: f?.note,
    };
  });
  const noise = cafe.noise.value;
  factors.splice(2, 0, {
    key: 'quiet',
    label: 'Quiet enough to focus',
    state: noise === 'quiet' ? 'yes' : noise === 'lively' ? 'no' : noise === 'moderate' ? 'no' : 'unknown',
    status: cafe.noise.status,
    lastVerified: cafe.noise.lastVerified,
    note: noise === 'moderate' ? 'Moderate chatter reported — fine for some, not for deep focus.' : null,
  });

  const essential = factors.filter((f) => ['wifi', 'charging', 'quiet', 'long_stay', 'comfortable_seating'].includes(f.key));
  const yes = essential.filter((f) => f.state === 'yes').length;
  const no = essential.filter((f) => f.state === 'no').length;
  const unknown = essential.filter((f) => f.state === 'unknown').length;
  const longStayNo = factors.find((f) => f.key === 'long_stay')?.state === 'no';

  let verdict: StudySummary['verdict'];
  let headline: string;
  if (longStayNo || noise === 'lively') {
    verdict = 'not_ideal';
    headline = longStayNo ? 'Not suited to long study sessions' : 'Too lively for focused study';
  } else if (yes >= 4 && no === 0) {
    verdict = 'strong';
    headline = 'Strong study spot';
  } else if (unknown >= 3) {
    verdict = 'unclear';
    headline = 'Not enough verified information yet';
  } else if (yes >= 2 && no <= 1) {
    verdict = 'workable';
    headline = 'Workable for studying, with caveats';
  } else {
    verdict = 'not_ideal';
    headline = 'Not ideal for studying';
  }
  const dates = factors.map((f) => f.lastVerified).filter((d): d is string => !!d).sort();
  return { verdict, headline, factors, lastVerified: dates[dates.length - 1] ?? null };
}
