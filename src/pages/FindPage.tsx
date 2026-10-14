import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LocateFixed, Pencil, Sparkles } from 'lucide-react';
import type { Atmosphere, BudgetBand, FacilityKey, Occasion } from '@/types';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import {
  ATMOSPHERE_LABELS,
  BUDGET_OPTIONS,
  DISTANCE_OPTIONS,
  FACILITY_LABELS,
  NEIGHBOURHOODS,
  OCCASION_LABELS,
  REQUIRABLE_FACILITIES,
  budgetOption,
  neighbourhoodBySlug,
} from '@/lib/taxonomy';
import { DAY_NAMES } from '@/lib/geo';
import { EMPTY_PREFERENCES, recommend, relaxPreferences, type ConstraintKey, type Preferences } from '@/lib/engine';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Results } from '@/components/Results';
import { ErrorState, GridSkeleton } from '@/components/States';

type LocMode = 'anywhere' | 'neighbourhood' | 'current';

interface Form {
  occasion: Occasion | null;
  budget: BudgetBand | null;
  locMode: LocMode;
  area: string;
  atmosphere: Atmosphere[];
  facilities: FacilityKey[];
  distance: number | null;
  foodType: string;
  seating: 'indoor' | 'outdoor' | '';
  minRating: string;
  openDay: string;
  openTime: string;
}

