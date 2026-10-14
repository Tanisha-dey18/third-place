import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LayoutGrid, Map as MapIcon, Search, SlidersHorizontal, X, Info } from 'lucide-react';
import type { Atmosphere, BudgetBand, Cafe, FacilityKey, Occasion, PlaceCategory } from '@/types';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { ATMOSPHERE_LABELS, BUDGET_OPTIONS, FACILITY_LABELS, REQUIRABLE_FACILITIES, budgetOption, neighbourhoodBySlug } from '@/lib/taxonomy';
import { applyFilters, cuisineFacets, sortCafes, SORT_LABELS, EMPTY_FILTERS, type ExploreFilters, type SortKey } from '@/lib/filters';
import { EMPTY_PREFERENCES, scoreCafe } from '@/lib/engine';
import { cafeDistanceKm } from '@/lib/geo';
import { areaCentre, areaKey, areaLabel, type AreaSelection } from '@/lib/places/area';
import { LIMITS } from '@/lib/places/query';
import type { Bounds } from '@/lib/cities';
import { useAreaPlaces, useNameSearch } from '@/hooks/usePlaces';
import { useDebounced } from '@/hooks/useDebounced';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { CafeCard, CATEGORY_LABELS } from '@/components/CafeCard';
import { LazyMap } from '@/components/LazyMap';
import { Modal } from '@/components/Modal';
import { EmptyState } from '@/components/States';
import { SmartImage } from '@/components/SmartImage';
import { AreaPicker } from '@/components/AreaPicker';
import { DataSourceNote } from '@/components/DataSourceNote';
import { NoPlacesHere, PlacesStateView } from '@/components/PlacesState';
import type { Mood } from '@/lib/moods';

export interface ExplorePreset {
  eyebrow: string;
  title: string;
  blurb: string;
  image?: string;
  /** Hard filters only where data can support them: a known price ceiling or a curated tag. */
  match?: Mood['match'] & { tag?: string };
  rankOccasion?: Occasion | null;
  rankAtmosphere?: Atmosphere[];
  suggestedFacilities?: FacilityKey[];
  /** Explains how this mood is ranked with the data available. */
  evidenceNote?: string;
}

const PAGE = 12;
const csv = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);
const CATEGORIES: PlaceCategory[] = ['cafe', 'coffee_shop_restaurant', 'ice_cream'];

function areaFromParams(params: URLSearchParams, fallback: string): AreaSelection {
  const a = params.get('area');
  if (a === 'city') return { kind: 'city' };
  if (a && neighbourhoodBySlug(a)) return { kind: 'neighbourhood', slug: a };
  const near = params.get('near')?.split(',').map(Number);
  if (near && near.length === 2 && near.every(Number.isFinite)) {
    return { kind: 'near', lat: near[0], lng: near[1], radiusKm: 1.5, label: (params.get('label') ?? 'Selected area').slice(0, 60), device: false };
  }
  return { kind: 'neighbourhood', slug: fallback };
}

