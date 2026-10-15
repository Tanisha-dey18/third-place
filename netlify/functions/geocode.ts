import type { Config } from '@netlify/functions';
import { createGeocodeHandler } from '../../server/handlers/geocode';
import { sharedCache } from '../../server/deps';
import { serverEnv } from '../../server/http';
import { createSharedRateLimiter, rateLimitStore } from '../../server/rateLimit';

export default createGeocodeHandler({
  cache: sharedCache,
  fetch: (...a) => fetch(...a),
  env: serverEnv,
  // Shared across instances; protects Nominatim's 1 request/second policy.
  sharedLimiter: createSharedRateLimiter({ route: 'geocode', perClient: 10, windowMs: 60_000, globalPerDay: 2000 }, rateLimitStore),
});

export const config: Config = {
  path: '/api/geocode',
  method: ['GET'],
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
