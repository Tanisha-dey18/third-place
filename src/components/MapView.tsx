import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Link } from 'react-router-dom';
import type { Cafe } from '@/types';
import { config } from '@/lib/config';
import { KOLKATA_CENTER, neighbourhoodName } from '@/lib/taxonomy';
import { formatPriceRange } from '@/lib/format';
import { directionsUrl } from '@/lib/geo';

// Map module. Tiles come from a configurable provider (VITE_MAP_TILE_URL).
// The default is the OpenStreetMap community tile server, which is only
// suitable for demos and light traffic under its usage policy; production
// deployments should configure a keyed provider. Attribution is always shown.
// Markers are HTML div-icons, so no external marker images are needed.

export interface MapViewProps {
  cafes: Cafe[];
  selectedId?: string | null;
  onSelect?(id: string | null): void;
  origin?: { lat: number; lng: number } | null;
  className?: string;
  /** Single-café mode for detail pages. */
  single?: boolean;
}

const icon = (selected: boolean, demo: boolean) =>
  L.divIcon({
    className: 'tp-marker',
    iconSize: [30, 38],
    iconAnchor: [15, 36],
    popupAnchor: [0, -32],
    html: `<svg width="30" height="38" viewBox="0 0 30 38" aria-hidden="true"><path d="M15 37s13-12.3 13-22A13 13 0 0 0 2 15c0 9.7 13 22 13 22z" fill="${selected ? '#4F5C3F' : '#2A1C13'}" stroke="#FBF8F3" stroke-width="2"/><circle cx="15" cy="15" r="${selected ? 5.5 : 4.5}" fill="${demo ? '#C9D2B8' : '#FBF8F3'}"/></svg>`,
  });

function FitBounds({ points, single }: { points: [number, number][]; single?: boolean }) {
  const map = useMap();
  const key = points.map((p) => p.join(',')).join('|');
  useEffect(() => {
    if (!points.length) return;
    if (single || points.length === 1) map.setView(points[0], 15, { animate: false });
    else map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map, single]);
  return null;
}

/** Leaflet measures its container once; re-measure when the layout changes size. */
function KeepSized() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

function PanTo({ cafe }: { cafe: Cafe | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (cafe?.lat != null && cafe.lng != null) map.panTo([cafe.lat, cafe.lng], { animate: true });
  }, [cafe, map]);
  return null;
}

export default function MapView({ cafes, selectedId, onSelect, origin, className = 'h-[480px]', single }: MapViewProps) {
  const [tileErrors, setTileErrors] = useState(0);
  const located = useMemo(() => cafes.filter((c) => c.lat != null && c.lng != null), [cafes]);
  const missing = cafes.length - located.length;
  const points = useMemo<[number, number][]>(() => {
    const p = located.map((c) => [c.lat!, c.lng!] as [number, number]);
    if (origin) p.push([origin.lat, origin.lng]);
    return p;
  }, [located, origin]);
  const selected = located.find((c) => c.id === selectedId);

  if (!config.map.enabled) {
    return (
      <div className={`flex items-center justify-center rounded-2xl border border-dashed border-oat bg-ivory/60 p-6 text-center text-sm text-mocha ${className}`}>
        The map is turned off for this deployment. Use the list view and the directions links.
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-2xl shadow-card ${className}`}>
      <MapContainer
        center={[KOLKATA_CENTER.lat, KOLKATA_CENTER.lng]}
        zoom={12}
        scrollWheelZoom={false}
        className="h-full w-full"
        attributionControl
      >
        <TileLayer
          className={config.map.usingDefaultTiles ? 'tp-tiles-warm' : undefined}
          url={config.map.tileUrl}
          attribution={config.map.attribution}
          maxZoom={19}
          eventHandlers={{ tileerror: () => setTileErrors((n) => n + 1) }}
        />
        <KeepSized />
        <FitBounds points={points} single={single} />
        {!single && <PanTo cafe={selected} />}
        {origin && (
          <CircleMarker center={[origin.lat, origin.lng]} radius={8} pathOptions={{ color: '#FBF8F3', weight: 3, fillColor: '#B5704A', fillOpacity: 1 }}>
            <Popup>Your search location</Popup>
          </CircleMarker>
        )}
        {located.map((c) => (
          <Marker
            key={c.id}
            position={[c.lat!, c.lng!]}
            icon={icon(c.id === selectedId, c.isDemo)}
            zIndexOffset={c.id === selectedId ? 1000 : 0}
            eventHandlers={{ click: () => onSelect?.(c.id), popupclose: () => onSelect?.(null) }}
            title={c.name}
          >
            <Popup>
              <div className="min-w-[180px] font-sans">
                {c.isDemo && <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-latte">Demo record</p>}
                <p className="font-serif text-base font-semibold text-espresso">{c.name}</p>
                <p className="text-xs text-mocha">
                  {neighbourhoodName(c.neighbourhood)}
                  {formatPriceRange(c) ? ` · ${formatPriceRange(c)} / person` : ''}
                </p>
                <div className="mt-2 flex gap-3 text-xs">
                  {!single && (
                    <Link to={`/cafe/${c.slug}`} className="font-medium text-sage-dark underline">
                      View place
                    </Link>
                  )}
                  {directionsUrl(c) && (
                    <a href={directionsUrl(c)!} target="_blank" rel="noopener noreferrer" className="font-medium text-sage-dark underline">
                      Directions
                    </a>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      {tileErrors > 6 && (
        <div className="absolute inset-x-3 top-3 z-[400] rounded-xl bg-ivory/95 p-3 text-xs text-mocha shadow-card">
          Map tiles couldn’t load (offline or provider limit). Markers still work, and the list view has every place.
        </div>
      )}
      {missing > 0 && (
        <div className="absolute bottom-3 left-3 z-[400] rounded-full bg-ivory/95 px-3 py-1 text-[11px] text-mocha shadow-card">
          {missing} place{missing === 1 ? '' : 's'} without exact coordinates not shown
        </div>
      )}
    </div>
  );
}
