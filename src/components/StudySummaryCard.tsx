import { Check, HelpCircle, X, GraduationCap } from 'lucide-react';
import type { Cafe } from '@/types';
import { studySummary } from '@/lib/study';
import { VerificationBadge, formatDate } from './VerificationBadge';

const TONE = {
  strong: 'bg-sage-light text-sage-dark',
  workable: 'bg-[#EEF0E6] text-[#56663F]',
  not_ideal: 'bg-clay-light text-[#8A4F2E]',
  unclear: 'bg-sand text-mocha',
};

export function StudySummaryCard({ cafe, compact = false }: { cafe: Cafe; compact?: boolean }) {
  const s = studySummary(cafe);
  return (
    <div className={compact ? '' : 'card p-5'}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${TONE[s.verdict]}`}>
          <GraduationCap size={15} aria-hidden /> {s.headline}
        </span>
        {s.lastVerified && <span className="text-xs text-latte">Facilities last checked {formatDate(s.lastVerified)}</span>}
      </div>
      <ul className={`mt-3 grid gap-x-6 ${compact ? 'grid-cols-1 gap-y-1' : 'gap-y-2 sm:grid-cols-2'}`}>
        {s.factors.map((f) => (
          <li key={f.key} className="flex items-center gap-2 text-sm">
            {f.state === 'yes' ? (
              <Check size={15} className="shrink-0 text-sage-dark" aria-label="Yes" />
            ) : f.state === 'no' ? (
              <X size={15} className="shrink-0 text-clay" aria-label="No" />
            ) : (
              <HelpCircle size={15} className="shrink-0 text-latte" aria-label="Unknown" />
            )}
            <span className={f.state === 'unknown' ? 'text-latte' : 'text-espresso'}>{f.label}</span>
            {!compact && <VerificationBadge status={f.status} compact />}
          </li>
        ))}
      </ul>
    </div>
  );
}
