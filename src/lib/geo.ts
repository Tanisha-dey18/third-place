import type { Cafe, OpeningHoursDay } from '../types';

/** Great-circle distance in kilometres (haversine). */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function cafeDistanceKm(cafe: Cafe, origin: { lat: number; lng: number } | null): number | null {
  if (!origin || cafe.lat == null || cafe.lng == null) return null;
  return distanceKm(origin.lat, origin.lng, cafe.lat, cafe.lng);
}

export function formatDistance(km: number | null): string | null {
  if (km == null) return null;
  if (km < 1) return `${Math.round(km * 1000 / 10) * 10} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

/** Google Maps directions link. Uses coordinates when known, else the address text. */
export function directionsUrl(cafe: Pick<Cafe, 'lat' | 'lng' | 'name' | 'address'>): string | null {
  // Only real coordinates or a real address — never a guessed location.
  if (cafe.lat != null && cafe.lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${cafe.lat},${cafe.lng}`;
  }
  if (cafe.address) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(cafe.address)}`;
  }
  return null;
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

/**
 * Is the place open at a given day/time according to its schedule?
 * Returns null when the schedule is unknown (null). An empty schedule means
 * "closed every day". Handles closing past midnight and "24:00".
 * `day`/`time` must already be in the city's timezone (see time.ts).
 */
export function isOpenAt(schedule: OpeningHoursDay[] | null, day: number, time: string): boolean | null {
  if (!schedule) return null;
  if (schedule.length === 0) return false;
  const t = toMinutes(time);
  for (const slot of schedule) {
    const open = toMinutes(slot.open);
    let close = toMinutes(slot.close);
    if (close <= open) close += 24 * 60; // past midnight
    if (slot.day === day && t >= open && t < close) return true;
    // Previous day's late-night slot spilling into this day
    const prev = (day + 6) % 7;
    if (slot.day === prev && close > 24 * 60 && t + 24 * 60 < close) return true;
  }
  return false;
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function formatTime(hhmm: string): string {
  if (hhmm === '24:00') return 'midnight';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 && h < 24 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
}
