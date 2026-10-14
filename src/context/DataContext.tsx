import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { RatingSummary } from '@/types';
import { LocalCommunityRepository, SupabaseCommunityRepository, type CommunityRepository } from '@/lib/repository/community';
import { useAuth } from './AuthContext';
import { config } from '@/lib/config';

// Place data itself is loaded per area/page (see hooks/usePlaces.ts).
// This context holds what's shared across pages: the community
// repository and a cache of rating summaries computed from real reviews.

interface DataState {
  source: 'live' | 'demo';
  ratings: Map<string, RatingSummary>;
  /** Load rating summaries for these place keys (cached; safe to call often). */
  ensureRatings(keys: string[]): void;
  refreshRatings(keys: string[]): void;
  community: CommunityRepository;
}

const DataContext = createContext<DataState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [ratings, setRatings] = useState<Map<string, RatingSummary>>(new Map());
  const requested = useRef(new Set<string>());

  // Reading reviews from Supabase works signed-out; writing needs an account.
  // In demo mode or without Supabase, community data stays on this device.
  const community = useMemo<CommunityRepository>(
    () => (config.supabaseConfigured && !config.demoMode ? new SupabaseCommunityRepository() : new LocalCommunityRepository()),
    // Recreate when the user changes so write permissions follow the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.id],
  );

  const load = useCallback(
    (keys: string[]) => {
      if (!keys.length) return;
      community
        .ratingSummaries(keys)
        .then((list) =>
          setRatings((prev) => {
            const next = new Map(prev);
            for (const k of keys) next.delete(k);
            for (const r of list) next.set(r.cafeId, r);
            return next;
          }),
        )
        .catch(() => {
          for (const k of keys) requested.current.delete(k);
        });
    },
    [community],
  );

  const ensureRatings = useCallback(
    (keys: string[]) => {
      const missing = keys.filter((k) => !requested.current.has(k));
      missing.forEach((k) => requested.current.add(k));
      for (let i = 0; i < missing.length; i += 100) load(missing.slice(i, i + 100));
    },
    [load],
  );

  const refreshRatings = useCallback((keys: string[]) => load(keys), [load]);

  const value = useMemo<DataState>(
    () => ({ source: config.demoMode ? 'demo' : 'live', ratings, ensureRatings, refreshRatings, community }),
    [ratings, ensureRatings, refreshRatings, community],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
