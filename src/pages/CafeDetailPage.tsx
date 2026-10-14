import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, ExternalLink, Flag, FolderPlus, Globe, Info, MapPin, Navigation, Pencil, Phone, Share2, Volume2, Utensils, Armchair, Accessibility, ListChecks } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { ATMOSPHERE_LABELS, NOISE_LABELS, OCCASION_LABELS, neighbourhoodName } from '@/lib/taxonomy';
import { DAY_NAMES, directionsUrl, formatTime, isOpenAt } from '@/lib/geo';
import { zonedDayTime } from '@/lib/time';
import { getCity } from '@/lib/cities';
import { formatPriceRange } from '@/lib/format';
import { keyFromSlug } from '@/lib/places/keys';
import { usePlacesByKeys } from '@/hooks/usePlaces';
import { SmartImage } from '@/components/SmartImage';
import { SaveButton } from '@/components/SaveButton';
import { DemoLabel } from '@/components/DemoLabel';
import { VerificationBadge, formatDate } from '@/components/VerificationBadge';
import { FacilityTable } from '@/components/FacilityList';
import { StudySummaryCard } from '@/components/StudySummaryCard';
import { MenuList } from '@/components/MenuList';
import { ReviewSection } from '@/components/ReviewSection';
import { AddToCollectionDialog } from '@/components/AddToCollectionDialog';
import { ReportDialog } from '@/components/ReportDialog';
import { LazyMap } from '@/components/LazyMap';
import { CATEGORY_LABELS } from '@/components/CafeCard';
import { EmptyState, ErrorState } from '@/components/States';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { Cafe, ReportType } from '@/types';

export default function CafeDetailPage() {
  const { slug = '' } = useParams();
  const key = keyFromSlug(slug);
  const keys = useMemo(() => (key ? [key] : []), [key]);
  const state = usePlacesByKeys(keys);
  const cafe = state.places.find((p) => p.id === key);
  useDocumentTitle(cafe?.name ?? (state.status === 'loading' ? 'Loading' : 'Place not found'));

  if (!key) return <NotFound reason="That link doesn’t look like a THIRD PLACE listing." />;
  if (state.status === 'error' && !cafe) {
    return (
      <div className="page py-12">
        <ErrorState message={state.error ?? 'Could not load this place.'} onRetry={state.retryable ? state.retry : undefined} />
      </div>
    );
  }
  if (!cafe && state.status !== 'ready') {
    return (
      <div className="page py-10" aria-busy="true">
        <span className="sr-only">Loading place…</span>
        <div className="shimmer h-56 rounded-3xl" />
        <div className="shimmer mt-6 h-10 w-1/2 rounded" />
      </div>
    );
  }
  if (!cafe) return <NotFound reason="This place is no longer listed at its source, or the link is wrong." />;
  return <Detail cafe={cafe} />;
}

function NotFound({ reason }: { reason: string }) {
  return (
    <div className="page py-16">
      <EmptyState
        title="We couldn’t find that place"
        action={
          <Link to="/explore" className="btn-primary">
            Explore places
          </Link>
        }
      >
        {reason}
      </EmptyState>
    </div>
  );
}

