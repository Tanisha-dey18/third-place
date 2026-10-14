import { Link } from 'react-router-dom';
import { Check, CircleAlert, HelpCircle, MapPin, Navigation, Sparkles, X } from 'lucide-react';
import type { Match } from '@/lib/engine';
import { ATMOSPHERE_LABELS, FACILITY_LABELS, neighbourhoodName } from '@/lib/taxonomy';
import { directionsUrl, formatDistance } from '@/lib/geo';
import { formatPriceRange } from '@/lib/format';
import { SmartImage } from './SmartImage';
import { SaveButton } from './SaveButton';
import { DemoLabel } from './DemoLabel';
import { VerificationBadge } from './VerificationBadge';
import { RatingLine } from './CafeCard';

const BUDGET_TEXT: Record<Match['budgetFit'], { text: string; tone: string } | null> = {
  within: { text: 'Within budget', tone: 'bg-sage-light text-sage-dark' },
  partial: { text: 'Partly within budget', tone: 'bg-clay-light text-[#8A4F2E]' },
  over: { text: 'Over budget', tone: 'bg-clay text-ivory' },
  unknown: { text: 'Price unknown', tone: 'bg-sand text-mocha' },
  not_requested: null,
};

export function MatchCard({ match, rank, aiNote }: { match: Match; rank?: number; aiNote?: string }) {
  const { cafe } = match;
  const dir = directionsUrl(cafe);
  const budget = BUDGET_TEXT[match.budgetFit];
  const price = formatPriceRange(cafe);
  return (
    <article className="card overflow-hidden">
      <div className="grid sm:grid-cols-[220px_1fr]">
        <Link to={`/cafe/${cafe.slug}`} className="relative block" tabIndex={-1} aria-hidden>
          <SmartImage src={cafe.photos[0]?.url} alt={cafe.photos[0]?.alt ?? cafe.name} label={cafe.name} className="aspect-[16/9] h-full sm:aspect-auto" width={480} />
          {cafe.isDemo && <DemoLabel className="absolute left-3 top-3" />}
        </Link>
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              {rank != null && <p className="eyebrow mb-1">No. {rank}</p>}
              <h3 className="text-2xl leading-tight">
                <Link to={`/cafe/${cafe.slug}`} className="hover:underline decoration-oat underline-offset-4">
                  {cafe.name}
                </Link>
              </h3>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-mocha">
                <span className="inline-flex items-center gap-1">
                  <MapPin size={13} aria-hidden /> {neighbourhoodName(cafe.neighbourhood)}
                </span>
                {match.distanceKm != null && <span>{formatDistance(match.distanceKm)} away</span>}
                {price && <span>{price} / person</span>}
                <RatingLine cafeId={cafe.id} />
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <ScoreRing score={match.score} />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {match.eligible && match.score < 30 && (
              <span className="rounded-full border border-dashed border-latte px-2.5 py-0.5 text-xs text-mocha" title="Not ruled out, but a poor fit for what you asked">
                Weak match
              </span>
            )}
            {budget && <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${budget.tone}`}>{budget.text}</span>}
            {cafe.atmosphere.slice(0, 3).map((a) => (
              <span key={a} className="rounded-full bg-cream px-2.5 py-0.5 text-xs text-mocha">
                {ATMOSPHERE_LABELS[a]}
              </span>
            ))}
          </div>

          {match.reasons.length > 0 && (
            <div className="mt-4">
              <h4 className="eyebrow mb-1.5 font-sans">Why it matches</h4>
              <ul className="space-y-1">
                {match.reasons.slice(0, 5).map((r) => (
                  <li key={r} className="flex gap-2 text-sm text-espresso">
                    <Check size={15} className="mt-0.5 shrink-0 text-sage-dark" aria-hidden /> {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {aiNote && (
            <p className="mt-3 flex gap-2 rounded-xl bg-sage-light/60 p-3 text-sm text-sage-dark">
              <Sparkles size={15} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                {aiNote}
                <span className="block text-[11px] opacity-70">AI-written summary of the facts listed on this card.</span>
              </span>
            </p>
          )}

          {match.facilityChecks.some((f) => f.required) && (
            <div className="mt-4">
              <h4 className="eyebrow mb-1.5 font-sans">Your must-haves</h4>
              <ul className="flex flex-wrap gap-2">
                {match.facilityChecks
                  .filter((f) => f.required)
                  .map((f) => (
                    <li key={f.key} className="inline-flex items-center gap-1.5 rounded-xl border border-oat px-2.5 py-1 text-xs">
                      {f.available === true ? (
                        <Check size={13} className="text-sage-dark" aria-hidden />
                      ) : f.available === false ? (
                        <X size={13} className="text-clay" aria-hidden />
                      ) : (
                        <HelpCircle size={13} className="text-latte" aria-hidden />
                      )}
                      {FACILITY_LABELS[f.key]}
                      <VerificationBadge status={f.status} compact />
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {match.failures.length > 0 && (
            <div className="mt-4 rounded-xl bg-clay-light/50 p-3">
              <h4 className="mb-1 text-xs font-semibold text-[#8A4F2E]">Doesn’t meet</h4>
              <ul className="space-y-0.5 text-sm text-[#8A4F2E]">
                {match.failures.map((f) => (
                  <li key={f.constraint + f.message}>• {f.message}</li>
                ))}
              </ul>
            </div>
          )}

          {match.unknowns.length > 0 && (
            <div className="mt-4 rounded-xl border border-dashed border-oat p-3">
              <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-mocha">
                <CircleAlert size={13} aria-hidden /> Missing or unverified
              </h4>
              <ul className="space-y-0.5 text-[13px] text-mocha">
                {match.unknowns.map((u) => (
                  <li key={u}>• {u}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Link to={`/cafe/${cafe.slug}`} className="btn-primary !py-2">
              View place
            </Link>
            {dir && (
              <a href={dir} target="_blank" rel="noopener noreferrer" className="btn-ghost !py-2">
                <Navigation size={14} aria-hidden /> Directions
              </a>
            )}
            <span className="ml-auto">
              <SaveButton cafeId={cafe.id} name={cafe.name} />
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

export function ScoreRing({ score }: { score: number }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-14 w-14" title={`Match score ${score}/100 — deterministic, based on your preferences and verified data`}>
      <svg viewBox="0 0 48 48" className="h-14 w-14 -rotate-90">
        <circle cx="24" cy="24" r={r} fill="none" stroke="#EAE0D0" strokeWidth="4" />
        <circle cx="24" cy="24" r={r} fill="none" stroke="#4F5C3F" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-serif text-base font-semibold">{score}</span>
        <span className="text-[8px] uppercase tracking-wider text-latte">match</span>
      </span>
    </div>
  );
}
