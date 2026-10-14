import { Link } from 'react-router-dom';
import { Clock, MapPin, Star } from 'lucide-react';
import type { Cafe, FacilityKey, PlaceCategory } from '@/types';
import { ATMOSPHERE_LABELS, neighbourhoodName } from '@/lib/taxonomy';
import { formatPriceRange } from '@/lib/format';
import { formatDistance, isOpenAt } from '@/lib/geo';
import { zonedDayTime } from '@/lib/time';
import { getCity } from '@/lib/cities';
import { useData } from '@/context/DataContext';
import { SmartImage } from './SmartImage';
import { SaveButton } from './SaveButton';
import { DemoLabel } from './DemoLabel';
import { FacilityPills } from './FacilityList';

interface Props {
  cafe: Cafe;
  distanceKm?: number | null;
  variant?: 'standard' | 'feature' | 'rail';
  facilityKeys?: FacilityKey[];
  eager?: boolean;
  highlighted?: boolean;
  onHover?(id: string | null): void;
}

export const CATEGORY_LABELS: Record<PlaceCategory, string> = {
  cafe: 'Café',
  ice_cream: 'Ice cream & desserts',
  coffee_shop_restaurant: 'Coffee shop',
  other: 'Place',
};

export function RatingLine({ cafeId }: { cafeId: string }) {
  const { ratings } = useData();
  const r = ratings.get(cafeId);
  if (!r || r.count === 0) return <span className="text-xs text-latte">No reviews yet</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-mocha" title="Average of real review records">
      <Star size={12} className="fill-clay text-clay" aria-hidden />
      {r.average.toFixed(1)} <span className="text-latte">({r.count})</span>
    </span>
  );
}

/** "Open now" / "Closed now" only when hours are known and interpretable, in the city's timezone. */
export function OpenNowBadge({ cafe }: { cafe: Cafe }) {
  const { day, time } = zonedDayTime(getCity(cafe.city).timezone);
  const open = isOpenAt(cafe.hours.value, day, time);
  if (open == null) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${open ? 'text-sage-dark' : 'text-latte'}`}>
      <Clock size={12} aria-hidden /> {open ? 'Open now' : 'Closed now'}
    </span>
  );
}

export function CafeCard({ cafe, distanceKm, variant = 'standard', facilityKeys, eager, highlighted, onHover }: Props) {
  const price = formatPriceRange(cafe);
  const dist = formatDistance(distanceKm ?? null);
  const feature = variant === 'feature';
  const subtitle = cafe.tagline || [CATEGORY_LABELS[cafe.category], cafe.foodTypes.slice(0, 3).join(' · ')].filter(Boolean).join(' · ');
  return (
    <article
      onMouseEnter={() => onHover?.(cafe.id)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(cafe.id)}
      className={`group relative flex flex-col overflow-hidden rounded-2xl bg-ivory shadow-card transition-shadow focus-within:ring-2 focus-within:ring-sage-dark hover:shadow-lift ${
        highlighted ? 'ring-2 ring-sage-dark' : ''
      } ${variant === 'rail' ? 'w-[78vw] max-w-[300px] shrink-0 snap-start' : ''}`}
    >
      <Link to={`/cafe/${cafe.slug}`} className="absolute inset-0 z-[1] focus:outline-none" aria-label={`${cafe.name}: view details`} />
      <div className="relative">
        <SmartImage
          src={cafe.photos[0]?.url}
          alt={cafe.photos[0]?.alt ?? cafe.name}
          label={cafe.name}
          className={cafe.photos.length === 0 ? 'aspect-[16/6]' : feature ? 'aspect-[16/10]' : variant === 'rail' ? 'aspect-[4/3]' : 'aspect-[16/9]'}
          width={feature ? 900 : 520}
          eager={eager}
        />
        <div className="absolute left-3 top-3 z-[2] flex gap-1.5">{cafe.isDemo && <DemoLabel />}</div>
        <div className="absolute right-3 top-3 z-[2]">
          <SaveButton cafeId={cafe.id} name={cafe.name} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className={`${feature ? 'text-2xl' : 'text-[19px]'} leading-snug text-espresso`}>{cafe.name}</h3>
          {price && <span className="shrink-0 pt-1 text-sm font-medium text-mocha">{price}</span>}
        </div>
        {subtitle && <p className="line-clamp-2 text-sm leading-relaxed text-mocha">{subtitle}</p>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-latte">
          <span className="inline-flex items-center gap-1">
            <MapPin size={12} aria-hidden /> {cafe.neighbourhood ? neighbourhoodName(cafe.neighbourhood) : getCity(cafe.city).name}
            {dist && <span className="text-mocha">· {dist}</span>}
          </span>
          <OpenNowBadge cafe={cafe} />
          {cafe.atmosphere.slice(0, 2).map((a) => (
            <span key={a}>{ATMOSPHERE_LABELS[a]}</span>
          ))}
          <RatingLine cafeId={cafe.id} />
        </div>
        <div className="mt-auto space-y-2 pt-1">
          <FacilityPills cafe={cafe} keys={facilityKeys} max={feature ? 5 : 3} />
          {cafe.source.provider === 'openstreetmap' && <p className="text-[10.5px] text-latte">Listed on OpenStreetMap{cafe.verificationStatus === 'source_provided' ? ' · not verified' : ''}</p>}
        </div>
      </div>
    </article>
  );
}
