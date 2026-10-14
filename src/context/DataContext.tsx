import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Cafe, RatingSummary } from '@/types';
import { cafeRepository } from '@/lib/repository/cafes';
import { LocalCommunityRepository, SupabaseCommunityRepository, type CommunityRepository } from '@/lib/repository/community';
import { useAuth } from './AuthContext';
import { config } from '@/lib/config';

interface DataState {
  cafes: Cafe[];
  loading: boolean;
  error: string | null;
  retry(): void;
  source: 'demo' | 'supabase';
  ratings: Map<string, RatingSummary>;
  refreshRatings(): void;
  community: CommunityRepository;
  bySlug(slug: string): Cafe | undefined;
  byId(id: string): Cafe | undefined;
}

const DataContext = createContext<DataState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [cafes, setCafes] = useState<Cafe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [ratings, setRatings] = useState<Map<string, RatingSummary>>(new Map());
  const [ratingTick, setRatingTick] = useState(0);

  // Reading reviews from Supabase works signed-out; writing needs an account.
  const community = useMemo<CommunityRepository>(
    () => (config.supabaseConfigured ? new SupabaseCommunityRepository() : new LocalCommunityRepository()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.id],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    cafeRepository
      .listCafes()
      .then((list) => active && setCafes(list))
      .catch((e: Error) => active && setError(e.message || 'Something went wrong loading cafés.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [attempt]);

  useEffect(() => {
    let active = true;
    community
      .ratingSummaries()
      .then((list) => active && setRatings(new Map(list.map((r) => [r.cafeId, r]))))
      .catch(() => active && setRatings(new Map()));
    return () => {
      active = false;
    };
  }, [community, ratingTick]);

  const index = useMemo(() => {
    const slug = new Map<string, Cafe>();
    const id = new Map<string, Cafe>();
    for (const c of cafes) {
      slug.set(c.slug, c);
      id.set(c.id, c);
    }
    return { slug, id };
  }, [cafes]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  const refreshRatings = useCallback(() => setRatingTick((t) => t + 1), []);

  const value = useMemo<DataState>(
    () => ({
      cafes,
      loading,
      error,
      retry,
      source: cafeRepository.source,
      ratings,
      refreshRatings,
      community,
      bySlug: (s) => index.slug.get(s),
      byId: (i) => index.id.get(i),
    }),
    [cafes, loading, error, retry, ratings, refreshRatings, community, index],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
