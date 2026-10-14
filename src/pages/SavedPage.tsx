import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, FolderPlus } from 'lucide-react';
import type { Cafe } from '@/types';
import { usePlacesByKeys } from '@/hooks/usePlaces';
import { useLibrary } from '@/context/LibraryContext';
import { useAuth } from '@/context/AuthContext';
import { CafeCard } from '@/components/CafeCard';
import { EmptyState, ErrorState, GridSkeleton } from '@/components/States';
import { AddToCollectionDialog } from '@/components/AddToCollectionDialog';
import { LazyMap } from '@/components/LazyMap';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function SavedPage() {
  useDocumentTitle('Saved');
  const { savedIds, ready, mode, collections } = useLibrary();

  const { configured, user } = useAuth();
  const [target, setTarget] = useState<Cafe | null>(null);
  const [showMap, setShowMap] = useState(false);
  const state = usePlacesByKeys(savedIds);
  const loading = state.status === 'loading' && state.places.length === 0;
  const saved = savedIds.map((id) => state.places.find((p) => p.id === id)).filter(Boolean) as Cafe[];
  const missing = state.status === 'ready' ? savedIds.length - saved.length : 0;

  return (
    <div className="page pt-10">
      <p className="eyebrow">Saved</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-4xl sm:text-5xl">Your places</h1>
        <div className="flex gap-2">
          {saved.length > 0 && (
            <button onClick={() => setShowMap((s) => !s)} className="btn-ghost">
              {showMap ? 'Hide map' : 'Show on map'}
            </button>
          )}
          <Link to="/collections" className="btn-ghost">
            Collections ({collections.length})
          </Link>
        </div>
      </div>
      <p className="mt-2 text-sm text-mocha">
        {mode === 'account'
          ? 'Saved to your account and available on any device.'
          : configured && !user
            ? 'Saved on this device only. Log in and they’ll move to your account automatically.'
            : 'Saved in this browser only. Accounts aren’t configured on this deployment, so nothing is synced.'}
      </p>

      <div className="mt-8">
        {state.status === 'error' && saved.length === 0 && savedIds.length > 0 ? (
          <ErrorState message={state.error ?? 'Could not load your saved places.'} onRetry={state.retryable ? state.retry : undefined} />
        ) : !ready || loading ? (
          <GridSkeleton count={3} />
        ) : saved.length === 0 ? (
          <EmptyState
            title="Nothing saved yet"
            icon={<Bookmark size={28} aria-hidden />}
            action={
              <Link to="/explore" className="btn-primary">
                Explore places
              </Link>
            }
          >
            Tap the bookmark on any place to keep it here.
          </EmptyState>
        ) : (
          <>
            {missing > 0 && <p className="mb-4 text-sm text-latte">{missing} saved place{missing === 1 ? ' is' : 's are'} no longer listed at the source and can’t be shown.</p>}
            {showMap && <LazyMap cafes={saved} className="mb-8 h-[360px]" />}
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {saved.map((c) => (
                <div key={c.id}>
                  <CafeCard cafe={c} />
                  <button onClick={() => setTarget(c)} className="btn-link mt-2 pl-1 text-mocha">
                    <FolderPlus size={14} aria-hidden /> Add to collection
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      {target && <AddToCollectionDialog open onClose={() => setTarget(null)} cafeId={target.id} cafeName={target.name} />}
    </div>
  );
}
