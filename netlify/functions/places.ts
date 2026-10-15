import type { Config, Context } from '@netlify/functions';
import { createPlacesHandler } from '../../server/handlers/places';
import { snapshotDeps } from '../../server/deps';
import { serverEnv } from '../../server/http';

const handler = createPlacesHandler({
  getDeps: snapshotDeps,
  env: serverEnv,
  // Measured on this site: Netlify cuts synchronous functions off at ~30 s (HTTP 504).
  // Stay well inside that so the function always returns its own structured response.
  budgetMs: Number(process.env.PLACES_BUDGET_MS) || 24_000,
  // Fresh deploy with no snapshot yet: hand the slow fetch to the background function.
  kickRefresh: (req) => fetch(new URL('/api/internal/refresh-places', req.url), { method: 'POST' }),
});

export default (req: Request, context: Context) => handler(req, context);

export const config: Config = {
  path: '/api/places',
  method: ['GET', 'OPTIONS'],
  // Platform-level, shared across all function instances.
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
