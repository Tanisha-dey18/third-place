import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Flag, FolderPlus, Globe, Info, MapPin, Navigation, Phone, Share2, Volume2, Utensils, Armchair, Accessibility } from 'lucide-react';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { ATMOSPHERE_LABELS, NOISE_LABELS, OCCASION_LABELS, neighbourhoodName } from '@/lib/taxonomy';
import { DAY_NAMES, directionsUrl, formatTime, isOpenAt } from '@/lib/geo';
import { formatPriceRange } from '@/lib/format';
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
import { EmptyState, ErrorState } from '@/components/States';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { ReportType } from '@/types';

export default function CafeDetailPage() {
  const { slug = '' } = useParams();
  const { bySlug, loading, error, retry } = useData();
  const toast = useToast();
  const cafe = bySlug(slug);
  const [collectOpen, setCollectOpen] = useState(false);
  const [report, setReport] = useState<{ open: boolean; type: ReportType; n: number }>({ open: false, type: 'facility', n: 0 });
  useDocumentTitle(cafe?.name ?? (loading ? 'Loading' : 'Place not found'));

  if (error) return <div className="page py-12"><ErrorState message={error} onRetry={retry} /></div>;
  if (loading) {
    return (
      <div className="page py-10" aria-busy="true">
        <div className="shimmer aspect-[16/7] rounded-3xl" />
        <div className="shimmer mt-6 h-10 w-1/2 rounded" />
      </div>
    );
  }
  if (!cafe) {
    return (
      <div className="page py-16">
        <EmptyState title="We couldn’t find that place" action={<Link to="/explore" className="btn-primary">Explore places</Link>}>
          It may have been removed or the link may be wrong.
        </EmptyState>
      </div>
    );
  }

  const dir = directionsUrl(cafe);
  const price = formatPriceRange(cafe);
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const openNow = isOpenAt(cafe.hours.value, now.getDay(), hhmm);
  const openReport = (type: ReportType) => setReport((r) => ({ open: true, type, n: r.n + 1 }));

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: cafe.name, text: cafe.tagline, url });
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
              <strong className="text-espresso">This is a fictional demo record.</strong> {cafe.name} is not a real business. Its address, menu, prices, hours and facility statuses are
              illustrative and only demonstrate how THIRD PLACE labels verified, community-reported and unknown information.
            </p>
          </div>
        </div>
      )}

      {/* Gallery */}
      <div className="page mt-5">
        <div className="grid gap-2 sm:grid-cols-[2fr_1fr] sm:gap-3">
          <SmartImage src={cafe.photos[0]?.url} alt={cafe.photos[0]?.alt ?? cafe.name} label={cafe.name} className="aspect-[4/3] rounded-3xl sm:aspect-[16/10]" width={1100} eager />
          <div className="hidden gap-3 sm:grid">
            <SmartImage src={cafe.photos[1]?.url ?? cafe.photos[0]?.url} alt={cafe.photos[1]?.alt ?? ''} className="h-full rounded-3xl" width={520} />
          </div>
        </div>
        {cafe.photos.some((p) => p.isIllustrative) && (
          <p className="mt-2 text-xs text-latte">Illustrative stock photos via Unsplash. They don’t show this place.</p>
        )}
      </div>

      <div className="page mt-8 grid gap-10 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-12">
          {/* Title block */}
          <header>
            <p className="eyebrow flex items-center gap-1.5">
              <MapPin size={12} aria-hidden /> {neighbourhoodName(cafe.neighbourhood)}, Kolkata
            </p>
            <h1 className="mt-2 text-4xl leading-tight sm:text-5xl">{cafe.name}</h1>
            <p className="mt-2 font-serif text-xl italic text-mocha">{cafe.tagline}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {price ? (
                <span className="rounded-full bg-sand px-3 py-1 text-sm">
                  {price} per person <VerificationBadge status={cafe.priceStatus} compact />
                </span>
              ) : (
                <span className="rounded-full bg-sand px-3 py-1 text-sm text-latte">Price not confirmed</span>
              )}
              {openNow != null && (
                <span className={`rounded-full px-3 py-1 text-sm ${openNow ? 'bg-sage-light text-sage-dark' : 'bg-clay-light text-[#8A4F2E]'}`}>
                  {openNow ? 'Open now' : 'Closed now'}
                </span>
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
              <button onClick={() => void share()} className="btn-ghost" aria-label="Share">
                <Share2 size={16} aria-hidden />
              </button>
            </div>
          </header>

          <section>
            <p className="max-w-2xl text-[17px] leading-relaxed text-espresso">{cafe.description}</p>
            {cafe.occasions.length > 0 && (
              <p className="mt-4 text-sm text-mocha">
                <span className="text-latte">Good for:</span> {cafe.occasions.map((o) => OCCASION_LABELS[o]).join(' · ')}
              </p>
            )}
          </section>

          <Block title="Study & work suitability" id="study">
            <StudySummaryCard cafe={cafe} />
            <button onClick={() => openReport('facility')} className="btn-link mt-3 text-mocha">
              <Flag size={13} aria-hidden /> Missing sockets, bad Wi-Fi or too noisy? Tell us
            </button>
          </Block>

          <Block title="Facilities" id="facilities" aside="Every row shows its own source and when it was last checked.">
            <FacilityTable cafe={cafe} />
          </Block>

          <Block title="Atmosphere & seating" id="seating">
            <div className="grid gap-4 sm:grid-cols-2">
              <Fact icon={<Volume2 size={17} />} label="Noise level">
                {cafe.noise.value ? NOISE_LABELS[cafe.noise.value] : 'Unknown'} <VerificationBadge status={cafe.noise.status} date={cafe.noise.lastVerified} />
              </Fact>
              <Fact icon={<Armchair size={17} />} label="Seating">
                {[cafe.seating.indoor === true && 'Indoor', cafe.seating.outdoor === true && 'Outdoor'].filter(Boolean).join(' & ') || 'Not confirmed'}
                {cafe.seating.groupFriendly === true && ' · group-friendly'}
                {cafe.seating.note && <span className="mt-1 block text-[13px] text-mocha">{cafe.seating.note}</span>}
              </Fact>
              <Fact icon={<Utensils size={17} />} label="Food & dietary">
                {cafe.foodTypes.join(', ') || 'Not listed'}
                <span className="mt-1 block text-[13px] text-mocha">
                  {cafe.dietary.value?.veg === true ? 'Vegetarian options' : cafe.dietary.value?.veg === false ? 'No vegetarian options' : 'Vegetarian options unconfirmed'}
                  {' · '}
                  {cafe.dietary.value?.nonVeg === true ? 'Non-veg served' : cafe.dietary.value?.nonVeg === false ? 'No non-veg' : 'Non-veg unconfirmed'}{' '}
                  <VerificationBadge status={cafe.dietary.status} compact />
                </span>
              </Fact>
              <Fact icon={<Accessibility size={17} />} label="Accessibility">
                {cafe.accessibilityNote ?? 'No accessibility information yet.'}
              </Fact>
            </div>
          </Block>

          <Block title="Menu" id="menu" aside={cafe.isDemo ? 'Illustrative demo menu, not a real price list.' : undefined}>
            <MenuList items={cafe.menu} />
            <button onClick={() => openReport('menu_price')} className="btn-link mt-3 text-mocha">
              <Flag size={13} aria-hidden /> Report a wrong price
            </button>
          </Block>

          <ReviewSection cafeId={cafe.id} cafeName={cafe.name} />
        </div>

        {/* Sidebar */}
        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <div className="card divide-y divide-oat/60 p-5">
            <Side icon={<MapPin size={16} />} title="Address">
              <p>{cafe.address ?? 'Address not available'}</p>
              {cafe.lat != null && cafe.lng != null && (
                <p className="mt-1 text-xs text-latte">
                  {cafe.lat.toFixed(4)}, {cafe.lng.toFixed(4)}
                  {cafe.isDemo && ' (approximate, illustrative)'}
                </p>
              )}
            </Side>
            <Side icon={<Clock size={16} />} title="Opening hours">
              {cafe.hours.value && cafe.hours.value.length ? (
                <>
                  <ul className="space-y-0.5 text-sm">
                    {DAY_NAMES.map((d, i) => {
                      const slot = cafe.hours.value!.find((s) => s.day === i);
                      return (
                        <li key={d} className={`flex justify-between gap-3 ${i === now.getDay() ? 'font-medium text-espresso' : 'text-mocha'}`}>
                          <span>{d.slice(0, 3)}</span>
                          <span>{slot ? `${formatTime(slot.open)} – ${formatTime(slot.close)}` : 'Closed'}</span>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="mt-2">
                    <VerificationBadge status={cafe.hours.status} date={cafe.hours.lastVerified} />
                  </div>
                </>
              ) : (
                <p className="text-sm text-latte">Opening hours not verified yet.</p>
              )}
              <button onClick={() => openReport('opening_hours')} className="btn-link mt-2 text-xs text-mocha">
                Hours wrong?
              </button>
            </Side>
            <Side icon={<Globe size={16} />} title="Contact">
              {cafe.website || cafe.phone || cafe.instagram ? (
                <ul className="space-y-1 text-sm">
                  {cafe.website && (
                    <li>
                      <a href={cafe.website} target="_blank" rel="noopener noreferrer" className="underline">
                        Website
                      </a>
                    </li>
                  )}
                  {cafe.phone && (
                    <li className="flex items-center gap-1">
                      <Phone size={13} aria-hidden /> <a href={`tel:${cafe.phone}`}>{cafe.phone}</a>
                    </li>
                  )}
                  {cafe.instagram && <li>Instagram: {cafe.instagram}</li>}
                </ul>
              ) : (
                <p className="text-sm text-latte">No contact details available.</p>
              )}
            </Side>
            <Side icon={<Info size={16} />} title="About this information">
              <p className="text-sm">Source: {cafe.dataSource}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <VerificationBadge status={cafe.verificationStatus} date={cafe.lastVerified} />
              </div>
              <p className="mt-2 text-xs text-latte">Listed {formatDate(cafe.createdAt)}</p>
              <button onClick={() => openReport('other')} className="btn-ghost mt-3 w-full !py-2 text-sm">
                <Flag size={14} aria-hidden /> Report incorrect information
              </button>
            </Side>
          </div>
          {cafe.lat != null && cafe.lng != null && <LazyMap cafes={[cafe]} single className="h-64" />}
        </aside>
      </div>

      <AddToCollectionDialog open={collectOpen} onClose={() => setCollectOpen(false)} cafeId={cafe.id} cafeName={cafe.name} />
      <ReportDialog key={report.n} open={report.open} onClose={() => setReport((r) => ({ ...r, open: false }))} cafeId={cafe.id} cafeName={cafe.name} initialType={report.type} />
    </article>
  );
}

function Block({ title, id, aside, children }: { title: string; id: string; aside?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-h`} id={id} className="scroll-mt-28">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`${id}-h`} className="text-3xl">
          {title}
        </h2>
        {aside && <p className="text-xs text-latte">{aside}</p>}
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