export default function FindPage() {
  useDocumentTitle('Find My Place');
  const { cafes, loading, error, retry, ratings } = useData();
  const { profile } = useAuth();
  const [params] = useSearchParams();
  const geo = useGeolocation();
  const resultsRef = useRef<HTMLDivElement>(null);
  const [limit, setLimit] = useState(10);

  const initialArea = neighbourhoodBySlug(params.get('area'))?.slug ?? profile?.preferredNeighbourhood ?? '';
  const [form, setForm] = useState<Form>({
    occasion: (params.get('occasion') as Occasion) in OCCASION_LABELS ? (params.get('occasion') as Occasion) : null,
    budget: budgetOption(params.get('budget') as BudgetBand)?.band ?? profile?.preferredBudget ?? null,
    locMode: initialArea ? 'neighbourhood' : 'anywhere',
    area: initialArea || 'park-street',
    atmosphere: [],
    facilities: [],
    distance: null,
    foodType: '',
    seating: '',
    minRating: '',
    openDay: String(new Date().getDay()),
    openTime: '',
  });
  const [submitted, setSubmitted] = useState<Preferences | null>(null);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const foodTypes = useMemo(() => Array.from(new Set(cafes.flatMap((c) => c.foodTypes))).sort(), [cafes]);
  const anyRatings = ratings.size > 0;

  const toPrefs = (f: Form): Preferences => ({
    ...EMPTY_PREFERENCES,
    occasion: f.occasion,
    budget: f.budget,
    location:
      f.locMode === 'current' && geo.coords
        ? { mode: 'current', ...geo.coords }
        : f.locMode === 'neighbourhood'
          ? { mode: 'neighbourhood', slug: f.area }
          : { mode: 'anywhere' },
    atmosphere: f.atmosphere,
    requiredFacilities: f.facilities,
    maxDistanceKm: f.locMode === 'anywhere' ? null : f.distance,
    foodType: f.foodType || null,
    seating: f.seating || null,
    minRating: f.minRating ? Number(f.minRating) : null,
    openAt: f.openTime ? { day: Number(f.openDay), time: f.openTime } : null,
  });

  const submit = () => {
    setSubmitted(toPrefs(form));
    setLimit(10);
    window.setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const result = useMemo(() => (submitted ? recommend(cafes, submitted, { ratings }) : null), [submitted, cafes, ratings]);

  const relax = (key: ConstraintKey) => {
    if (!submitted) return;
    const next = relaxPreferences(submitted, key);
    setSubmitted(next);
    // Mirror the change in the form so "edit" stays truthful.
    setForm((f) => ({
      ...f,
      budget: key === 'budget' ? 'flexible' : f.budget,
      locMode: key === 'location' ? 'anywhere' : f.locMode,
      distance: key === 'distance' ? null : f.distance,
      seating: key === 'seating' ? '' : f.seating,
      minRating: key === 'minRating' ? '' : f.minRating,
      openTime: key === 'openAt' ? '' : f.openTime,
      facilities: key.startsWith('facility:') ? f.facilities.filter((x) => `facility:${x}` !== key) : f.facilities,
    }));
  };

  const pickCurrentLocation = async () => {
    set('locMode', 'current');
    const c = await geo.request();
    if (!c) set('locMode', 'neighbourhood');
  };

  return (
    <div className="page pt-10">
      <header className="max-w-2xl">
        <p className="eyebrow">Find My Place</p>
        <h1 className="mt-2 text-4xl sm:text-5xl">Tell us the plan. We’ll shortlist the places.</h1>
        <p className="mt-3 text-mocha">
          Everything is optional. Must-haves are strict: we never count unknown information as a yes, and we tell you what’s missing.
        </p>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <Step n={1} title="What’s the occasion?">
            <ChipGroup>
              {(Object.keys(OCCASION_LABELS) as Occasion[]).map((o) => (
                <Chip key={o} on={form.occasion === o} onClick={() => set('occasion', form.occasion === o ? null : o)}>
                  {OCCASION_LABELS[o]}
                </Chip>
              ))}
            </ChipGroup>
          </Step>

          <Step n={2} title="Budget per person">
            <ChipGroup>
              {BUDGET_OPTIONS.map((b) => (
                <Chip key={b.band} on={form.budget === b.band} onClick={() => set('budget', form.budget === b.band ? null : b.band)}>
                  {b.label}
                </Chip>
              ))}
            </ChipGroup>
          </Step>

          <Step n={3} title="Where?">
            <ChipGroup>
              <Chip on={form.locMode === 'current'} onClick={() => void pickCurrentLocation()}>
                <LocateFixed size={14} aria-hidden /> {geo.status === 'requesting' ? 'Locating…' : 'Current location'}
              </Chip>
              <Chip on={form.locMode === 'neighbourhood'} onClick={() => set('locMode', 'neighbourhood')}>
                A neighbourhood
              </Chip>
              <Chip on={form.locMode === 'anywhere'} onClick={() => set('locMode', 'anywhere')}>
                Anywhere in Kolkata
              </Chip>
            </ChipGroup>
            {geo.message && <p className="mt-2 text-sm text-clay">{geo.message}</p>}
            {form.locMode === 'current' && geo.coords && <p className="mt-2 text-xs text-latte">Using your device location for this search only. It isn’t stored or sent anywhere.</p>}
            {form.locMode === 'neighbourhood' && (
              <select value={form.area} onChange={(e) => set('area', e.target.value)} className="input mt-3 !py-2.5 sm:max-w-xs" aria-label="Neighbourhood">
                {NEIGHBOURHOODS.map((n) => (
                  <option key={n.slug} value={n.slug}>
                    {n.name}
                  </option>
                ))}
              </select>
            )}
            {form.locMode !== 'anywhere' && (
              <div className="mt-4">
                <p className="label">Travel distance {form.locMode === 'neighbourhood' && <span className="font-normal text-latte">(from the neighbourhood centre)</span>}</p>
                <ChipGroup>
                  {DISTANCE_OPTIONS.map((d) => (
                    <Chip key={d.label} on={form.distance === d.value} onClick={() => set('distance', d.value)}>
                      {d.value == null && form.locMode === 'neighbourhood' ? 'Anywhere in the neighbourhood' : d.label}
                    </Chip>
                  ))}
                </ChipGroup>
              </div>
            )}
          </Step>

          <Step n={4} title="Atmosphere" hint="Preferences that shape the ranking">
            <ChipGroup>
              {(Object.keys(ATMOSPHERE_LABELS) as Atmosphere[]).map((a) => (
                <Chip key={a} on={form.atmosphere.includes(a)} onClick={() => set('atmosphere', toggle(form.atmosphere, a))}>
                  {ATMOSPHERE_LABELS[a]}
                </Chip>
              ))}
            </ChipGroup>
          </Step>

          <Step n={5} title="Must-have facilities" hint="Strict: places confirmed without them are excluded">
            <ChipGroup>
              {REQUIRABLE_FACILITIES.map((f) => (
                <Chip key={f} on={form.facilities.includes(f)} onClick={() => set('facilities', toggle(form.facilities, f))}>
                  {FACILITY_LABELS[f]}
                </Chip>
              ))}
            </ChipGroup>
          </Step>

          <Step n={6} title="Anything else?" hint="Optional">
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className="label">Preferred food</span>
                <select value={form.foodType} onChange={(e) => set('foodType', e.target.value)} className="input !py-2.5">
                  <option value="">No preference</option>
                  {foodTypes.map((f) => (
                    <option key={f} value={f.toLowerCase()}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label">Seating</span>
                <select value={form.seating} onChange={(e) => set('seating', e.target.value as Form['seating'])} className="input !py-2.5">
                  <option value="">Indoor or outdoor</option>
                  <option value="indoor">Indoor</option>
                  <option value="outdoor">Outdoor</option>
                </select>
              </label>
              <label>
                <span className="label">Minimum rating</span>
                <select value={form.minRating} onChange={(e) => set('minRating', e.target.value)} className="input !py-2.5" disabled={!anyRatings}>
                  <option value="">Any</option>
                  {['3', '3.5', '4', '4.5'].map((r) => (
                    <option key={r} value={r}>
                      {r}+ stars
                    </option>
                  ))}
                </select>
                {!anyRatings && <span className="mt-1 block text-xs text-latte">No places have reviews yet, so this filter is off.</span>}
              </label>
              <div>
                <span className="label">Open at</span>
                <div className="flex gap-2">
                  <select value={form.openDay} onChange={(e) => set('openDay', e.target.value)} className="input !py-2.5" aria-label="Day">
                    {DAY_NAMES.map((d, i) => (
                      <option key={d} value={i}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <input type="time" value={form.openTime} onChange={(e) => set('openTime', e.target.value)} className="input !py-2.5" aria-label="Time" />
                </div>
                <span className="mt-1 block text-xs text-latte">Only places with known hours can be confirmed open.</span>
              </div>
            </div>
          </Step>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="card p-5">
            <h2 className="text-xl">Your plan</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Row k="Occasion" v={form.occasion ? OCCASION_LABELS[form.occasion] : 'Any'} />
              <Row k="Budget" v={budgetOption(form.budget)?.label ?? 'Any'} />
              <Row
                k="Where"
                v={form.locMode === 'anywhere' ? 'Anywhere' : form.locMode === 'current' ? (geo.coords ? 'Near you' : 'Waiting for location') : neighbourhoodBySlug(form.area)?.name ?? ''}
              />
              {form.locMode !== 'anywhere' && form.distance != null && <Row k="Distance" v={`≤ ${form.distance} km`} />}
              <Row k="Must-haves" v={form.facilities.length ? form.facilities.map((f) => FACILITY_LABELS[f]).join(', ') : 'None'} />
            </dl>
            <button onClick={submit} className="btn-primary mt-5 w-full !py-3" disabled={loading || !!error}>
              <Sparkles size={16} aria-hidden /> {submitted ? 'Update shortlist' : 'Find My Place'}
            </button>
          </div>
        </aside>
      </div>

      <div ref={resultsRef} className="scroll-mt-32 pt-12">
        {error ? (
          <ErrorState message={error} onRetry={retry} />
        ) : loading && submitted ? (
          <GridSkeleton count={3} />
        ) : result ? (
          <>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-3xl">Your shortlist</h2>
              <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="btn-link">
                <Pencil size={14} aria-hidden /> Edit preferences
              </button>
            </div>
            <Results result={result} onRelax={relax} limit={limit} onShowMore={() => setLimit((l) => l + 10)} />
          </>
        ) : null}
      </div>
    </div>
  );
}

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="card p-5 sm:p-6" aria-labelledby={`step-${n}`}>
      <div className="mb-3 flex items-baseline gap-3">
        <span className="font-serif text-sm text-latte">0{n}</span>
        <h2 id={`step-${n}`} className="text-xl">
          {title}
        </h2>
        {hint && <span className="text-xs text-latte">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function ChipGroup({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

function Chip({ on, onClick, children }: { on: boolean; onClick(): void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`chip !py-2 ${on ? 'chip-on' : ''}`}>
      {children}
    </button>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-latte">{k}</dt>
      <dd className="text-right text-espresso">{v}</dd>
    </div>
  );
}
