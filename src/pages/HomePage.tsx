import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Database } from 'lucide-react';
import type { Cafe } from '@/types';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { MOODS } from '@/lib/moods';
import { NEIGHBOURHOODS, budgetOption, neighbourhoodBySlug, neighbourhoodName, CONFIRMING_STATUSES } from '@/lib/taxonomy';
import { EMPTY_PREFERENCES, recommend, type Preferences } from '@/lib/engine';
import { cafeDistanceKm, isOpenAt } from '@/lib/geo';
import { zonedDayTime } from '@/lib/time';
import { DEFAULT_CITY } from '@/lib/cities';
import { areaCentre, areaLabel, type AreaSelection } from '@/lib/places/area';
import { fetchRecentlyAdded } from '@/lib/repository/curated';
import { config } from '@/lib/config';
import { useAreaPlaces } from '@/hooks/usePlaces';
import { CafeCard } from '@/components/CafeCard';
import { HeroSearch } from '@/components/HeroSearch';
import { SmartImage } from '@/components/SmartImage';
import { AreaPicker } from '@/components/AreaPicker';
import { DataSourceNote } from '@/components/DataSourceNote';
import { NoPlacesHere, PlacesStateView } from '@/components/PlacesState';
import { formatDate } from '@/components/VerificationBadge';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

