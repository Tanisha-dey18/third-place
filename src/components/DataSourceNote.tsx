import { Database, AlertTriangle } from 'lucide-react';
import type { PlacesMeta } from '@/lib/places/query';
import { formatZonedDate } from '@/lib/time';
import { DEFAULT_CITY } from '@/lib/cities';

/** Source attribution + freshness, shown wherever provider data is listed. */
export function DataSourceNote({ meta, enrichmentError, className = '' }: { meta: PlacesMeta | null; enrichmentError?: string | null; className?: string }) {
  if (!meta) return null;
  if (meta.provider === 'demo') {
    return (
      <p className={`flex items-start gap-1.5 text-xs text-latte ${className}`}>
        <Database size={13} className="mt-0.5 shrink-0" aria-hidden /> Fictional demo data (development mode). Not real businesses.
      </p>
    );
  }
  return (
    <div className={`space-y-1 text-xs text-latte ${className}`}>
      <p className="flex items-start gap-1.5">
        <Database size={13} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          Place data{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline decoration-oat underline-offset-2">
            {meta.attribution}
          </a>
          {meta.license ? ` (${meta.license})` : ''}
          {meta.snapshotAt ? ` · fetched ${formatZonedDate(meta.snapshotAt, DEFAULT_CITY.timezone)}` : ''}. Listed facts are source-provided, not verified by THIRD PLACE.
        </span>
      </p>
      {meta.stale && (
        <p className="flex items-start gap-1.5 text-clay">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden /> This data snapshot is older than usual; a refresh is pending.
        </p>
      )}
      {enrichmentError && (
        <p className="flex items-start gap-1.5 text-clay">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden /> Verified details and reviews couldn’t be loaded right now.
        </p>
      )}
    </div>
  );
}
