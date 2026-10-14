import type { ReactNode } from 'react';
import { CloudOff } from 'lucide-react';
import type { PlacesState as State } from '@/hooks/usePlaces';
import { EmptyState, ErrorState, GridSkeleton } from './States';

/**
 * Renders loading / error / empty states for a places request, and the
 * children once there is something to show. Never substitutes other data.
 */
export function PlacesStateView({
  state,
  empty,
  children,
  skeletonCount = 6,
}: {
  state: State;
  empty: ReactNode;
  children: ReactNode;
  skeletonCount?: number;
}) {
  if (state.status === 'error' && state.places.length === 0) {
    return (
      <div aria-live="assertive">
        <ErrorState message={state.error ?? 'Could not load cafés.'} onRetry={state.retryable ? state.retry : undefined} />
        {!state.retryable && (
          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-latte">
            <CloudOff size={13} aria-hidden /> If you’re running locally, start the app with <code className="rounded bg-sand px-1">npm run dev</code> so the /api routes are available.
          </p>
        )}
      </div>
    );
  }
  if ((state.status === 'loading' || state.status === 'idle') && state.places.length === 0) {
    return (
      <div aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading cafés…</span>
        <GridSkeleton count={skeletonCount} />
      </div>
    );
  }
  if (state.status === 'ready' && state.places.length === 0) return <>{empty}</>;
  return (
    <div aria-busy={state.status === 'loading'} className={state.status === 'loading' ? 'opacity-60 transition-opacity' : ''}>
      {state.status === 'error' && (
        <p role="alert" className="mb-3 rounded-xl bg-clay-light/60 px-3 py-2 text-sm text-[#8A4F2E]">
          Couldn’t refresh: {state.error}{' '}
          {state.retryable && (
            <button onClick={state.retry} className="underline">
              Retry
            </button>
          )}
        </p>
      )}
      {children}
    </div>
  );
}

export function NoPlacesHere({ area, children }: { area: string; children?: ReactNode }) {
  return (
    <EmptyState title={`No cafés listed in ${area} yet`}>
      {children ?? (
        <>
          Our data comes from OpenStreetMap, where not every café is mapped. Try a nearby area, or{' '}
          <a href="https://www.openstreetmap.org/" target="_blank" rel="noopener noreferrer" className="underline">
            add a missing café to OpenStreetMap
          </a>
          .
        </>
      )}
    </EmptyState>
  );
}
