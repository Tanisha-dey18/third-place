import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LayoutGrid, LocateFixed, Map as MapIcon, Search, SlidersHorizontal, X } from 'lucide-react';
import type { Atmosphere, BudgetBand, Cafe, FacilityKey, Occasion } from '@/types';
import { useData } from '@/context/DataContext';
import {
  ATMOSPHERE_LABELS,
  BUDGET_OPTIONS,
  FACILITY_LABELS,
  NEIGHBOURHOODS,
  OCCASION_LABELS,
  REQUIRABLE_FACILITIES,
  budgetOption,
  neighbourhoodBySlug,
  neighbourhoodName,
} from '@/lib/taxonomy';
import { applyFilters, sortCafes, SORT_LABELS, type ExploreFilters, type SortKey } from '@/lib/filters';
import { EMPTY_PREFERENCES, scoreCafe } from '@/lib/engine';
import { cafeDistanceKm } from '@/lib/geo';
import { CafeCard } from '@/components/CafeCard';
import { LazyMap } from '@/components/LazyMap';
import { Modal } from '@/components/Modal';
import { EmptyState, ErrorState, GridSkeleton } from '@/components/States';
import { SmartImage } from '@/components/SmartImage';
import { useDebounced } from '@/hooks/useDebounced';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { Mood } from '@/lib/moods';

export interface ExplorePreset {
  eyebrow: string;
  title: string;
  blurb: string;
  image?: string;
  match?: Mood['match'] & { tag?: string };
  rankOccasion?: Occasion | null;
  rankAtmosphere?: Atmosphere[];
  suggestedFacilities?: FacilityKey[];
}

const PAGE = 12;
const csv = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);

