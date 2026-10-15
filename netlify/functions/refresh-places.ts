import type { Config } from '@netlify/functions';
import { CITIES } from '../../src/lib/cities';
import { snapshotDeps } from '../../server/deps';
import { refreshSnapshot } from '../../server/snapshot';
import { serverEnv } from '../../server/http';
import { rateLimitStore, sweepRateLimits } from '../../server/rateLimit';

// Scheduled: refreshes each city's OpenStreetMap snapshot four times a day
// (~4 Overpass requests/day/city), so visitor traffic never hits Overpass.
// Scheduled functions are limited to 30 s; when Overpass is too busy for
// that, the work is handed to the background function, which retries
// patiently for up to 15 minutes.
export default async function handler(): Promise<Response> {
  const deps = await snapshotDeps();
  const deadline = Date.now() + 25_000;
  let needsBackground = false;
  for (const cityId of Object.keys(CITIES)) {
    try {
      const outcome = await refreshSnapshot(deps, cityId, deadline, 'scheduled');
      console.log(JSON.stringify({ evt: 'scheduled_refresh', ...outcome }));
    } catch (e) {
      needsBackground = true;
      console.log(JSON.stringify({ evt: 'scheduled_refresh', cityId, updated: false, reason: (e as Error).message, handoff: 'background' }));
    }
  }
  const site = serverEnv().URL;
  if (needsBackground && site) {
    try {
      const res = await fetch(new URL('/api/internal/refresh-places', site), { method: 'POST', signal: AbortSignal.timeout(4000) });
      console.log(JSON.stringify({ evt: 'background_handoff', status: res.status }));
    } catch (e) {
      console.log(JSON.stringify({ evt: 'background_handoff', error: (e as Error).name }));
    }
  }
  try {
    const store = await rateLimitStore();
    if (store) console.log(JSON.stringify({ evt: 'ratelimit_sweep', removed: await sweepRateLimits(store as Parameters<typeof sweepRateLimits>[0]) }));
  } catch (e) {
    console.log(JSON.stringify({ evt: 'ratelimit_sweep', error: (e as Error).name }));
  }
  return new Response(null, { status: 204 });
}

export const config: Config = { schedule: '17 */6 * * *' };
