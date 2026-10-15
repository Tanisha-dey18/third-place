import type { Config } from '@netlify/functions';
import { createHealthHandler } from '../../server/handlers/health';
import { snapshotDeps } from '../../server/deps';
import { serverEnv } from '../../server/http';

// Read-only pipeline diagnostics (no secrets, no user data). See server/handlers/health.ts.
export default createHealthHandler({ getDeps: snapshotDeps, env: serverEnv });

export const config: Config = {
  path: '/api/health',
  method: ['GET'],
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
