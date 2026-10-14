import { useCallback, useEffect, useRef, useState } from 'react';
import type { Cafe } from '@/types';
import { areaKey, type AreaSelection } from '@/lib/places/area';
import { loadArea, loadByKeys, searchByName, type PlacesResult } from '@/lib/places/service';
import type { PlacesMeta } from '@/lib/places/query';
import { PlacesApiError } from '@/lib/places/client';
import { useData } from '@/context/DataContext';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface PlacesState {
  places: Cafe[];
  meta: PlacesMeta | null;
  status: LoadStatus;
  error: string | null;
  retryable: boolean;
  enrichmentError: string | null;
  retry(): void;
}

function useLoader(key: string | null, load: (signal: AbortSignal) => Promise<PlacesResult>): PlacesState {
  const { ensureRatings } = useData();
  const [state, setState] = useState<Omit<PlacesState, 'retry'>>({ places: [], meta: null, status: key ? 'loading' : 'idle', error: null, retryable: false, enrichmentError: null });
  const [attempt, setAttempt] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!key) {
      setState({ places: [], meta: null, status: 'idle', error: null, retryable: false, enrichmentError: null });
      return;
    }
    const ctrl = new AbortController();
    // Keep the previous results visible while the next area loads.
    setState((s) => ({ ...s, status: 'loading', error: null }));
    loadRef
      .current(ctrl.signal)
      .then((res) => {
        if (ctrl.signal.aborted) return;
        setState({ places: res.places, meta: res.meta, status: 'ready', error: null, retryable: false, enrichmentError: res.enrichmentError ?? null });
        ensureRatings(res.places.map((p) => p.id));
      })
      .catch((e: Error) => {
        if (ctrl.signal.aborted || e.name === 'AbortError') return;
        const retryable = e instanceof PlacesApiError ? e.retryable : true;
        setState((s) => ({ ...s, status: 'error', error: e.message || 'Could not load cafés.', retryable }));
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { ...state, retry };
}

/** Places in an area of the city (neighbourhood, near a point, map bounds, whole city). */
export function useAreaPlaces(area: AreaSelection | null): PlacesState {
  return useLoader(area ? areaKey(area) : null, (signal) => loadArea(area!, signal));
}

/** Specific places by key (saved places, collections, detail pages). */
export function usePlacesByKeys(keys: string[]): PlacesState {
  const sorted = [...new Set(keys)].sort();
  return useLoader(sorted.length ? `keys:${sorted.join(',')}` : null, (signal) => loadByKeys(sorted, signal));
}

/** City-wide name search (debounce the input before passing it here). */
export function useNameSearch(q: string): PlacesState {
  const trimmed = q.trim();
  return useLoader(trimmed.length >= 2 ? `q:${trimmed.toLowerCase()}` : null, (signal) => searchByName(trimmed, signal));
}
