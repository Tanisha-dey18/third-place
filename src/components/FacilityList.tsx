import type { Cafe, FacilityKey } from '@/types';
import { CONFIRMING_STATUSES, FACILITY_LABELS, VERIFICATION_LABELS } from '@/lib/taxonomy';
import { Wifi, PlugZap, Snowflake, Armchair, Trees, Hourglass, Leaf, Car, Accessibility, Check, X, HelpCircle, Users } from 'lucide-react';
import { VerificationBadge, formatDate } from './VerificationBadge';

export const FACILITY_ICONS: Record<FacilityKey, typeof Wifi> = {
  wifi: Wifi,
  charging: PlugZap,
  ac: Snowflake,
  comfortable_seating: Armchair,
  outdoor_seating: Trees,
  long_stay: Hourglass,
  veg_options: Leaf,
  parking: Car,
  wheelchair_access: Accessibility,
};

/**
 * Compact pills for cards: only facilities that are available AND backed by
 * evidence (café-verified, visitor-confirmed or source-provided). Community
 * claims and unknowns are left to the detail page, where their status is shown.
 */
export function FacilityPills({ cafe, keys, max = 4 }: { cafe: Cafe; keys?: FacilityKey[]; max?: number }) {
  const list = cafe.facilities.filter((f) => f.available === true && CONFIRMING_STATUSES.includes(f.status) && (!keys || keys.includes(f.key))).slice(0, max);
  if (!list.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Listed facilities">
      {list.map((f) => {
        const Icon = FACILITY_ICONS[f.key];
        return (
          <li key={f.key} className="inline-flex items-center gap-1 rounded-full bg-cream px-2 py-0.5 text-[11.5px] text-mocha" title={`${FACILITY_LABELS[f.key]}: ${VERIFICATION_LABELS[f.status]}`}>
            <Icon size={12} aria-hidden /> {FACILITY_LABELS[f.key]}
            {f.status === 'source_provided' && <span className="sr-only"> (source-provided, not verified)</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** Full facility table for the detail page, with status and provenance for every row. */
export function FacilityTable({ cafe, keys }: { cafe: Cafe; keys?: FacilityKey[] }) {
  const all: FacilityKey[] = keys ?? (Object.keys(FACILITY_LABELS) as FacilityKey[]);
  return (
    <ul className="divide-y divide-oat/60">
      {all.map((key) => {
        const rec = cafe.facilities.find((f) => f.key === key);
        const Icon = FACILITY_ICONS[key];
        const available = rec?.available ?? null;
        const status = rec?.status ?? 'unknown';
        const label = available === true ? 'Available' : available === false ? 'Not available' : 'Not verified';
        return (
          <li key={key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
            <Icon size={18} className="text-latte" aria-hidden />
            <span className="min-w-[9rem] flex-1 text-[15px]">{FACILITY_LABELS[key]}</span>
            <span className={`inline-flex items-center gap-1 text-sm font-medium ${available === true ? 'text-sage-dark' : available === false ? 'text-clay' : 'text-latte'}`}>
              {available === true ? <Check size={15} aria-hidden /> : available === false ? <X size={15} aria-hidden /> : <HelpCircle size={15} aria-hidden />}
              {label}
            </span>
            {rec && rec.status !== 'unknown' && <VerificationBadge status={status} date={rec.lastVerified} />}
            {(rec?.note || rec?.sourceCheckedAt || rec?.community) && (
              <div className="w-full space-y-0.5 pl-[30px] text-[13px] text-mocha">
                {rec?.note && <p>{rec.note}</p>}
                {rec?.sourceCheckedAt && <p className="text-latte">Source contributors last checked: {formatDate(rec.sourceCheckedAt)}</p>}
                {rec?.community && (rec.community.yes > 0 || rec.community.no > 0) && (
                  <p className="flex items-center gap-1 text-latte">
                    <Users size={12} aria-hidden /> Unverified community reports: {rec.community.yes} say available, {rec.community.no} say not
                    {rec.community.latest ? ` (latest ${formatDate(rec.community.latest)})` : ''}
                  </p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
