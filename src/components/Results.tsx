import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { ConstraintKey, RecommendationResult } from '@/lib/engine';
import { MatchCard } from './MatchCard';
import { EmptyState } from './States';
import { plural } from '@/lib/format';

interface Props {
  result: RecommendationResult;
  onRelax(key: ConstraintKey): void;
  aiNotes?: Record<string, string>;
  limit?: number;
  onShowMore?(): void;
}

/** Below this score a place is "not ruled out" but a poor fit, so it is collapsed by default. */
export const WEAK_MATCH_SCORE = 30;

/** Ranked shortlist + honest "nothing matches" handling with relaxation suggestions. */
export function Results({ result, onRelax, aiNotes = {}, limit = 10, onShowMore }: Props) {
  const { matches, nearMisses, relaxations } = result;
  const [showWeak, setShowWeak] = useState(false);
  const strong = matches.filter((m) => m.score >= WEAK_MATCH_SCORE);
  // If everything is weak, show it all rather than an empty list.
  const visible = showWeak || strong.length === 0 ? matches : strong;
  const weakHidden = matches.length - visible.length;

  const hasMustHaves = matches.some((m) => m.facilityChecks.some((f) => f.required));
  // "Confirmed" = every required facility is known to exist (not merely not ruled out).
  const confirmedAll = matches.filter((m) => m.facilityChecks.every((f) => !f.required || f.available === true)).length;

  return (
    <div className="space-y-6">
      {matches.length === 0 ? (
        <EmptyState title="Nothing matches every requirement" icon={<SlidersHorizontal size={28} aria-hidden />}>
          We won’t show places that fail your must-haves. {relaxations.length > 0 ? 'Here’s what you could relax:' : 'Try removing a requirement or widening the area.'}
        </EmptyState>
      ) : (
        <p className="text-sm text-mocha">
          {strong.length > 0 && strong.length < matches.length
            ? `${plural(strong.length, 'strong match', 'strong matches')} out of ${plural(matches.length, 'place')} that fit your requirements.`
            : `${plural(matches.length, 'place')} ${matches.length === 1 ? 'fits' : 'fit'} your requirements.`}{' '}
          {hasMustHaves &&
            (confirmedAll === matches.length
              ? 'Every one confirms all your must-haves.'
              : confirmedAll > 0
                ? `${confirmedAll} confirm${confirmedAll === 1 ? 's' : ''} every must-have; the rest have details we couldn’t confirm, flagged on each card.`
                : 'None confirm every must-have yet. Unconfirmed details are flagged on each card.')}{' '}
          Ranked by fit; scores drop when information is missing or unverified.
        </p>
      )}

      {relaxations.length > 0 && (
        <div className="rounded-2xl bg-sand/60 p-4">
          <h3 className="mb-2 font-sans text-sm font-semibold text-espresso">{matches.length ? 'Want more options?' : 'Try relaxing one constraint'}</h3>
          <div className="flex flex-wrap gap-2">
            {relaxations.map((r) => (
              <button key={r.constraint} onClick={() => onRelax(r.constraint)} className="chip hover:bg-ivory">
                Drop “{r.label}” <span className="text-sage-dark">+{r.gain}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <ol className="space-y-5">
        {visible.slice(0, limit).map((m, i) => (
          <li key={m.cafe.id}>
            <MatchCard match={m} rank={i + 1} aiNote={aiNotes[m.cafe.id]} />
          </li>
        ))}
      </ol>
      {visible.length > limit && onShowMore && (
        <div className="text-center">
          <button onClick={onShowMore} className="btn-ghost">
            Show more ({visible.length - limit} remaining)
          </button>
        </div>
      )}
      {weakHidden > 0 && visible.length <= limit && (
        <div className="text-center">
          <button onClick={() => setShowWeak(true)} className="btn-link text-mocha">
            Show {plural(weakHidden, 'weaker match', 'weaker matches')}
          </button>
        </div>
      )}

      {matches.length === 0 && nearMisses.length > 0 && (
        <section>
          <h3 className="mb-3 text-xl">Closest, but not a full match</h3>
          <p className="mb-4 text-sm text-mocha">Shown so you can judge for yourself. Each card says exactly which requirement it misses.</p>
          <ol className="space-y-5">
            {nearMisses.map((m) => (
              <li key={m.cafe.id}>
                <MatchCard match={m} />
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
