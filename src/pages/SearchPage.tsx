import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bot, LocateFixed, Search, SlidersHorizontal, Wand2 } from 'lucide-react';
import type { BudgetBand } from '@/types';
import { useData } from '@/context/DataContext';
import { budgetOption, neighbourhoodBySlug } from '@/lib/taxonomy';
import { recommend, relaxPreferences, type ConstraintKey, type Preferences } from '@/lib/engine';
import { explainMatches, interpretQuery, type InterpretResult } from '@/lib/ai';
import { config } from '@/lib/config';
import { searchQuerySchema } from '@/lib/validation';
import { Results } from '@/components/Results';
import { ErrorState, GridSkeleton } from '@/components/States';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const SUGGESTIONS = [
  'Find me a quiet café in South Kolkata where I can study for three hours, charge my laptop, and spend less than ₹400.',
  'Suggest a cosy date café near Park Street.',
  'Find affordable cafés with good desserts in Salt Lake.',
  'Show me laptop-friendly places with Wi-Fi and comfortable seating.',
  'Somewhere open late with outdoor seating for a birthday',
];

export default function SearchPage() {
  useDocumentTitle('Search');
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const { cafes, loading, error, retry, ratings } = useData();
  const geo = useGeolocation();
  const [input, setInput] = useState(q);
  const [interp, setInterp] = useState<InterpretResult | null>(null);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiNotes, setAiNotes] = useState<Record<string, string>>({});
  const [inputError, setInputError] = useState<string | null>(null);
  const [limit, setLimit] = useState(10);

  useEffect(() => setInput(q), [q]);

  // Interpret the query whenever it (or the hero's area/budget) changes.
  useEffect(() => {
    if (!q) {
      setInterp(null);
      setPrefs(null);
      return;
    }
    let active = true;
    setBusy(true);
    setAiNotes({});
    interpretQuery(q).then((res) => {
      if (!active) return;
      const p = { ...res.prefs };
      // Explicit selections from the hero override nothing the text already said.
      const area = neighbourhoodBySlug(params.get('area'));
      if (area && p.location.mode === 'anywhere') p.location = { mode: 'neighbourhood', slug: area.slug };
      const band = budgetOption(params.get('budget') as BudgetBand);
      if (band && p.maxBudget == null && !p.budget) p.budget = band.band;
      setInterp(res);
      setPrefs(p);
      setLimit(10);
      setBusy(false);
    });
    return () => {
      active = false;
    };
  }, [q, params]);

  const result = useMemo(() => (prefs ? recommend(cafes, prefs, { ratings }) : null), [prefs, cafes, ratings]);

  // Optional AI explanations — only for records the engine already chose.
  useEffect(() => {
    if (!result || !config.aiSearchEnabled || !q) return;
    let active = true;
    explainMatches(q, result.matches).then((notes) => active && setAiNotes(notes));
    return () => {
      active = false;
    };
  }, [result, q]);

  const submit = (e?: FormEvent, text = input) => {
    e?.preventDefault();
    const parsed = searchQuerySchema.safeParse(text);
    if (!parsed.success) {
      setInputError(parsed.error.issues[0]?.message ?? 'Invalid search');
      return;
    }
    setInputError(null);
    const next = new URLSearchParams();
    if (parsed.data) next.set('q', parsed.data);
    setParams(next);
  };

  const nearMe = async () => {
    const c = await geo.request();
    if (c && prefs) setPrefs({ ...prefs, location: { mode: 'current', ...c }, maxDistanceKm: prefs.maxDistanceKm ?? 5 });
  };

  const relax = (key: ConstraintKey) => prefs && setPrefs(relaxPreferences(prefs, key));

  return (
    <div className="page pt-10">
      <p className="eyebrow">Search</p>
      <h1 className="mt-2 text-4xl sm:text-5xl">Describe it. We’ll find it.</h1>

      <form onSubmit={submit} className="mt-6 flex flex-col gap-2 sm:flex-row" role="search">
        <label className="relative flex-1">
          <span className="sr-only">Describe the place you want</span>
          <Search size={18} className="absolute left-4 top-4 text-latte" aria-hidden />
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            maxLength={300}
            placeholder="e.g. A quiet café near Gariahat with Wi-Fi, under ₹300"
            className="input min-h-[56px] resize-none !rounded-2xl !pl-11"
            autoFocus={!q}
          />
        </label>
        <button type="submit" className="btn-primary !py-3.5 sm:self-start">
          Search
        </button>
      </form>
      {inputError && <p className="mt-2 text-sm text-clay">{inputError}</p>}

      {!q && (
        <div className="mt-8">
          <p className="label">Try one of these</p>
          <div className="flex flex-col gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => submit(undefined, s)} className="rounded-2xl border border-oat bg-ivory px-4 py-3 text-left text-sm text-mocha hover:border-latte/60">
                “{s}”
              </button>
            ))}
          </div>
          <p className="mt-6 text-sm text-mocha">
            Prefer to pick options?{' '}
            <Link to="/find" className="underline">
              Use the guided Find My Place
            </Link>
            .
          </p>
        </div>
      )}

      {q && (
        <div className="mt-6">
          {interp && (
            <div className="rounded-2xl bg-sand/50 p-4">
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-latte">
                {interp.engine === 'ai' ? <Bot size={14} aria-hidden /> : <Wand2 size={14} aria-hidden />}
                {interp.engine === 'ai' ? `Understood with AI assistance (${interp.provider})` : 'What we understood'}
              </p>
              {interp.understood.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {interp.understood.map((u, i) => (
                    <span key={`${u.kind}-${u.label}-${i}`} className="rounded-full bg-ivory px-3 py-1 text-[13px] text-espresso">
                      <span className="text-latte">{u.kind}:</span> {u.label}
                    </span>
                  ))}
                  {params.get('area') && <span className="rounded-full bg-ivory px-3 py-1 text-[13px]"><span className="text-latte">area:</span> {neighbourhoodBySlug(params.get('area'))?.name}</span>}
                </div>
              ) : (
                <p className="text-sm text-mocha">We couldn’t pick out specific preferences, so we matched on your words instead.</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {interp.wantsNearby && prefs?.location.mode !== 'current' && (
                  <button onClick={() => void nearMe()} className="chip">
                    <LocateFixed size={14} aria-hidden /> {geo.status === 'requesting' ? 'Locating…' : 'Use my location for “near me”'}
                  </button>
                )}
                <Link to="/find" className="chip">
                  <SlidersHorizontal size={14} aria-hidden /> Refine with filters
                </Link>
              </div>
              {geo.message && <p className="mt-2 text-sm text-clay">{geo.message}</p>}
            </div>
          )}

          <div className="mt-8">
            {error ? (
              <ErrorState message={error} onRetry={retry} />
            ) : loading || busy || !result ? (
              <GridSkeleton count={3} />
            ) : (
              <Results result={result} onRelax={relax} aiNotes={aiNotes} limit={limit} onShowMore={() => setLimit((l) => l + 10)} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
