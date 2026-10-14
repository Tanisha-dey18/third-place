import { Component, lazy, Suspense, type ReactNode } from 'react';
import type { MapViewProps } from './MapView';

const MapView = lazy(() => import('./MapView'));

class MapErrorBoundary extends Component<{ children: ReactNode; className?: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <div className={`flex items-center justify-center rounded-2xl border border-dashed border-oat bg-ivory/60 p-6 text-center text-sm text-mocha ${this.props.className ?? ''}`}>
          The map couldn’t be displayed. Use the list view and the directions links instead.
        </div>
      );
    }
    return this.props.children;
  }
}

/** Code-split map: Leaflet is only downloaded when a map is actually shown. */
export function LazyMap(props: MapViewProps) {
  return (
    <MapErrorBoundary className={props.className}>
      <Suspense fallback={<div className={`shimmer rounded-2xl ${props.className ?? 'h-[480px]'}`} aria-label="Loading map" />}>
        <MapView {...props} />
      </Suspense>
    </MapErrorBoundary>
  );
}
