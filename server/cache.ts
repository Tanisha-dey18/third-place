// Two-tier cache for server functions:
//   1. in-memory (per function instance, short-lived)
//   2. Netlify Blobs (shared by every instance, survives deploys)
// Blobs are optional: locally (vite dev, tests) only memory is used.

export interface CacheEntry<T> {
  value: T;
  storedAt: number;
}

export interface BlobLike {
  get(key: string, opts: { type: 'json' }): Promise<unknown>;
  setJSON(key: string, value: unknown): Promise<unknown>;
}

export interface Cache {
  get<T>(key: string): Promise<CacheEntry<T> | null>;
  set<T>(key: string, value: T): Promise<void>;
  readonly shared: boolean;
}

const MEMORY_MAX = 500;

/** Memory entries are re-read from the shared store after this long, so a fresh snapshot written by another instance is picked up. */
const MEMORY_TTL_MS = 5 * 60 * 1000;

export function createCache(blobs: BlobLike | null, now: () => number = Date.now): Cache {
  const memory = new Map<string, CacheEntry<unknown> & { loadedAt: number }>();
  return {
    shared: !!blobs,
    async get<T>(key: string) {
      const hit = memory.get(key);
      if (hit && (!blobs || now() - hit.loadedAt < MEMORY_TTL_MS)) return hit as CacheEntry<T>;
      if (!blobs) return null;
      try {
        const stored = (await blobs.get(key, { type: 'json' })) as CacheEntry<T> | null;
        if (stored && typeof stored.storedAt === 'number' && 'value' in stored) {
          memory.set(key, { ...stored, loadedAt: now() });
          return stored;
        }
      } catch (e) {
        console.warn('[cache] blob read failed', (e as Error).name);
      }
      return hit ? (hit as CacheEntry<T>) : null;
    },
    async set<T>(key: string, value: T) {
      const entry: CacheEntry<T> = { value, storedAt: now() };
      if (memory.size >= MEMORY_MAX) memory.delete(memory.keys().next().value as string);
      memory.set(key, { ...entry, loadedAt: now() });
      if (!blobs) return;
      try {
        await blobs.setJSON(key, entry);
      } catch (e) {
        console.warn('[cache] blob write failed', (e as Error).name);
      }
    },
  };
}

/**
 * Netlify Blobs store when running on Netlify; null elsewhere (never throws).
 *
 * Detection is delegated to @netlify/blobs itself: getStore() throws
 * MissingBlobsEnvironmentError when no context is available. (An earlier
 * version pre-checked process.env.NETLIFY_BLOBS_CONTEXT, but the v2 function
 * runtime exposes that context via Netlify.env, so the check wrongly
 * returned null in production and every instance fell back to memory.)
 */
export async function netlifyBlobStore(name: string): Promise<BlobLike | null> {
  try {
    const { getStore } = await import('@netlify/blobs');
    const store = getStore({ name, consistency: 'strong' });
    return store as unknown as BlobLike;
  } catch (e) {
    if ((e as Error).constructor?.name !== 'MissingBlobsEnvironmentError' && (e as Error).name !== 'MissingBlobsEnvironmentError') console.warn('[cache] Netlify Blobs unavailable:', (e as Error).name);
    return null;
  }
}

/**
 * Development-only shared store on disk (gitignored), so a snapshot fetched
 * once survives dev-server restarts. Never used on Netlify.
 */
export async function devFileStore(dir: string): Promise<BlobLike> {
  const { mkdir, readFile, writeFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  await mkdir(dir, { recursive: true });
  const file = (key: string) => join(dir, `${key.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`);
  return {
    async get(key: string) {
      try {
        return JSON.parse(await readFile(file(key), 'utf8'));
      } catch {
        return null;
      }
    },
    async setJSON(key: string, value: unknown) {
      await writeFile(file(key), JSON.stringify(value), 'utf8');
    },
  };
}
