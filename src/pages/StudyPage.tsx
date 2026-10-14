import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Flag, LocateFixed, Navigation } from 'lucide-react';
import type { BudgetBand, FacilityKey } from '@/types';
import { useData } from '@/context/DataContext';
import { BUDGET_OPTIONS, DISTANCE_OPTIONS, FACILITY_LABELS, NEIGHBOURHOODS, neighbourhoodName } from '@/lib/taxonomy';
import { EMPTY_PREFERENCES, recommend, relaxPreferences, type ConstraintKey, type Preferences } from '@/lib/engine';
import { directionsUrl, formatDistance } from '@/lib/geo';
import { formatPriceRange } from '@/lib/format';
import { studySummary } from '@/lib/study';
import { SmartImage } from '@/components/SmartImage';
import { SaveButton } from '@/components/SaveButton';
import { DemoLabel } from '@/components/DemoLabel';
import { StudySummaryCard } from '@/components/StudySummaryCard';
import { ReportDialog } from '@/components/ReportDialog';
import { EmptyState, ErrorState, GridSkeleton } from '@/components/States';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { MOODS } from '@/lib/moods';

const STUDY_FACILITIES: FacilityKey[] = ['charging', 'wifi', 'comfortable_seating', 'ac', 'long_stay'];

export default function StudyPage() {
  useDocumentTitle('Study Spots');
  const { cafes, loading, error, retry, ratings } = useData();
  const geo = useGeolocation();
  const [must, setMust] = useState<FacilityKey[]>([]);
  const [quietOnly, setQuietOnly] = useState(false);
  const [groupTables, setGroupTables] = useState(false);
  const [budget, setBudget] = useState<BudgetBand | ''>('');
  const [area, setArea] = useState('');
  const [distance, setDistance] = useState<number | null>(null);
  const [report, setReport] = useState<{ id: string; name: string; n: number } | null>(null);

  const prefs: Preferences = useMemo(
    () => ({
      ...EMPTY_PREFERENCES,
      occasion: 'study',
      atmosphere: ['quiet', 'work_friendly'],
      requiredFacilities: must,
      budget: budget || null,
      location: geo.coords ? { mode: 'current', ...geo.coords } : area ? { mode: 'neighbourhood', slug: area } : { mode: 'anywhere' },
      maxDistanceKm: geo.coords || area ? distance : null,
    }),
    [must, budget, area, distance, geo.coords],
  );
  const [relaxed, setRelaxed] = useState<Preferences | null>(null);
  const active = relaxed ?? prefs;

  const result = useMemo(() => {
    const r = recommend(cafes, active, { ratings });
    // Study-specific hard filters on top of the engine.
    const keep = (id: string) => {
      const c = cafes.find((x) => x.id === id)!;
      if (quietOnly && c.noise.value !== 'quiet') return false;
      if (groupTables && c.seating.groupFriendly !== true) return false;
      return true;
    };
    // Only show places that are at least plausible for studying.
    const matches = r.matches.filter((m) => keep(m.cafe.id) && studySummary(m.cafe).verdict !== 'not_ideal');
    return { ...r, matches };
  }, [cafes, active, ratings, quietOnly, groupTables]);

  const toggle = (f: FacilityKey) => {
    setRelaxed(null);
    setMust((m) => (m.includes(f) ? m.filter((x) => x !== f) : [...m, f]));
  };
  const relax = (k: ConstraintKey) => setRelaxed(relaxPreferences(active, k));

  return (
    <div>
      <section className="relative overflow-hidden bg-espresso text-ivory">
        <SmartImage src={MOODS[0].image} alt="" className="absolute inset-0 h-full w-full opacity-30" width={1400} eager />
        <div className="absolute inset-0 bg-gradient-to-r from-espresso via-espresso/85 to-espresso/40" />
        <div className="page relative py-14 sm:py-20">
          <p className="eyebrow !text-ivory/70">Study Spots</p>
          <h1 className="mt-2 max-w-2xl text-4xl sm:text-6xl">Places you can actually study in.</h1>
          <p className="mt-3 max-w-xl text-ivory/85">
            Every place shows a transparent checklist with how each item was verified. “Laptop-friendly” never counts as proof of sockets or Wi-Fi.
          </p>
        </div>
      </section>

      <div className="page mt-8 grid gap-8 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start" aria-label="Study filters">
          <div>
            <p className="label">Must have (confirmed)</p>
            <div className="flex flex-wrap gap-2">
              {STUDY_FACILITIES.map((f) => (
                <button key={f} aria-pressed={must.includes(f)} onClick={() => toggle(f)} className={`chip ${must.includes(f) ? 'chip-on' : ''}`}>
                  {FACILITY_LABELS[f]}
                </button>
              ))}
              <button aria-pressed={quietOnly} onClick={() => setQuietOnly((q) => !q)} className={`chip ${quietOnly ? 'chip-on' : ''}`}>
                Quiet (reported)
              </button>
              <button aria-pressed={groupTables} onClick={() => setGroupTables((g) => !g)} className={`chip ${groupTables ? 'chip-on' : ''}`}>
                Group study tables
              </button>
            </div>
            <p className="mt-2 text-xs text-latte">We don’t have live seat availability. “Group study tables” uses each place’s listed seating.</p>
          </div>
          <label className="block">
            <span className="label">Budget per person</span>
            <select value={budget} onChange={(e) => { setRelaxed(null); setBudget(e.target.value as BudgetBand); }} className="input !py-2.5">
              <option value="">Any</option>
              {BUDGET_OPTIONS.map((b) => (
                <option key={b.band} value={b.band}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className="label">Location</span>
            <button onClick={() => void geo.request()} className={`chip mb-2 ${geo.coords ? 'chip-on' : ''}`}>
              <LocateFixed size={14} aria-hidden /> {geo.status === 'requesting' ? 'Locating…' : geo.coords ? 'Near you' : 'Use my location'}
            </button>
            {!geo.coords && (
              <select value={area} onChange={(e) => { setRelaxed(null); setArea(e.target.value); }} className="input !py-2.5" aria-label="Neighbourhood">
                <option value="">Anywhere in Kolkata</option>
                {NEIGHBOURHOODS.map((n) => (
                  <option key={n.slug} value={n.slug}>
                    {n.name}
                  </option>
                ))}
              </select>
            )}
            {geo.message && <p className="mt-2 text-xs text-clay">{geo.message}</p>}
            {(geo.coords || area) && (
              <select value={distance ?? ''} onChange={(e) => { setRelaxed(null); setDistance(e.target.value ? Number(e.target.value) : null); }} className="input mt-2 !py-2.5" aria-label="Distance">
                {DISTANCE_OPTIONS.map((d) => (
                  <option key={d.label} value={d.value ?? ''}>
                    {d.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </aside>

        <div>
          {error ? (
            <ErrorState message={error} onRetry={retry} />
          ) : loading ? (
            <GridSkeleton count={4} />
          ) : result.matches.length === 0 ? (
            <EmptyState title="No study spots match all of that">
              {result.relaxations.length ? (
                <span className="flex flex-wrap justify-center gap-2 pt-2">
                  {result.relaxations.map((r) => (
                    <button key={r.constraint} onClick={() => relax(r.constraint)} className="chip">
                      Drop “{r.label}” <span className="text-sage-dark">+{r.gain}</span>
                    </button>
                  ))}
                </span>
              ) : (
                'Try removing a requirement.'
              )}
            </EmptyState>
          ) : (
            <>
              <p className="mb-4 text-sm text-mocha">
                {result.matches.length} place{result.matches.length === 1 ? '' : 's'}
                {area && !geo.coords ? ` in or near ${neighbourhoodName(area)}` : ''}, ranked for studying.
              </p>
              <ul className="space-y-5">
                {result.matches.map((m) => {
                  const c = m.cafe;
                  const dir = directionsUrl(c);
                  return (
                    <li key={c.id} className="card overflow-hidden">
                      <div className="grid md:grid-cols-[240px_1fr]">
                        <Link to={`/cafe/${c.slug}`} className="relative block" tabIndex={-1} aria-hidden>
                          <SmartImage src={c.photos[0]?.url} alt={c.photos[0]?.alt ?? c.name} label={c.name} className="aspect-[16/9] h-full md:aspect-auto" width={480} />
                          {c.isDemo && <DemoLabel className="absolute left-3 top-3" />}
                        </Link>
                        <div className="p-5">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h2 className="text-2xl">
                                <Link to={`/cafe/${c.slug}`} className="hover:underline decoration-oat underline-offset-4">
                                  {c.name}
                                </Link>
                              </h2>
                              <p className="text-sm text-mocha">
                                {neighbourhoodName(c.neighbourhood)}
                                {m.distanceKm != null && ` · ${formatDistance(m.distanceKm)}`}
                                {formatPriceRange(c) && ` · ${formatPriceRange(c)} / person`}
                              </p>
                            </div>
                            <SaveButton cafeId={c.id} name={c.name} />
                          </div>
                          <div className="mt-4">
                            <StudySummaryCard cafe={c} compact />
                          </div>
                          {m.unknowns.length > 0 && <p className="mt-3 text-xs text-latte">Unconfirmed: {m.unknowns.join('; ')}</p>}
                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            <Link to={`/cafe/${c.slug}#study`} className="btn-primary !py-2">
                              Details
                            </Link>
                            {dir && (
                              <a href={dir} target="_blank" rel="noopener noreferrer" className="btn-ghost !py-2">
                                <Navigation size={14} aria-hidden /> Directions
                              </a>
                            )}
                            <button onClick={() => setReport({ id: c.id, name: c.name, n: (report?.n ?? 0) + 1 })} className="btn-link ml-auto text-mocha">
                              <Flag size={13} aria-hidden /> Report sockets, Wi-Fi or noise
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
      {report && (
        <ReportDialog key={report.n} open onClose={() => setReport(null)} cafeId={report.id} cafeName={report.name} initialType="facility" initialFacility="charging" />
      )}
    </div>
  );
}
