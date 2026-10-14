import type { OpeningHoursDay } from '../../types';

// ───────────────────────────────────────────────────────────────
// Conservative interpreter for the OpenStreetMap `opening_hours` tag.
//
// Supported: "24/7"; weekday lists/ranges (incl. wrap-around "Sa-Mo");
// rules separated by ";" where later rules replace earlier ones for the
// days they mention; several time ranges per rule ("08:00-12:00,14:00-22:00");
// single-digit hours ("12:00-4:00"); overnight ranges; "24:00";
// "off"/"closed". A rule for public holidays ("PH ...") is skipped and
// noted, because we don't know the holiday calendar.
//
// Anything else (months, week numbers, sunrise/sunset, "+", comments,
// "||" fallback rules…) makes the whole value "unsupported": we then show
// the raw text and NEVER claim the place is open or closed.
// ───────────────────────────────────────────────────────────────

export type HoursParseStatus = 'parsed' | 'unsupported' | 'missing';

export interface ParsedHours {
  status: HoursParseStatus;
  schedule: OpeningHoursDay[] | null;
  raw: string | null;
  note: string | null;
}

const DAY_INDEX: Record<string, number> = { su: 0, mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6 };
const DAY_TOKEN = /^(mo|tu|we|th|fr|sa|su)$/;
const TIME_RANGE = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/;

const unsupported = (raw: string, note = 'This schedule uses a format we can’t interpret safely.'): ParsedHours => ({
  status: 'unsupported',
  schedule: null,
  raw,
  note,
});

function parseDays(selector: string): number[] | null {
  const days = new Set<number>();
  for (const part of selector.split(',')) {
    const p = part.trim().toLowerCase();
    if (!p) return null;
    const range = p.split('-');
    if (range.length === 1) {
      if (!DAY_TOKEN.test(range[0])) return null;
      days.add(DAY_INDEX[range[0]]);
    } else if (range.length === 2) {
      if (!DAY_TOKEN.test(range[0]) || !DAY_TOKEN.test(range[1])) return null;
      let d = DAY_INDEX[range[0]];
      const end = DAY_INDEX[range[1]];
      days.add(d);
      while (d !== end) {
        d = (d + 1) % 7;
        days.add(d);
      }
    } else return null;
  }
  return Array.from(days);
}

function fmt(h: number, m: number) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseTimes(spec: string): { open: string; close: string }[] | null {
  const out: { open: string; close: string }[] = [];
  for (const part of spec.split(',')) {
    const m = part.trim().match(TIME_RANGE);
    if (!m) return null;
    const [h1, m1, h2, m2] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    if (h1 > 24 || h2 > 48 || m1 > 59 || m2 > 59) return null;
    if (h1 === 24 && m1 > 0) return null;
    // OSM allows "22:00-26:00" for overnight; normalise to wall-clock time.
    const closeH = h2 >= 24 && !(h2 === 24 && m2 === 0) ? h2 - 24 : h2;
    if (h1 === closeH && m1 === m2) return null; // zero-length or ambiguous
    out.push({ open: fmt(h1 === 24 ? 0 : h1, m1), close: fmt(closeH, m2) });
  }
  return out;
}

export function parseOpeningHours(raw: string | null | undefined): ParsedHours {
  if (raw == null || !raw.trim()) return { status: 'missing', schedule: null, raw: null, note: null };
  const value = raw.trim().replace(/[–—]/g, '-').replace(/\s+/g, ' ');
  if (value.length > 255) return unsupported(raw);
  if (/^24\/7$/i.test(value)) {
    return { status: 'parsed', schedule: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: '00:00', close: '24:00' })), raw, note: 'Open 24 hours, every day.' };
  }
  if (/\|\||"|\+|sunrise|sunset|dawn|dusk|week|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b|\bSH\b|\beaster\b/i.test(value)) {
    return unsupported(raw);
  }

  const perDay = new Map<number, { open: string; close: string }[]>();
  let anyDaySelector = false;
  let skippedHoliday = false;

  for (const ruleRaw of value.split(';')) {
    const rule = ruleRaw.trim();
    if (!rule) continue;
    if (/^PH\b/i.test(rule)) {
      skippedHoliday = true;
      continue;
    }
    // Split "<days> <times|off>" — the day selector never contains a digit.
    const m = rule.match(/^([A-Za-z,\- ]*?)\s*((?:\d.*)|off|closed)?$/i);
    if (!m) return unsupported(raw);
    let selector = (m[1] ?? '').trim();
    const rest = (m[2] ?? '').trim();
    // "Mo-Fr,PH 09:00-17:00" — drop the PH part, keep the weekdays.
    if (/\bPH\b/i.test(selector)) {
      skippedHoliday = true;
      selector = selector
        .split(',')
        .filter((s) => !/^PH$/i.test(s.trim()))
        .join(',');
      if (!selector) continue;
    }
    if (!rest) return unsupported(raw);
    const days = selector ? parseDays(selector.replace(/\s+/g, '')) : [0, 1, 2, 3, 4, 5, 6];
    if (!days) return unsupported(raw);
    if (selector) anyDaySelector = true;
    if (/^(off|closed)$/i.test(rest)) {
      for (const d of days) perDay.set(d, []);
      continue;
    }
    const times = parseTimes(rest);
    if (!times) return unsupported(raw);
    for (const d of days) perDay.set(d, times);
  }

  if (perDay.size === 0) return unsupported(raw);
  void anyDaySelector; // Days never mentioned are closed (OSM semantics).
  const schedule: OpeningHoursDay[] = [];
  for (const [day, ranges] of [...perDay.entries()].sort((a, b) => a[0] - b[0])) {
    for (const r of ranges) schedule.push({ day, open: r.open, close: r.close });
  }
  return {
    status: 'parsed',
    schedule,
    raw,
    note: skippedHoliday ? 'Public-holiday hours are listed at the source but not interpreted here.' : null,
  };
}
