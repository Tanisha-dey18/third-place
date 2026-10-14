import type { Config } from '@netlify/functions';
import { CITIES } from '../../src/lib/cities';
import { snapshotDeps } from '../../server/deps';
import { backgroundRefresh } from '../../server/snapshot';

// Background Function (runs up to 15 minutes; the caller gets 202 at once).
// Builds the city snapshot when it's missing or old — e.g. right after the
// first deploy, or when Overpass was too slow for the 6-hourly schedule.
// Safe to call publicly: it does nothing if the snapshot is fresh (< 30 min)
// or another refresh holds the shared lock, so abuse can't amplify traffic to
// OpenStreetMap services. Platform rate limiting caps calls further.
export default async function handler(req: Request): Promise<void> {
  if (req.method !== 'POST') return;
  const deps = await snapshotDeps();
  for (const cityId of Object.keys(CITIES)) {
    const outcome = await backgroundRefresh(deps, cityId, { maxMs: 12 * 60 * 1000 });
    console.log('[refresh-places-background]', JSON.stringify(outcome));
  }
}

export const config: Config = {
  background: true,
  path: '/api/internal/refresh-places',
  method: ['POST'],
  rateLimit: { windowLimit: 6, windowSize: 60, aggregateBy: ['domain'] },
};
