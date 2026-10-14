// Time helpers that respect the CITY's timezone (Asia/Kolkata for Kolkata),
// not the visitor's device timezone.

const DAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Weekday (0 = Sunday) and "HH:MM" for an instant, as seen in `timeZone`. */
export function zonedDayTime(timeZone: string, at: Date = new Date()): { day: number; time: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return { day: DAY_INDEX[get('weekday')] ?? at.getUTCDay(), time: `${hour.padStart(2, '0')}:${get('minute').padStart(2, '0')}` };
}

/** Human date in the city's timezone, e.g. "14 Oct 2026". */
export function formatZonedDate(iso: string, timeZone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { timeZone, day: 'numeric', month: 'short', year: 'numeric' });
}