export default function ExplorePage({ preset }: { preset?: ExplorePreset }) {
  const { cafes, loading, error, retry, ratings } = useData();
  const [params, setParams] = useSearchParams();
  const geo = useGeolocation();
  const [sheet, setSheet] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [hovered, setHovered] = useState<string | null>(null);
  const [text, setText] = useState(params.get('q') ?? '');
  const debounced = useDebounced(text, 250);
  useDocumentTitle(preset?.title ?? 'Explore');

  // URL is the source of truth for filters, so every view is shareable.
  const filters: ExploreFilters = {
    q: params.get('q') ?? '',
    area: neighbourhoodBySlug(params.get('area')) ? params.get('area') : null,
    budget: (budgetOption(params.get('budget') as BudgetBand)?.band ?? null) as BudgetBand | null,
    maxPrice: null,
    occasion: (params.get('occasion') as Occasion) in OCCASION_LABELS ? (params.get('occasion') as Occasion) : null,
    atmosphere: csv(params.get('atmos')).filter((a): a is Atmosphere => a in ATMOSPHERE_LABELS),
    facilities: csv(params.get('fac')).filter((f): f is FacilityKey => f in FACILITY_LABELS),
    tag: null,
  };
  const sort = ((params.get('sort') as SortKey) in SORT_LABELS ? params.get('sort') : 'relevance') as SortKey;
  const view = params.get('view') === 'map' ? 'map' : 'list';

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
    setLimit(PAGE);
  };

  useEffect(() => {
    if (debounced !== (params.get('q') ?? '')) update({ q: debounced.trim() || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const origin = geo.coords ?? (filters.area ? (() => { const n = neighbourhoodBySlug(filters.area); return n ? { lat: n.lat, lng: n.lng } : null; })() : null);

  const { list, hiddenUnknown, presetCount } = useMemo(() => {
    // Preset (mood / hidden gems) narrows the pool first.
    const m = preset?.match;
    const pool = m
      ? cafes.filter(
          (c) =>
            (!m.occasions?.length || m.occasions.some((o) => c.occasions.includes(o))) &&
            (!m.atmosphere?.length || m.atmosphere.some((a) => c.atmosphere.includes(a))) &&
            (m.maxPrice == null || (c.priceMin != null && c.priceMin <= m.maxPrice)) &&
            (!m.tag || c.tags.includes(m.tag)),
        )
      : cafes;
    const out = applyFilters(pool, filters);
    // Relevance uses the same deterministic engine as Find My Place.
    const prefs = {
      ...EMPTY_PREFERENCES,
      occasion: filters.occasion ?? preset?.rankOccasion ?? null,
      atmosphere: filters.atmosphere.length ? filters.atmosphere : preset?.rankAtmosphere ?? [],
      keywords: filters.q ? filters.q.toLowerCase().split(/\s+/) : [],
      location: origin ? ({ mode: 'current', ...origin } as const) : ({ mode: 'anywhere' } as const),
    };
    const scores = new Map(out.list.map((c) => [c.id, scoreCafe(c, prefs, { ratings }).score]));
    return { list: sortCafes(out.list, sort, { origin, ratings, scores }), hiddenUnknown: out.hiddenUnknown, presetCount: pool.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cafes, params, ratings, origin?.lat, origin?.lng, preset]);

  const distances = useMemo(() => new Map(list.map((c) => [c.id, cafeDistanceKm(c, origin)])), [list, origin]);
  const activeCount = (filters.area ? 1 : 0) + (filters.budget ? 1 : 0) + (filters.occasion ? 1 : 0) + filters.atmosphere.length + filters.facilities.length;
  const ratedCount = list.filter((c) => ratings.get(c.id)?.count).length;

  const toggleIn = (key: 'atmos' | 'fac', value: string) => {
    const cur = csv(params.get(key));
    update({ [key]: (cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value]).join(',') || null });
  };

  return (
    <div>
      {preset ? (
        <section className="relative overflow-hidden bg-espresso text-ivory">
          {preset.image && <SmartImage src={preset.image} alt="" className="absolute inset-0 h-full w-full opacity-35" width={1400} eager />}
          <div className="absolute inset-0 bg-gradient-to-r from-espresso via-espresso/80 to-espresso/30" />
          <div className="page relative py-14 sm:py-20">
            <p className="eyebrow !text-ivory/70">{preset.eyebrow}</p>
            <h1 className="mt-2 text-4xl sm:text-6xl">{preset.title}</h1>
            <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-ivory/85">{preset.blurb}</p>
            <p className="mt-4 text-xs text-ivory/60">{presetCount} place{presetCount === 1 ? '' : 's'} in this category · refine below</p>
          </div>
        </section>
      ) : (
        <section className="page pb-2 pt-10">
          <p className="eyebrow">Explore Kolkata</p>
          <h1 className="mt-2 text-4xl sm:text-5xl">{filters.area ? `Cafés in ${neighbourhoodName(filters.area)}` : 'Every place, your filters'}</h1>
          {filters.area && <p className="mt-2 max-w-xl text-mocha">{neighbourhoodBySlug(filters.area)?.blurb}</p>}
        </section>
      )}

      {/* Toolbar */}
      <div className="z-[400] border-b border-oat/60 bg-cream/90 backdrop-blur-md lg:sticky lg:top-16">
        <div className="page flex flex-wrap items-center gap-2 py-3">
          <label className="relative min-w-[200px] flex-1">
            <span className="sr-only">Search by name, dish or neighbourhood</span>
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-latte" aria-hidden />
            <input
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 80))}
              placeholder="Search by name, dish or area"
              className="input !rounded-full !py-2.5 !pl-10"
              type="search"
            />
          </label>
          <button onClick={() => setSheet(true)} className={`chip !py-2.5 ${activeCount ? 'chip-on' : ''}`} aria-haspopup="dialog">
            <SlidersHorizontal size={15} aria-hidden /> Filters{activeCount ? ` · ${activeCount}` : ''}
          </button>
          <label className="chip !py-2.5">
            <span className="sr-only">Sort by</span>
            <select value={sort} onChange={(e) => update({ sort: e.target.value === 'relevance' ? null : e.target.value })} className="bg-transparent focus:outline-none">
              {Object.entries(SORT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <div className="flex rounded-full border border-oat bg-ivory p-0.5" role="group" aria-label="View">
            <button onClick={() => update({ view: null })} aria-pressed={view === 'list'} className={`rounded-full px-3 py-2 ${view === 'list' ? 'bg-espresso text-ivory' : 'text-mocha'}`} aria-label="List view">
              <LayoutGrid size={16} />
            </button>
            <button onClick={() => update({ view: 'map' })} aria-pressed={view === 'map'} className={`rounded-full px-3 py-2 ${view === 'map' ? 'bg-espresso text-ivory' : 'text-mocha'}`} aria-label="Map view">
              <MapIcon size={16} />
            </button>
          </div>
        </div>
        {(activeCount > 0 || !!preset?.suggestedFacilities?.length) && (
          <div className="page flex gap-1.5 overflow-x-auto pb-3 [scrollbar-width:none]">
            {preset?.suggestedFacilities
              ?.filter((f) => !filters.facilities.includes(f))
              .map((f) => (
                <button key={`s-${f}`} onClick={() => toggleIn('fac', f)} className="chip !border-dashed">
                  + Must have {FACILITY_LABELS[f].toLowerCase()}
                </button>
              ))}
            {filters.area && <ActiveChip label={neighbourhoodName(filters.area)} onClear={() => update({ area: null })} />}
            {filters.budget && <ActiveChip label={budgetOption(filters.budget)!.label} onClear={() => update({ budget: null })} />}
            {filters.occasion && <ActiveChip label={OCCASION_LABELS[filters.occasion]} onClear={() => update({ occasion: null })} />}
            {filters.atmosphere.map((a) => (
              <ActiveChip key={a} label={ATMOSPHERE_LABELS[a]} onClear={() => toggleIn('atmos', a)} />
            ))}
            {filters.facilities.map((f) => (
              <ActiveChip key={f} label={`Must have ${FACILITY_LABELS[f].toLowerCase()}`} onClear={() => toggleIn('fac', f)} />
            ))}
            {activeCount > 1 && (
              <button onClick={() => update({ area: null, budget: null, occasion: null, atmos: null, fac: null })} className="btn-link shrink-0 px-2">
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      <div className="page pt-6">
        {sort === 'distance' && !origin && (
          <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl bg-sand/60 p-4 text-sm">
            <span className="flex-1">Distance sorting needs a starting point. Share your location or pick a neighbourhood.</span>
            <button onClick={() => void geo.request()} className="btn-primary !py-2">
              <LocateFixed size={14} aria-hidden /> {geo.status === 'requesting' ? 'Locating…' : 'Use my location'}
            </button>
            <button onClick={() => setSheet(true)} className="btn-ghost !py-2">
              Choose area
            </button>
          </div>
        )}
        {geo.message && <p className="mb-4 text-sm text-clay">{geo.message}</p>}
        {sort === 'rating' && ratedCount === 0 && list.length > 0 && (
          <p className="mb-4 text-sm text-mocha">None of these places has any reviews yet, so they’re listed alphabetically. Ratings only come from real reviews.</p>
        )}

        {error ? (
          <ErrorState message={error} onRetry={retry} />
        ) : loading ? (
          <GridSkeleton />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm text-mocha" aria-live="polite">
                <strong className="text-espresso">{list.length}</strong> place{list.length === 1 ? '' : 's'}
                {origin && geo.coords ? ' · distances from your location' : origin ? ` · distances from ${neighbourhoodName(filters.area)} centre` : ''}
              </p>
              {hiddenUnknown > 0 && (
                <p className="text-xs text-latte">
                  {hiddenUnknown} more hidden because a facility or price you asked for isn’t confirmed there.
                </p>
              )}
            </div>

            {list.length === 0 ? (
              <EmptyState
                title="No places match these filters"
                action={
                  <button onClick={() => { setText(''); update({ q: null, area: null, budget: null, occasion: null, atmos: null, fac: null }); }} className="btn-primary">
                    Reset filters
                  </button>
                }
              >
                Try removing a facility requirement or widening the area. Or describe what you need in{' '}
                <Link to="/find" className="underline">
                  Find My Place
                </Link>
                , which tells you exactly what to relax.
              </EmptyState>
            ) : view === 'map' ? (
              <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
                <LazyMap cafes={list} selectedId={hovered} onSelect={setHovered} origin={geo.coords} className="h-[60vh] min-h-[380px] lg:sticky lg:top-40 lg:h-[calc(100vh-11rem)]" />
                <ul className="space-y-4">
                  {list.slice(0, limit).map((c) => (
                    <li key={c.id}>
                      <CafeCard cafe={c} distanceKm={distances.get(c.id)} highlighted={hovered === c.id} onHover={setHovered} />
                    </li>
                  ))}
                  {list.length > limit && <LoadMore onClick={() => setLimit((l) => l + PAGE)} remaining={list.length - limit} />}
                </ul>
              </div>
            ) : (
              <>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {list.slice(0, limit).map((c: Cafe, i) => (
                    <CafeCard key={c.id} cafe={c} distanceKm={distances.get(c.id)} eager={i < 3} facilityKeys={filters.facilities.length ? filters.facilities : undefined} />
                  ))}
                </div>
                {list.length > limit && <LoadMore onClick={() => setLimit((l) => l + PAGE)} remaining={list.length - limit} />}
              </>
            )}
          </>
        )}
      </div>

      <Modal open={sheet} onClose={() => setSheet(false)} title="Filters" wide>
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField label="Neighbourhood" value={filters.area ?? ''} onChange={(v) => update({ area: v || null })}>
              <option value="">Anywhere in Kolkata</option>
              {NEIGHBOURHOODS.map((n) => (
                <option key={n.slug} value={n.slug}>
                  {n.name}
                </option>
              ))}
            </SelectField>
            <SelectField label="Budget per person" value={filters.budget ?? ''} onChange={(v) => update({ budget: v || null })}>
              <option value="">Any budget</option>
              {BUDGET_OPTIONS.filter((b) => b.band !== 'flexible').map((b) => (
                <option key={b.band} value={b.band}>
                  {b.label}
                </option>
              ))}
            </SelectField>
            <SelectField label="Occasion" value={filters.occasion ?? ''} onChange={(v) => update({ occasion: v || null })}>
              <option value="">Any occasion</option>
              {Object.entries(OCCASION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </SelectField>
          </div>
          <fieldset>
            <legend className="label">Atmosphere <span className="font-normal text-latte">(any of)</span></legend>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(ATMOSPHERE_LABELS) as Atmosphere[]).map((a) => (
                <button key={a} type="button" aria-pressed={filters.atmosphere.includes(a)} onClick={() => toggleIn('atmos', a)} className={`chip ${filters.atmosphere.includes(a) ? 'chip-on' : ''}`}>
                  {ATMOSPHERE_LABELS[a]}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="label">Must have <span className="font-normal text-latte">(all of, confirmed only)</span></legend>
            <div className="flex flex-wrap gap-2">
              {REQUIRABLE_FACILITIES.map((f) => (
                <button key={f} type="button" aria-pressed={filters.facilities.includes(f)} onClick={() => toggleIn('fac', f)} className={`chip ${filters.facilities.includes(f) ? 'chip-on' : ''}`}>
                  {FACILITY_LABELS[f]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-latte">Places where a facility is unknown or only unverified are hidden, not assumed.</p>
          </fieldset>
          <div className="flex items-center justify-between gap-3 border-t border-oat pt-4">
            <button onClick={() => update({ area: null, budget: null, occasion: null, atmos: null, fac: null })} className="btn-link">
              Clear all
            </button>
            <button onClick={() => setSheet(false)} className="btn-primary">
              Show {list.length} place{list.length === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ActiveChip({ label, onClear }: { label: string; onClear(): void }) {
  return (
    <button onClick={onClear} className="chip chip-on shrink-0" aria-label={`Remove filter ${label}`}>
      {label} <X size={13} aria-hidden />
    </button>
  );
}

function LoadMore({ onClick, remaining }: { onClick(): void; remaining: number }) {
  return (
    <div className="mt-8 text-center">
      <button onClick={onClick} className="btn-ghost">
        Load more <span className="text-latte">({remaining})</span>
      </button>
    </div>
  );
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange(v: string): void; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input !py-2.5">
        {children}
      </select>
    </label>
  );
}