export default function ExplorePage({ preset }: { preset?: ExplorePreset }) {
  const { ratings } = useData();
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const [sheet, setSheet] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [hovered, setHovered] = useState<string | null>(null);
  const [text, setText] = useState(params.get('q') ?? '');
  const [deviceArea, setDeviceArea] = useState<AreaSelection | null>(null);
  const [mapBounds, setMapBounds] = useState<Bounds | null>(null);
  const [zoomHint, setZoomHint] = useState(false);
  const debouncedText = useDebounced(text.trim(), 400);
  useDocumentTitle(preset?.title ?? 'Explore');

  const baseArea = deviceArea ?? areaFromParams(params, profile?.preferredNeighbourhood ?? 'park-street');
  const view = params.get('view') === 'map' ? 'map' : 'list';
  // In map view the visible map area drives discovery once the user moves the map.
  const dataArea: AreaSelection = view === 'map' && mapBounds ? { kind: 'bounds', bounds: mapBounds } : baseArea;
  const nameMode = debouncedText.length >= 3;

  const areaState = useAreaPlaces(nameMode ? null : dataArea);
  const nameState = useNameSearch(nameMode ? debouncedText : '');
  const state = nameMode ? nameState : areaState;

  const filters: ExploreFilters = {
    ...EMPTY_FILTERS,
    q: nameMode ? '' : text.trim(),
    budget: (budgetOption(params.get('budget') as BudgetBand)?.band ?? null) as BudgetBand | null,
    atmosphere: csv(params.get('atmos')).filter((a): a is Atmosphere => a in ATMOSPHERE_LABELS),
    facilities: csv(params.get('fac')).filter((f): f is FacilityKey => f in FACILITY_LABELS),
    categories: csv(params.get('cat')).filter((c): c is PlaceCategory => CATEGORIES.includes(c as PlaceCategory)),
    cuisine: params.get('cuisine'),
    openNow: params.get('open') === '1',
    maxPrice: preset?.match?.maxPrice ?? null,
    tag: preset?.match?.tag ?? null,
  };
  const sort = ((params.get('sort') as SortKey) in SORT_LABELS ? params.get('sort') : 'relevance') as SortKey;

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
    if (text.trim() !== (params.get('q') ?? '')) update({ q: text.trim() || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedText]);

  const changeArea = (a: AreaSelection) => {
    setMapBounds(null);
    if (a.kind === 'near' && a.device) {
      setDeviceArea(a);
      update({ area: null, near: null, label: null });
    } else {
      setDeviceArea(null);
      update({ area: a.kind === 'city' ? 'city' : a.kind === 'neighbourhood' ? a.slug : null, near: null, label: null });
    }
  };

  const onBoundsChange = (b: Bounds, zoom: number) => {
    const tooBig = b.north - b.south > LIMITS.maxBboxSpanDeg || b.east - b.west > LIMITS.maxBboxSpanDeg || zoom < 12;
    setZoomHint(tooBig);
    if (!tooBig) setMapBounds(b);
  };

  const origin = deviceArea && deviceArea.kind === 'near' ? { lat: deviceArea.lat, lng: deviceArea.lng } : nameMode ? null : areaCentre(baseArea);

  const { list, hiddenUnknown, cuisines, hasAtmosphere } = useMemo(() => {
    const out = applyFilters(state.places, filters);
    const prefs = {
      ...EMPTY_PREFERENCES,
      occasion: preset?.rankOccasion ?? null,
      atmosphere: filters.atmosphere.length ? filters.atmosphere : preset?.rankAtmosphere ?? [],
      preferredFacilities: preset?.suggestedFacilities ?? [],
      keywords: filters.q ? filters.q.toLowerCase().split(/\s+/) : [],
    };
    const scores = new Map(out.list.map((c) => [c.id, scoreCafe(c, prefs, { ratings, origin }).score]));
    return {
      list: sortCafes(out.list, sort === 'distance' && !origin ? 'relevance' : sort, { origin, ratings, scores }),
      hiddenUnknown: out.hiddenUnknown,
      cuisines: cuisineFacets(state.places),
      hasAtmosphere: state.places.some((p) => p.atmosphere.length > 0),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.places, params, ratings, origin?.lat, origin?.lng, preset, nameMode]);

  const distances = useMemo(() => new Map(list.map((c) => [c.id, cafeDistanceKm(c, origin)])), [list, origin]);
  const activeCount = (filters.budget ? 1 : 0) + filters.atmosphere.length + filters.facilities.length + filters.categories.length + (filters.cuisine ? 1 : 0) + (filters.openNow ? 1 : 0);
  const label = nameMode ? `“${debouncedText}” across the city` : dataArea.kind === 'bounds' ? 'this map area' : areaLabel(dataArea);

  const toggleIn = (key: string, value: string) => {
    const cur = csv(params.get(key));
    update({ [key]: (cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value]).join(',') || null });
  };
  const clearAll = () => update({ budget: null, atmos: null, fac: null, cat: null, cuisine: null, open: null });

  return (
    <div>
      {preset ? (
        <section className="relative overflow-hidden bg-espresso text-ivory">
          {preset.image && <SmartImage src={preset.image} alt="" className="absolute inset-0 h-full w-full opacity-30" width={1400} eager />}
          <div className="absolute inset-0 bg-gradient-to-r from-espresso via-espresso/85 to-espresso/30" />
          <div className="page relative py-12 sm:py-16">
            <p className="eyebrow !text-ivory/70">{preset.eyebrow}</p>
            <h1 className="mt-2 text-4xl sm:text-6xl">{preset.title}</h1>
            <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-ivory/85">{preset.blurb}</p>
          </div>
        </section>
      ) : (
        <section className="page pb-2 pt-10">
          <p className="eyebrow">Explore</p>
          <h1 className="mt-2 text-4xl sm:text-5xl">Cafés in {label}</h1>
          {baseArea.kind === 'neighbourhood' && !nameMode && view === 'list' && <p className="mt-2 max-w-xl text-mocha">{neighbourhoodBySlug(baseArea.slug)?.blurb}</p>}
        </section>
      )}

      {preset?.evidenceNote && (
        <div className="page mt-5">
          <p className="flex items-start gap-2 rounded-2xl bg-sand/60 p-3 text-sm text-mocha">
            <Info size={16} className="mt-0.5 shrink-0" aria-hidden /> {preset.evidenceNote}
          </p>
        </div>
      )}

      {/* Toolbar */}
      <div className="z-[400] border-b border-oat/60 bg-cream/90 backdrop-blur-md lg:sticky lg:top-16">
        <div className="page flex flex-wrap items-center gap-2 py-3">
          <AreaPicker value={baseArea} onChange={changeArea} compact />
          <label className="relative min-w-[200px] flex-1">
            <span className="sr-only">Search cafés by name</span>
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-latte" aria-hidden />
            <input
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 60))}
              placeholder="Search cafés by name"
              title="3 or more letters searches the whole city"
              className="input min-h-[44px] !rounded-full !py-2.5 !pl-10"
              type="search"
              enterKeyHint="search"
            />
          </label>
          <button onClick={() => setSheet(true)} className={`chip min-h-[44px] !py-2.5 ${activeCount ? 'chip-on' : ''}`} aria-haspopup="dialog">
            <SlidersHorizontal size={15} aria-hidden /> Filters{activeCount ? ` · ${activeCount}` : ''}
          </button>
          <label className="chip min-h-[44px] !py-2.5">
            <span className="sr-only">Sort by</span>
            <select value={sort} onChange={(e) => update({ sort: e.target.value === 'relevance' ? null : e.target.value })} className="bg-transparent focus:outline-none">
              {Object.entries(SORT_LABELS).map(([k, v]) => (
                <option key={k} value={k} disabled={k === 'distance' && !origin}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <div className="flex rounded-full border border-oat bg-ivory p-0.5" role="group" aria-label="View">
            <button onClick={() => { setMapBounds(null); update({ view: null }); }} aria-pressed={view === 'list'} className={`rounded-full px-3 py-2.5 ${view === 'list' ? 'bg-espresso text-ivory' : 'text-mocha'}`} aria-label="List view">
              <LayoutGrid size={16} />
            </button>
            <button onClick={() => update({ view: 'map' })} aria-pressed={view === 'map'} className={`rounded-full px-3 py-2.5 ${view === 'map' ? 'bg-espresso text-ivory' : 'text-mocha'}`} aria-label="Map view">
              <MapIcon size={16} />
            </button>
          </div>
        </div>
        {(activeCount > 0 || !!preset?.suggestedFacilities?.length) && (
          <div className="page flex gap-1.5 overflow-x-auto pb-3 [scrollbar-width:none]">
            {preset?.suggestedFacilities
              ?.filter((f) => !filters.facilities.includes(f))
              .map((f) => (
                <button key={`s-${f}`} onClick={() => toggleIn('fac', f)} className="chip shrink-0 !border-dashed">
                  + Must have {FACILITY_LABELS[f].toLowerCase()}
                </button>
              ))}
            {filters.budget && <ActiveChip label={budgetOption(filters.budget)!.label} onClear={() => update({ budget: null })} />}
            {filters.openNow && <ActiveChip label="Open now" onClear={() => update({ open: null })} />}
            {filters.categories.map((c) => (
              <ActiveChip key={c} label={CATEGORY_LABELS[c]} onClear={() => toggleIn('cat', c)} />
            ))}
            {filters.cuisine && <ActiveChip label={filters.cuisine} onClear={() => update({ cuisine: null })} />}
            {filters.atmosphere.map((a) => (
              <ActiveChip key={a} label={ATMOSPHERE_LABELS[a]} onClear={() => toggleIn('atmos', a)} />
            ))}
            {filters.facilities.map((f) => (
              <ActiveChip key={f} label={`Must have ${FACILITY_LABELS[f].toLowerCase()}`} onClear={() => toggleIn('fac', f)} />
            ))}
            {activeCount > 1 && (
              <button onClick={clearAll} className="btn-link shrink-0 px-2">
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      <div className="page pt-6">
        <ResultsHeader count={list.length} total={state.meta?.total ?? null} truncated={!!state.meta?.truncated} hiddenUnknown={hiddenUnknown} loading={state.status === 'loading'} label={label} />
        {view === 'map' && zoomHint && <p className="mb-3 text-sm text-mocha">Zoom in to load cafés for the area you’re looking at.</p>}

        {view === 'map' ? (
          <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
            <LazyMap
              cafes={list}
              selectedId={hovered}
              onSelect={setHovered}
              origin={deviceArea && deviceArea.kind === 'near' ? { lat: deviceArea.lat, lng: deviceArea.lng } : null}
              fitKey={nameMode ? `q:${debouncedText}` : areaKey(baseArea)}
              onBoundsChange={nameMode ? undefined : onBoundsChange}
              className="h-[60vh] min-h-[380px] lg:sticky lg:top-40 lg:h-[calc(100vh-11rem)]"
            />
            <div>
              <PlacesStateView state={state} empty={<NoResults state={state.places.length} label={label} onReset={clearAll} />} skeletonCount={3}>
                {list.length === 0 ? (
                  <NoResults state={state.places.length} label={label} onReset={clearAll} />
                ) : (
                  <ul className="space-y-4" aria-label="Cafés on the map">
                    {list.slice(0, limit).map((c) => (
                      <li key={c.id}>
                        <CafeCard cafe={c} distanceKm={distances.get(c.id)} highlighted={hovered === c.id} onHover={setHovered} />
                      </li>
                    ))}
                    {list.length > limit && <LoadMore onClick={() => setLimit((l) => l + PAGE)} remaining={list.length - limit} />}
                  </ul>
                )}
              </PlacesStateView>
            </div>
          </div>
        ) : (
          <PlacesStateView state={state} empty={<NoResults state={0} label={label} onReset={clearAll} />}>
            {list.length === 0 ? (
              <NoResults state={state.places.length} label={label} onReset={clearAll} />
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
          </PlacesStateView>
        )}
        <DataSourceNote meta={state.meta} enrichmentError={state.enrichmentError} className="mt-8" />
      </div>

      <Modal open={sheet} onClose={() => setSheet(false)} title="Filters" wide>
        <div className="space-y-6">
          <fieldset>
            <legend className="label">Type of place</legend>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <Toggle key={c} on={filters.categories.includes(c)} onClick={() => toggleIn('cat', c)}>
                  {CATEGORY_LABELS[c]}
                </Toggle>
              ))}
            </div>
          </fieldset>
          {cuisines.length > 0 && (
            <fieldset>
              <legend className="label">Food &amp; drink (as listed at the source)</legend>
              <div className="flex flex-wrap gap-2">
                {cuisines.map((c) => (
                  <Toggle key={c} on={filters.cuisine === c} onClick={() => update({ cuisine: filters.cuisine === c ? null : c })}>
                    {c}
                  </Toggle>
                ))}
              </div>
            </fieldset>
          )}
          <fieldset>
            <legend className="label">Opening hours</legend>
            <Toggle on={filters.openNow} onClick={() => update({ open: filters.openNow ? null : '1' })}>
              Open now (Kolkata time)
            </Toggle>
            <p className="mt-2 text-xs text-latte">Places without interpretable hours are hidden, never assumed open.</p>
          </fieldset>
          <fieldset>
            <legend className="label">Must have</legend>
            <div className="flex flex-wrap gap-2">
              {REQUIRABLE_FACILITIES.map((f) => (
                <Toggle key={f} on={filters.facilities.includes(f)} onClick={() => toggleIn('fac', f)}>
                  {FACILITY_LABELS[f]}
                </Toggle>
              ))}
            </div>
            <p className="mt-2 text-xs text-latte">Only places where the source or a verified report lists the facility are shown. Unknown is never treated as yes.</p>
          </fieldset>
          <label className="block">
            <span className="label">Budget per person</span>
            <select value={filters.budget ?? ''} onChange={(e) => update({ budget: e.target.value || null })} className="input !py-2.5 sm:max-w-xs">
              <option value="">Any budget</option>
              {BUDGET_OPTIONS.filter((b) => b.band !== 'flexible').map((b) => (
                <option key={b.band} value={b.band}>
                  {b.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-latte">Most places don’t publish prices yet; a budget filter shows only places with known prices.</span>
          </label>
          {hasAtmosphere && (
            <fieldset>
              <legend className="label">
                Atmosphere <span className="font-normal text-latte">(any of)</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(ATMOSPHERE_LABELS) as Atmosphere[]).map((a) => (
                  <Toggle key={a} on={filters.atmosphere.includes(a)} onClick={() => toggleIn('atmos', a)}>
                    {ATMOSPHERE_LABELS[a]}
                  </Toggle>
                ))}
              </div>
            </fieldset>
          )}
          <div className="flex items-center justify-between gap-3 border-t border-oat pt-4">
            <button onClick={clearAll} className="btn-link">
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

function ResultsHeader({ count, total, truncated, hiddenUnknown, loading, label }: { count: number; total: number | null; truncated: boolean; hiddenUnknown: number; loading: boolean; label: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
      <p className="text-sm text-mocha" aria-live="polite">
        {loading ? (
          'Loading…'
        ) : (
          <>
            <strong className="text-espresso">{count}</strong> place{count === 1 ? '' : 's'} in {label}
            {truncated && total != null ? ` (nearest shown of ${total}; zoom in or pick a neighbourhood for more)` : ''}
          </>
        )}
      </p>
      {hiddenUnknown > 0 && <p className="text-xs text-latte">{hiddenUnknown} more hidden because something you filtered on isn’t known there.</p>}
    </div>
  );
}

function NoResults({ state, label, onReset }: { state: number; label: string; onReset(): void }) {
  if (state === 0) return <NoPlacesHere area={label} />;
  return (
    <EmptyState
      title="No places match these filters"
      action={
        <button onClick={onReset} className="btn-primary">
          Clear filters
        </button>
      }
    >
      Most listings don’t include facilities or prices yet, so strict filters remove a lot. Try fewer filters, or{' '}
      <Link to="/find" className="underline">
        Find My Place
      </Link>{' '}
      to rank by preferences instead.
    </EmptyState>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick(): void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`chip min-h-[40px] ${on ? 'chip-on' : ''}`}>
      {children}
    </button>
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
