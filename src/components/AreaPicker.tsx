import { LocateFixed, MapPin } from 'lucide-react';
import { NEIGHBOURHOODS, REGION_LABELS } from '@/lib/taxonomy';
import { DEFAULT_CITY } from '@/lib/cities';
import type { AreaSelection } from '@/lib/places/area';
import type { Region } from '@/types';
import { useGeolocation } from '@/hooks/useGeolocation';

/**
 * Choose where to look: a neighbourhood, a region, the whole city, or near
 * the device (only after the user taps the button and grants permission).
 */
export function AreaPicker({
  value,
  onChange,
  allowCity = true,
  allowRegions = false,
  compact = false,
  nearRadiusKm = 2.5,
}: {
  value: AreaSelection;
  onChange(a: AreaSelection): void;
  allowCity?: boolean;
  allowRegions?: boolean;
  compact?: boolean;
  nearRadiusKm?: number;
}) {
  const geo = useGeolocation();
  const selectValue =
    value.kind === 'neighbourhood' ? `n:${value.slug}` : value.kind === 'region' ? `r:${value.region}` : value.kind === 'city' ? 'city' : value.kind === 'near' && value.device ? 'device' : 'other';

  const onSelect = (v: string) => {
    if (v === 'city') onChange({ kind: 'city' });
    else if (v.startsWith('n:')) onChange({ kind: 'neighbourhood', slug: v.slice(2) });
    else if (v.startsWith('r:')) onChange({ kind: 'region', region: v.slice(2) as Region });
  };

  const useDevice = async () => {
    const c = await geo.request();
    if (c) onChange({ kind: 'near', lat: c.lat, lng: c.lng, radiusKm: nearRadiusKm, label: 'near you', device: true });
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? '' : 'w-full'}`}>
      <label className="chip min-h-[40px] !py-2">
        <MapPin size={14} aria-hidden />
        <span className="sr-only">Area</span>
        <select value={selectValue} onChange={(e) => onSelect(e.target.value)} className="max-w-[12rem] bg-transparent focus:outline-none">
          {selectValue === 'device' && <option value="device">Near you</option>}
          {selectValue === 'other' && <option value="other">{value.kind === 'near' ? value.label : 'This map area'}</option>}
          {allowCity && <option value="city">All of {DEFAULT_CITY.name}</option>}
          {allowRegions &&
            (Object.keys(REGION_LABELS) as Region[]).map((r) => (
              <option key={r} value={`r:${r}`}>
                {REGION_LABELS[r]}
              </option>
            ))}
          <optgroup label="Neighbourhoods">
            {NEIGHBOURHOODS.map((n) => (
              <option key={n.slug} value={`n:${n.slug}`}>
                {n.name}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <button type="button" onClick={() => void useDevice()} className={`chip min-h-[40px] !py-2 ${selectValue === 'device' ? 'chip-on' : ''}`} disabled={geo.status === 'requesting'}>
        <LocateFixed size={14} aria-hidden /> {geo.status === 'requesting' ? 'Locating…' : 'Near me'}
      </button>
      {geo.message && (
        <p role="status" className="basis-full text-xs text-clay">
          {geo.message}
        </p>
      )}
    </div>
  );
}
