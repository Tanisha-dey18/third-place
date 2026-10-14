import { createCache, devFileStore, netlifyBlobStore, type Cache } from './cache';
import { serverEnv } from './http';
import { overpassConfigFromEnv } from './overpass';
import type { SnapshotDeps } from './snapshot';

// Lazily created per function instance. Netlify Blobs inside the Netlify
// runtime; a gitignored disk cache in local development; memory otherwise.
let cachePromise: Promise<Cache> | null = null;

export function sharedCache(): Promise<Cache> {
  cachePromise ??= (async () => {
    const blobs = await netlifyBlobStore('third-place-places');
    if (blobs) return createCache(blobs);
    const devDir = process.env.THIRD_PLACE_DEV_CACHE_DIR;
    return createCache(devDir ? await devFileStore(devDir) : null);
  })();
  return cachePromise;
}

export async function snapshotDeps(): Promise<SnapshotDeps> {
  return { cache: await sharedCache(), overpass: overpassConfigFromEnv(serverEnv()) };
}