function Section({ eyebrow, title, link, children, intro, action }: { eyebrow?: string; title: string; link?: { to: string; label: string }; intro?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="page mt-16 sm:mt-20">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
          <h2 className="text-[28px] leading-tight sm:text-[34px]">{title}</h2>
          {intro && <p className="mt-1.5 max-w-xl text-sm text-mocha">{intro}</p>}
        </div>
        {action}
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

function Rail({ cafes, distances }: { cafes: Cafe[]; distances?: Map<string, number | null> }) {
  return (
    <div className="scroll-row" role="list">
      {cafes.map((c) => (
        <div role="listitem" key={c.id} className="contents">
          <CafeCard cafe={c} variant="rail" distanceKm={distances?.get(c.id)} />
        </div>
      ))}
    </div>
  );
}

const hasListed = (c: Cafe, key: string) => c.facilities.some((f) => f.key === key && f.available === true && CONFIRMING_STATUSES.includes(f.status));
const COFFEE_DESSERT = /coffee|cake|dessert|ice cream|pastr|bakery|tea/i;

export default function HomePage() {
  useDocumentTitle(null);
  const { ratings } = useData();
  const { profile } = useAuth();
  const [area, setArea] = useState<AreaSelection>(() => ({ kind: 'neighbourhood', slug: profile?.preferredNeighbourhood ?? 'park-street' }));
  const [recent, setRecent] = useState<Cafe[]>([]);

  useEffect(() => {
    if (profile?.preferredNeighbourhood) setArea({ kind: 'neighbourhood', slug: profile.preferredNeighbourhood });
  }, [profile?.preferredNeighbourhood]);

  // THIRD PLACE's own verified records, if any (never generated).
  useEffect(() => {
    if (!config.supabaseConfigured || config.demoMode) return;
    fetchRecentlyAdded(8).then(setRecent).catch(() => setRecent([]));
  }, []);

  const state = useAreaPlaces(area);
  const label = areaLabel(area);
  const origin = areaCentre(area);

  const rails = useMemo(() => {
    const places = state.places;
    const d = new Map(places.map((c) => [c.id, cafeDistanceKm(c, origin)]));
    const byDistance = [...places].sort((a, b) => (d.get(a.id) ?? 99) - (d.get(b.id) ?? 99));
    const { day, time } = zonedDayTime(DEFAULT_CITY.timezone);
    return {
      d,
      nearby: byDistance.slice(0, 10),
      openNow: byDistance.filter((c) => isOpenAt(c.hours.value, day, time) === true).slice(0, 10),
      wifi: byDistance.filter((c) => hasListed(c, 'wifi')).slice(0, 10),
      coffee: byDistance.filter((c) => c.category === 'ice_cream' || c.foodTypes.some((f) => COFFEE_DESSERT.test(f))).slice(0, 10),
      outdoor: byDistance.filter((c) => c.seating.outdoor === true).slice(0, 10),
      gems: places.filter((c) => c.tags.includes('hidden-gem')),
      hoursKnown: places.filter((c) => c.hours.value != null).length,
    };
  }, [state.places, origin]);

  const hasPrefs = !!(profile?.preferredBudget || profile?.preferredNeighbourhood);
  const forYou = useMemo(() => {
    if (!hasPrefs) return [];
    const prefs: Preferences = { ...EMPTY_PREFERENCES, budget: profile?.preferredBudget ?? null };
    return recommend(state.places, prefs, { ratings, origin }).matches.slice(0, 8).map((m) => m.cafe);
  }, [hasPrefs, state.places, profile, ratings, origin]);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="page grid items-center gap-10 pb-6 pt-10 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:pt-20">
          <div className="min-w-0">
            <p className="eyebrow mb-4">{DEFAULT_CITY.name} · cafés &amp; third places</p>
            <h1 className="text-[44px] font-medium leading-[1.02] text-espresso sm:text-[64px] lg:text-[76px]">
              Find your <em className="font-normal text-sage-dark">kind</em> of place.
            </h1>
            <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-mocha">Quiet corners, coffee dates, spontaneous plans, and spaces that just feel right.</p>
            <div className="mt-8">
              <HeroSearch defaultBudget={profile?.preferredBudget} defaultArea={profile?.preferredNeighbourhood} />
            </div>
          </div>
          <div className="relative hidden lg:block" aria-hidden>
            <div className="grid grid-cols-5 grid-rows-6 gap-3" style={{ height: 560 }}>
              <SmartImage src={MOODS[0].image} alt="" className="col-span-3 row-span-4 rounded-[28px]" width={700} eager />
              <SmartImage src={MOODS[5].image} alt="" className="col-span-2 row-span-3 rounded-[28px]" width={420} eager />
              <SmartImage src={MOODS[6].image} alt="" className="col-span-2 row-span-3 rounded-[28px]" width={420} eager />
              <div className="col-span-3 row-span-2 flex flex-col justify-center rounded-[28px] bg-espresso p-6 text-ivory">
                <p className="font-serif text-2xl italic leading-snug">Not home. Not work.</p>
                <p className="font-serif text-2xl leading-snug text-sage">Your place.</p>
              </div>
            </div>
            <p className="mt-2 text-right text-[10.5px] text-latte">Mood photography: illustrative stock images (Unsplash), not listed venues.</p>
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
              className={`group relative overflow-hidden rounded-2xl focus-visible:ring-2 ${i === 0 ? 'col-span-2 row-span-2 aspect-square sm:aspect-auto lg:col-span-2' : 'aspect-[4/5]'}`}
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

      {/* Area discovery */}
      <Section
        eyebrow="Discover nearby"
        title={`Cafés around ${label}`}
        intro="Pick a neighbourhood or share your location (asked only when you tap)."
        action={<AreaPicker value={area} onChange={setArea} compact />}
        link={{ to: area.kind === 'neighbourhood' ? `/explore?area=${area.slug}` : '/explore', label: 'See all' }}
      >
        <PlacesStateView state={state} empty={<NoPlacesHere area={label} />} skeletonCount={4}>
          <Rail cafes={rails.nearby} distances={rails.d} />
        </PlacesStateView>
        <DataSourceNote meta={state.meta} enrichmentError={state.enrichmentError} className="mt-3" />
      </Section>

      {hasPrefs && forYou.length > 0 && (
        <Section
          eyebrow="Recommended for you"
          title="Picked for your preferences"
          intro={`Ranked for ${[profile?.preferredBudget && budgetOption(profile.preferredBudget)?.label, label].filter(Boolean).join(' around ')}. Unknown prices count against, not for.`}
          link={{ to: '/profile', label: 'Edit preferences' }}
        >
          <Rail cafes={forYou} distances={rails.d} />
        </Section>
      )}

      {rails.openNow.length > 0 && (
        <Section eyebrow="Right now" title={`Open now around ${label}`} intro={`Based on listed opening hours, in ${DEFAULT_CITY.name} time. Only ${rails.hoursKnown} of ${state.places.length} places here list hours.`}>
          <Rail cafes={rails.openNow} distances={rails.d} />
        </Section>
      )}

      {rails.wifi.length > 0 && (
        <Section eyebrow="Study & work" title="Wi-Fi listed" intro="Places whose listing says they have Wi-Fi. Source-provided, so check before a long session." link={{ to: '/study', label: 'Study Spots' }}>
          <Rail cafes={rails.wifi} distances={rails.d} />
        </Section>
      )}

      {rails.coffee.length > 0 && (
        <Section eyebrow="Coffee & dessert" title="Something sweet, something strong" link={{ to: '/mood/coffee-dessert', label: 'Explore' }}>
          <Rail cafes={rails.coffee} distances={rails.d} />
        </Section>
      )}

      {rails.outdoor.length > 0 && (
        <Section eyebrow="Fresh air" title="Outdoor seating listed">
          <Rail cafes={rails.outdoor} distances={rails.d} />
        </Section>
      )}

      {rails.gems.length > 0 && (
        <Section eyebrow="Hidden gems" title="Quietly wonderful" intro="Tagged by THIRD PLACE curators. An editorial pick, not a popularity ranking." link={{ to: '/hidden-gems', label: 'All hidden gems' }}>
          <Rail cafes={rails.gems} distances={rails.d} />
        </Section>
      )}

      <Section eyebrow="Neighbourhoods" title={`Explore ${DEFAULT_CITY.name} by neighbourhood`} link={{ to: '/neighbourhoods', label: 'All neighbourhoods' }}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {NEIGHBOURHOODS.slice(0, 15).map((n) => (
            <Link key={n.slug} to={`/explore?area=${n.slug}`} className="group rounded-2xl border border-oat/80 bg-ivory p-4 transition-colors hover:border-latte/60">
              <p className="font-serif text-lg leading-tight text-espresso">{n.name}</p>
              <p className="mt-1 line-clamp-2 text-xs text-mocha">{n.blurb}</p>
            </Link>
          ))}
        </div>
      </Section>

      {recent.length > 0 && (
        <Section eyebrow="Recently added" title="New verified listings" intro="Places added to THIRD PLACE’s own verified records, newest first.">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {recent.slice(0, 4).map((c) => (
              <div key={c.id}>
                <CafeCard cafe={c} />
                {c.createdAt && <p className="mt-2 pl-1 text-xs text-latte">Added {formatDate(c.createdAt)}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}

      <section className="page mt-20">
        <div className="flex flex-col gap-4 rounded-3xl bg-sand/60 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex items-start gap-3">
            <Database className="mt-1 shrink-0 text-sage-dark" aria-hidden />
            <p className="max-w-2xl text-[15px] leading-relaxed text-mocha">
              <strong className="text-espresso">Real places, honest details.</strong> Listings come from OpenStreetMap contributors. We show what the source says, label it as
              unverified, and never invent prices, ratings, hours or facilities. Missing a café near {neighbourhoodBySlug(profile?.preferredNeighbourhood ?? '')?.name ?? neighbourhoodName(null)}? You can add it to
              OpenStreetMap.
            </p>
          </div>
          <Link to="/about#data" className="btn-ghost shrink-0">
            How our data works
          </Link>
        </div>
      </section>
    </div>
  );
}