function Detail({ cafe }: { cafe: Cafe }) {
  const toast = useToast();
  const [collectOpen, setCollectOpen] = useState(false);
  const [report, setReport] = useState<{ open: boolean; type: ReportType; n: number }>({ open: false, type: 'facility', n: 0 });
  const city = getCity(cafe.city);
  const dir = directionsUrl(cafe);
  const price = formatPriceRange(cafe);
  const now = zonedDayTime(city.timezone);
  const openNow = isOpenAt(cafe.hours.value, now.day, now.time);
  const openReport = (type: ReportType) => setReport((r) => ({ open: true, type, n: r.n + 1 }));
  const subtitle = cafe.tagline || [CATEGORY_LABELS[cafe.category], ...cafe.foodTypes.slice(0, 4)].join(' · ');

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: cafe.name, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.show('Link copied');
      }
    } catch {
      /* share cancelled */
    }
  };

  return (
    <article>
      <div className="page pt-6">
        <Link to="/explore" className="btn-link !no-underline text-mocha">
          <ArrowLeft size={15} aria-hidden /> All places
        </Link>
      </div>

      {cafe.isDemo && (
        <div className="page mt-4">
          <div className="flex items-start gap-3 rounded-2xl border border-espresso/15 bg-ivory p-4 text-sm text-mocha">
            <DemoLabel className="mt-0.5 shrink-0" />
            <p>
              <strong className="text-espresso">Fictional demo record (development mode).</strong> {cafe.name} is not a real business.
            </p>
          </div>
        </div>
      )}

      {/* Header media: real photos if any, otherwise the map. Never stock photos for a real place. */}
      <div className="page mt-5">
        {cafe.photos.length > 0 ? (
          <>
            <div className="grid gap-2 sm:grid-cols-[2fr_1fr] sm:gap-3">
              <SmartImage src={cafe.photos[0].url} alt={cafe.photos[0].alt} label={cafe.name} className="aspect-[4/3] rounded-3xl sm:aspect-[16/10]" width={1100} eager />
              <div className="hidden sm:grid">
                <SmartImage src={cafe.photos[1]?.url ?? cafe.photos[0].url} alt={cafe.photos[1]?.alt ?? ''} className="h-full rounded-3xl" width={520} />
              </div>
            </div>
            {cafe.photos.some((p) => p.isIllustrative) && <p className="mt-2 text-xs text-latte">Illustrative stock photos. They don’t show this place.</p>}
            {cafe.photos[0].credit && !cafe.photos[0].isIllustrative && <p className="mt-2 text-xs text-latte">Photo: {cafe.photos[0].credit}</p>}
          </>
        ) : cafe.lat != null && cafe.lng != null ? (
          <LazyMap cafes={[cafe]} single className="h-56 sm:h-72" />
        ) : (
          <SmartImage src={null} alt="" label={cafe.name} className="h-40 rounded-3xl" />
        )}
      </div>

      <div className="page mt-8 grid gap-10 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-12">
          <header>
            <p className="eyebrow flex items-center gap-1.5">
              <MapPin size={12} aria-hidden /> {cafe.neighbourhood ? `${neighbourhoodName(cafe.neighbourhood)}, ` : ''}
              {city.name}
            </p>
            <h1 className="mt-2 text-4xl leading-tight sm:text-5xl">{cafe.name}</h1>
            {subtitle && <p className="mt-2 font-serif text-xl italic text-mocha">{subtitle}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {price ? (
                <span className="rounded-full bg-sand px-3 py-1 text-sm">
                  {price} per person <VerificationBadge status={cafe.priceStatus} compact />
                </span>
              ) : (
                <span className="rounded-full bg-sand px-3 py-1 text-sm text-mocha">Price not known</span>
              )}
              {openNow != null ? (
                <span className={`rounded-full px-3 py-1 text-sm ${openNow ? 'bg-sage-light text-sage-dark' : 'bg-clay-light text-[#8A4F2E]'}`}>
                  {openNow ? 'Open now' : 'Closed now'} <span className="opacity-70">(listed hours, {city.name} time)</span>
                </span>
              ) : (
                <span className="rounded-full border border-dashed border-oat px-3 py-1 text-sm text-latte">Opening hours not verified</span>
              )}
              {cafe.atmosphere.map((a) => (
                <span key={a} className="rounded-full border border-oat px-3 py-1 text-sm text-mocha">
                  {ATMOSPHERE_LABELS[a]}
                </span>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <SaveButton cafeId={cafe.id} name={cafe.name} variant="full" />
              <button onClick={() => setCollectOpen(true)} className="btn-ghost">
                <FolderPlus size={16} aria-hidden /> Add to collection
              </button>
              {dir && (
                <a href={dir} target="_blank" rel="noopener noreferrer" className="btn-ghost">
                  <Navigation size={16} aria-hidden /> Directions
                </a>
              )}
              <button onClick={() => void share()} className="btn-ghost" aria-label="Share this place">
                <Share2 size={16} aria-hidden />
              </button>
            </div>
          </header>

          {(cafe.description || cafe.occasions.length > 0) && (
            <section>
              {cafe.description && <p className="max-w-2xl text-[17px] leading-relaxed text-espresso">{cafe.description}</p>}
              {cafe.occasions.length > 0 && (
                <p className="mt-4 text-sm text-mocha">
                  <span className="text-latte">Good for (verified):</span> {cafe.occasions.map((o) => OCCASION_LABELS[o]).join(' · ')}
                </p>
              )}
            </section>
          )}

          <Block title="Study & work suitability" id="study">
            <StudySummaryCard cafe={cafe} />
            <button onClick={() => openReport('facility')} className="btn-link mt-3 text-mocha">
              <Flag size={13} aria-hidden /> Know whether there’s Wi-Fi, sockets or quiet tables? Tell us
            </button>
          </Block>

          <Block title="Facilities" id="facilities" aside="Each row shows where the information comes from. “Not verified” means nobody has told us yet.">
            <FacilityTable cafe={cafe} />
          </Block>

          <Block title="Atmosphere & seating" id="seating">
            <div className="grid gap-4 sm:grid-cols-2">
              <Fact icon={<Volume2 size={17} />} label="Noise level">
                {cafe.noise.value ? NOISE_LABELS[cafe.noise.value] : 'Not verified'} <VerificationBadge status={cafe.noise.status} date={cafe.noise.lastVerified} />
              </Fact>
              <Fact icon={<Armchair size={17} />} label="Seating">
                {[cafe.seating.indoor === true && 'Indoor', cafe.seating.outdoor === true && 'Outdoor'].filter(Boolean).join(' & ') || 'Not verified'}
                {cafe.seating.indoor === false && <span className="block text-[13px] text-mocha">No indoor seating listed</span>}
                {cafe.seating.groupFriendly === true && ' · group-friendly'}
                {cafe.seating.note && <span className="mt-1 block text-[13px] text-mocha">{cafe.seating.note}</span>}
              </Fact>
              <Fact icon={<Utensils size={17} />} label="Food & dietary">
                {cafe.foodTypes.join(', ') || 'Not listed'}
                <span className="mt-1 block text-[13px] text-mocha">
                  {cafe.dietary.value?.veg === true ? 'Vegetarian options' : cafe.dietary.value?.veg === false ? 'No vegetarian options' : 'Vegetarian options not verified'}
                  {' · '}
                  {cafe.dietary.value?.nonVeg === true ? 'Non-veg served' : cafe.dietary.value?.nonVeg === false ? 'No non-veg' : 'Non-veg not verified'}{' '}
                  <VerificationBadge status={cafe.dietary.status} compact />
                </span>
              </Fact>
              <Fact icon={<Accessibility size={17} />} label="Accessibility">
                {cafe.accessibilityNote ?? (cafe.facilities.find((f) => f.key === 'wheelchair_access')?.available === true ? 'Step-free access listed' : 'No accessibility information yet.')}
              </Fact>
            </div>
            {cafe.extras.length > 0 && (
              <div className="mt-4 rounded-2xl border border-oat p-4">
                <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-latte">
                  <ListChecks size={14} aria-hidden /> Other details at the source
                </p>
                <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  {cafe.extras.map((x) => (
                    <div key={x.label} className="flex justify-between gap-3">
                      <dt className="text-latte">{x.label}</dt>
                      <dd className="text-right text-espresso">{x.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </Block>

          <Block title="Menu" id="menu" aside={cafe.isDemo ? 'Illustrative demo menu, not a real price list.' : undefined}>
            {cafe.menu === null ? (
              <p className="rounded-2xl border border-dashed border-oat p-5 text-sm text-mocha">
                We don’t have menu or price information for {cafe.name} yet. We only show menus the café provides or that our team has verified.
              </p>
            ) : (
              <MenuList items={cafe.menu} />
            )}
            <button onClick={() => openReport('menu_price')} className="btn-link mt-3 text-mocha">
              <Flag size={13} aria-hidden /> {cafe.menu ? 'Report a wrong price' : 'Share menu or price information'}
            </button>
          </Block>

          <ReviewSection cafeId={cafe.id} cafeName={cafe.name} />
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <div className="card divide-y divide-oat/60 p-5">
            <Side icon={<MapPin size={16} />} title="Address">
              <p>{cafe.address ?? 'Street address not listed'}</p>
              {cafe.lat != null && cafe.lng != null && (
                <p className="mt-1 text-xs text-latte">
                  {cafe.lat.toFixed(5)}, {cafe.lng.toFixed(5)}
                </p>
              )}
            </Side>
            <Side icon={<Clock size={16} />} title="Opening hours">
              {cafe.hours.value ? (
                <>
                  {cafe.hours.value.length === 0 ? (
                    <p className="text-sm">Listed as closed every day.</p>
                  ) : (
                    <ul className="space-y-0.5 text-sm">
                      {DAY_NAMES.map((d, i) => {
                        const slots = cafe.hours.value!.filter((s) => s.day === i);
                        return (
                          <li key={d} className={`flex justify-between gap-3 ${i === now.day ? 'font-medium text-espresso' : 'text-mocha'}`}>
                            <span>{d.slice(0, 3)}</span>
                            <span className="text-right">{slots.length ? slots.map((s) => `${formatTime(s.open)} – ${formatTime(s.close)}`).join(', ') : 'Closed'}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <div className="mt-2">
                    <VerificationBadge status={cafe.hours.status} date={cafe.hours.lastVerified} />
                  </div>
                  <p className="mt-1 text-xs text-latte">Times in {city.name} time ({city.timezone}).</p>
                  {cafe.hoursNote && <p className="mt-1 text-xs text-latte">{cafe.hoursNote}</p>}
                </>
              ) : cafe.hoursParse === 'unsupported' && cafe.rawOpeningHours ? (
                <>
                  <p className="text-sm">The source lists:</p>
                  <p className="mt-1 break-words rounded-lg bg-cream px-2 py-1 font-mono text-xs text-espresso">{cafe.rawOpeningHours}</p>
                  <p className="mt-1 text-xs text-latte">We can’t interpret this format reliably, so we don’t show open/closed status.</p>
                </>
              ) : (
                <p className="text-sm text-latte">Opening hours not listed.</p>
              )}
              <button onClick={() => openReport('opening_hours')} className="btn-link mt-2 text-xs text-mocha">
                Hours wrong or missing?
              </button>
            </Side>
            <Side icon={<Globe size={16} />} title="Contact">
              {cafe.website || cafe.phone || cafe.instagram ? (
                <ul className="space-y-1 text-sm">
                  {cafe.website && (
                    <li>
                      <a href={cafe.website} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 underline">
                        Website <ExternalLink size={12} aria-hidden />
                      </a>
                    </li>
                  )}
                  {cafe.phone && (
                    <li className="flex items-center gap-1">
                      <Phone size={13} aria-hidden /> <a href={`tel:${cafe.phone.replace(/[^\d+]/g, '')}`}>{cafe.phone}</a>
                    </li>
                  )}
                  {cafe.instagram && <li>Instagram: {cafe.instagram}</li>}
                </ul>
              ) : (
                <p className="text-sm text-latte">No contact details listed.</p>
              )}
            </Side>
            <Side icon={<Info size={16} />} title="Where this information comes from">
              <SourceBox cafe={cafe} />
              <button onClick={() => openReport('other')} className="btn-ghost mt-3 w-full !py-2 text-sm">
                <Flag size={14} aria-hidden /> Report incorrect information
              </button>
            </Side>
          </div>
          {cafe.photos.length > 0 && cafe.lat != null && cafe.lng != null && <LazyMap cafes={[cafe]} single className="h-64" />}
        </aside>
      </div>

      <AddToCollectionDialog open={collectOpen} onClose={() => setCollectOpen(false)} cafeId={cafe.id} cafeName={cafe.name} />
      <ReportDialog key={report.n} open={report.open} onClose={() => setReport((r) => ({ ...r, open: false }))} cafeId={cafe.id} cafeName={cafe.name} initialType={report.type} />
    </article>
  );
}

function SourceBox({ cafe }: { cafe: Cafe }) {
  const s = cafe.source;
  return (
    <div className="space-y-1.5 text-sm">
      {s.provider === 'openstreetmap' ? (
        <>
          <p>
            Listed on{' '}
            <a href={s.url ?? 'https://www.openstreetmap.org'} target="_blank" rel="noopener noreferrer" className="underline">
              OpenStreetMap ({s.externalId})
            </a>
            , {s.attribution}, {s.license}.
          </p>
          {s.fetchedAt && <p className="text-xs text-latte">Fetched {formatDate(s.fetchedAt)}. Fetching isn’t verification.</p>}
          {s.editUrl && (
            <a href={s.editUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs underline">
              <Pencil size={12} aria-hidden /> Fix it at the source
            </a>
          )}
        </>
      ) : (
        <p>Source: {cafe.dataSource}</p>
      )}
      {cafe.dataSource.includes('THIRD PLACE') && <p className="text-xs text-latte">Some details verified by THIRD PLACE; each shows its own status.</p>}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <VerificationBadge status={cafe.verificationStatus} date={cafe.lastVerified} />
      </div>
    </div>
  );
}

function Block({ title, id, aside, children }: { title: string; id: string; aside?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-h`} id={id} className="scroll-mt-28">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`${id}-h`} className="text-3xl">
          {title}
        </h2>
        {aside && <p className="max-w-md text-xs text-latte">{aside}</p>}
      </div>
      {children}
    </section>
  );
}

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-ivory p-4 shadow-card">
      <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-latte">
        <span aria-hidden>{icon}</span> {label}
      </p>
      <div className="text-[15px] text-espresso">{children}</div>
    </div>
  );
}

function Side({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <h3 className="mb-1.5 flex items-center gap-2 font-sans text-sm font-semibold text-espresso">
        <span className="text-latte" aria-hidden>
          {icon}
        </span>
        {title}
      </h3>
      <div className="text-mocha">{children}</div>
    </div>
  );
}
