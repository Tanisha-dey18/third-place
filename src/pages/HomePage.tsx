import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, LocateFixed, MapPin } from 'lucide-react';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { useLibrary } from '@/context/LibraryContext';
import { MOODS } from '@/lib/moods';
import { NEIGHBOURHOODS, budgetOption, neighbourhoodBySlug, neighbourhoodName } from '@/lib/taxonomy';
import { EMPTY_PREFERENCES, recommend, type Preferences } from '@/lib/engine';
import { cafeDistanceKm } from '@/lib/geo';
import { CafeCard } from '@/components/CafeCard';
import { HeroSearch } from '@/components/HeroSearch';
import { SmartImage } from '@/components/SmartImage';
import { CardSkeleton, EmptyState, ErrorState } from '@/components/States';
import { formatDate } from '@/components/VerificationBadge';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { Cafe } from '@/types';

function Section({ eyebrow, title, link, children, intro }: { eyebrow?: string; title: string; link?: { to: string; label: string }; intro?: ReactNode; children: ReactNode }) {
  return (
    <section className="page mt-16 sm:mt-20">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
          <h2 className="text-[28px] leading-tight sm:text-[34px]">{title}</h2>
          {intro && <p className="mt-1.5 max-w-xl text-sm text-mocha">{intro}</p>}
        </div>
        {link && (
          <Link to={link.to} className="btn-link shrink-0">
            {link.label} <ArrowRight size={14} aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Rail({ cafes, distances, empty }: { cafes: Cafe[]; distances?: Map<string, number | null>; empty?: string }) {
  if (!cafes.length) return <EmptyState title="Nothing here yet">{empty ?? 'No places in our records fit this section yet.'}</EmptyState>;
  return (
    <div className="scroll-row">
      {cafes.map((c) => (
        <CafeCard key={c.id} cafe={c} variant="rail" distanceKm={distances?.get(c.id)} />
      ))}
    </div>
  );
}

export default function HomePage() {
  useDocumentTitle(null);
  const { cafes, loading, error, retry, ratings } = useData();
  const { profile } = useAuth();
  const { savedIds } = useLibrary();
  const geo = useGeolocation();
  const [nearbyArea, setNearbyArea] = useState<string>(profile?.preferredNeighbourhood ?? 'park-street');

  const ranked = useMemo(() => {
    const run = (p: Partial<Preferences>, n = 8) => recommend(cafes, { ...EMPTY_PREFERENCES, ...p }, { ratings }).matches.slice(0, n).map((m) => m.cafe);
    return {
      study: run({ occasion: 'study', atmosphere: ['quiet'] }).filter((c) => c.occasions.includes('study') || c.occasions.includes('work')),
      date: run({ occasion: 'date' }).filter((c) => c.occasions.includes('date')),
      dessert: run({ occasion: 'dessert' }).filter((c) => c.occasions.includes('dessert') || c.occasions.includes('coffee')),
      budget: cafes.filter((c) => c.priceMin != null && c.priceMin <= 150).sort((a, b) => (a.priceMin ?? 0) - (b.priceMin ?? 0)),
      gems: cafes.filter((c) => c.tags.includes('hidden-gem')),
      recent: [...cafes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4),
    };
  }, [cafes, ratings]);

  // "Recommended for you": only when we actually know something about the person.
  const hasPrefs = !!(profile?.preferredBudget || profile?.preferredNeighbourhood);
  const forYou = useMemo(() => {
    if (!hasPrefs) return [];
    const savedCafes = cafes.filter((c) => savedIds.includes(c.id));
    const atmos = Array.from(new Set(savedCafes.flatMap((c) => c.atmosphere))).slice(0, 3);
    const prefs: Preferences = {
      ...EMPTY_PREFERENCES,
      budget: profile?.preferredBudget ?? null,
      atmosphere: atmos,
      location: profile?.preferredNeighbourhood ? { mode: 'neighbourhood', slug: profile.preferredNeighbourhood } : { mode: 'anywhere' },
    };
    let res = recommend(cafes, prefs, { ratings }).matches;
    if (res.length < 3 && prefs.location.mode !== 'anywhere') {
      res = recommend(cafes, { ...prefs, location: { mode: 'anywhere' } }, { ratings }).matches;
    }
    return res.filter((m) => !savedIds.includes(m.cafe.id)).slice(0, 8).map((m) => m.cafe);
  }, [hasPrefs, cafes, savedIds, profile, ratings]);

  const nearby = useMemo(() => {
    const origin = geo.coords ?? (() => {
      const n = neighbourhoodBySlug(nearbyArea);
      return n ? { lat: n.lat, lng: n.lng } : null;
    })();
    const d = new Map(cafes.map((c) => [c.id, cafeDistanceKm(c, origin)]));
    const list = cafes
      .filter((c) => d.get(c.id) != null)
      .sort((a, b) => (d.get(a.id) ?? 99) - (d.get(b.id) ?? 99))
      .slice(0, 8);
    return { list, d };
  }, [geo.coords, nearbyArea, cafes]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cafes) m.set(c.neighbourhood, (m.get(c.neighbourhood) ?? 0) + 1);
    return m;
  }, [cafes]);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="page grid items-center gap-10 pb-6 pt-10 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:pt-20">
          <div className="min-w-0">
            <p className="eyebrow mb-4">Kolkata · cafés & third places</p>
            <h1 className="text-[44px] font-medium leading-[1.02] text-espresso sm:text-[64px] lg:text-[76px]">
              Find your <em className="font-normal text-sage-dark">kind</em> of place.
            </h1>
            <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-mocha">
              Quiet corners, coffee dates, spontaneous plans, and spaces that just feel right.
            </p>
            <div className="mt-8">
              <HeroSearch defaultBudget={profile?.preferredBudget} defaultArea={profile?.preferredNeighbourhood} />
            </div>
          </div>
          <div className="relative hidden lg:block">
            <div className="grid grid-cols-5 grid-rows-6 gap-3" style={{ height: 560 }}>
              <SmartImage src={MOODS[0].image} alt="Café interior with warm light" className="col-span-3 row-span-4 rounded-[28px]" width={700} eager />
              <SmartImage src={MOODS[5].image} alt="Dessert on a plate" className="col-span-2 row-span-3 rounded-[28px]" width={420} eager />
              <SmartImage src={MOODS[6].image} alt="Cosy reading corner" className="col-span-2 row-span-3 rounded-[28px]" width={420} eager />
              <div className="col-span-3 row-span-2 flex flex-col justify-center rounded-[28px] bg-espresso p-6 text-ivory">
                <p className="font-serif text-2xl italic leading-snug">Not home. Not work.</p>
                <p className="font-serif text-2xl leading-snug text-sage">Your place.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Moods */}
      <Section eyebrow="Explore by mood" title="What kind of time are you after?">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {MOODS.map((m, i) => (
            <Link
              key={m.slug}
              to={`/mood/${m.slug}`}
              className={`group relative overflow-hidden rounded-2xl ${i === 0 ? 'col-span-2 row-span-2 aspect-square sm:aspect-auto lg:col-span-2' : 'aspect-[4/5]'}`}
            >
              <SmartImage src={m.image} alt="" className="absolute inset-0 h-full w-full transition-transform duration-700 group-hover:scale-[1.03]" width={i === 0 ? 800 : 400} />
              <div className="absolute inset-0 bg-gradient-to-t from-espresso/85 via-espresso/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4 text-ivory">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ivory/75">{m.kicker}</p>
                <h3 className={`${i === 0 ? 'text-3xl' : 'text-xl'} leading-tight`}>{m.title}</h3>
                {i === 0 && <p className="mt-1 max-w-xs text-sm text-ivory/80">{m.blurb}</p>}
              </div>
            </Link>
          ))}
        </div>
      </Section>

      {error ? (
        <div className="page mt-16">
          <ErrorState message={error} onRetry={retry} />
        </div>
      ) : loading ? (
        <div className="page mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : cafes.length === 0 ? (
        <div className="page mt-16">
          <EmptyState title="No places listed yet">The café database is empty. Add verified records in Supabase or switch to demo data.</EmptyState>
        </div>
      ) : (
        <>
          <Section
            eyebrow="Recommended for you"
            title={hasPrefs ? 'Picked for your preferences' : 'Make it personal'}
            intro={
              hasPrefs
                ? `Based on ${[profile?.preferredBudget && budgetOption(profile.preferredBudget)?.label, profile?.preferredNeighbourhood && neighbourhoodName(profile.preferredNeighbourhood)]
                    .filter(Boolean)
                    .join(' and ')}${savedIds.length ? ' and the places you’ve saved' : ''}.`
                : undefined
            }
            link={hasPrefs ? { to: '/profile', label: 'Edit preferences' } : undefined}
          >
            {hasPrefs ? (
              <Rail cafes={forYou} empty="Nothing new matches your preferences yet. Try widening your budget." />
            ) : (
              <div className="flex flex-col items-start gap-4 rounded-3xl bg-sand/60 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
                <p className="max-w-lg font-serif text-xl leading-snug text-espresso">
                  We don’t guess. Set a budget and a home neighbourhood and we’ll rank places for you, or describe a plan and let us find it.
                </p>
                <div className="flex gap-2">
                  <Link to="/profile" className="btn-ghost">
                    Set preferences
                  </Link>
                  <Link to="/find" className="btn-primary">
                    Find My Place
                  </Link>
                </div>
              </div>
            )}
          </Section>

          <Section eyebrow="Discover nearby" title="Close to where you are">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button onClick={() => void geo.request()} className={geo.coords ? 'chip chip-on' : 'chip'} disabled={geo.status === 'requesting'}>
                <LocateFixed size={14} aria-hidden /> {geo.status === 'requesting' ? 'Locating…' : geo.coords ? 'Using your location' : 'Use my location'}
              </button>
              <span className="text-xs text-latte">or near</span>
              <label className="chip">
                <MapPin size={14} aria-hidden />
                <span className="sr-only">Neighbourhood</span>
                <select
                  value={nearbyArea}
                  onChange={(e) => setNearbyArea(e.target.value)}
                  className="bg-transparent focus:outline-none"
                  disabled={!!geo.coords}
                >
                  {NEIGHBOURHOODS.map((n) => (
                    <option key={n.slug} value={n.slug}>
                      {n.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {geo.message && <p className="mb-3 text-sm text-clay">{geo.message}</p>}
            <Rail cafes={nearby.list} distances={nearby.d} />
          </Section>

          <Section eyebrow="Study Mode" title="Study-friendly cafés" link={{ to: '/study', label: 'All study spots' }}>
            <Rail cafes={ranked.study} />
          </Section>

          <Section eyebrow="Date Mode" title="Best for dates" link={{ to: '/mood/date', label: 'More date spots' }}>
            <Rail cafes={ranked.date} />
          </Section>

          <Section eyebrow="Budget Mode" title="Budget-friendly places" intro="Places where you can spend ₹150 or less per person." link={{ to: '/mood/budget', label: 'Budget mode' }}>
            <Rail cafes={ranked.budget} />
          </Section>

          <Section eyebrow="Coffee & dessert" title="Something sweet, something strong" link={{ to: '/mood/coffee-dessert', label: 'Explore' }}>
            <Rail cafes={ranked.dessert} />
          </Section>

          <Section
            eyebrow="Hidden gems"
            title="Quietly wonderful"
            intro="Tagged by our curators as small, lesser-known places. This is an editorial tag, not a popularity ranking."
            link={{ to: '/hidden-gems', label: 'All hidden gems' }}
          >
            <Rail cafes={ranked.gems} />
          </Section>

          <Section eyebrow="Neighbourhoods" title="Explore Kolkata by neighbourhood" link={{ to: '/neighbourhoods', label: 'All neighbourhoods' }}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {NEIGHBOURHOODS.map((n) => (
                <Link key={n.slug} to={`/explore?area=${n.slug}`} className="group rounded-2xl border border-oat/80 bg-ivory p-4 transition-colors hover:border-latte/60 hover:bg-ivory">
                  <p className="font-serif text-lg leading-tight text-espresso">{n.name}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-mocha">{n.blurb}</p>
                  <p className="mt-3 text-xs font-medium text-sage-dark">{counts.get(n.slug) ? `${counts.get(n.slug)} listed` : 'None listed yet'}</p>
                </Link>
              ))}
            </div>
          </Section>

          <Section eyebrow="Recently added" title="New on THIRD PLACE" intro="Ordered by the date each record was added to our database.">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {ranked.recent.map((c) => (
                <div key={c.id}>
                  <CafeCard cafe={c} />
                  <p className="mt-2 pl-1 text-xs text-latte">Added {formatDate(c.createdAt)}</p>
                </div>
              ))}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
