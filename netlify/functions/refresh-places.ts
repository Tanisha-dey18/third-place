import type { Config } from '@netlify/functions';
import { CITIES } from '../../src/lib/cities';
import { snapshotDeps } from '../../server/deps';
import { refreshSnapshot } from '../../server/snapshot';

// Scheduled: refreshes each city's OpenStreetMap snapshot four times a day.
// That's ~4 Overpass requests/day per city, far inside the public usage
// policy, and it means visitor traffic never hits Overpass directly.
export default async function handler(): Promise<Response> {
  const deps = await snapshotDeps();
  const deadline = Date.now() + 25_000; // scheduled functions may run up to 30 s
  const outcomes = [];
  for (const cityId of Object.keys(CITIES)) {
    try {
      outcomes.push(await refreshSnapshot(deps, cityId, deadline));
    } catch (e) {
      outcomes.push({ cityId, updated: false, reason: `refresh failed: ${(e as Error).message}`, count: 0, previousCount: null });
    }
  }
  console.log('[refresh-places]', JSON.stringify(outcomes));
  return new Response(null, { status: 204 });
}

export const config: Config = { schedule: '17 */6 * * *' };
