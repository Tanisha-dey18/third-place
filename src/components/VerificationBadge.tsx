import type { VerificationStatus } from '@/types';
import { VERIFICATION_HELP, VERIFICATION_LABELS } from '@/lib/taxonomy';
import { BadgeCheck, CircleHelp, Users, UserCheck, CircleDashed } from 'lucide-react';

const STYLE: Record<VerificationStatus, string> = {
  cafe_verified: 'bg-sage-light text-sage-dark',
  visitor_confirmed: 'bg-[#E9EEE2] text-[#56663F]',
  community_reported: 'bg-clay-light text-[#8A4F2E]',
  unverified: 'bg-sand text-mocha',
  unknown: 'bg-cream text-latte border border-dashed border-oat',
};

const ICON = {
  cafe_verified: BadgeCheck,
  visitor_confirmed: UserCheck,
  community_reported: Users,
  unverified: CircleDashed,
  unknown: CircleHelp,
};

export function VerificationBadge({ status, date, compact = false }: { status: VerificationStatus; date?: string | null; compact?: boolean }) {
  const Icon = ICON[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${STYLE[status]}`}
      title={`${VERIFICATION_HELP[status]}${date ? ` Last checked ${formatDate(date)}.` : ''}`}
    >
      <Icon size={12} aria-hidden />
      {compact ? null : VERIFICATION_LABELS[status]}
      {compact && <span className="sr-only">{VERIFICATION_LABELS[status]}</span>}
      {!compact && date && <span className="opacity-70">· {formatDate(date, true)}</span>}
    </span>
  );
}

export function formatDate(iso: string, short = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', short ? { month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' });
}
