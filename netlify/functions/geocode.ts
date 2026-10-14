import type { Config } from '@netlify/functions';
import { createGeocodeHandler } from '../../server/handlers/geocode';
import { sharedCache } from '../../server/deps';
import { serverEnv } from '../../server/http';

export default createGeocodeHandler({ cache: sharedCache, fetch: (...a) => fetch(...a), env: serverEnv });

export const config: Config = {
  path: '/api/geocode',
  method: ['GET'],
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
