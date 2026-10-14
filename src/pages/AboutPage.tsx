import { Link } from 'react-router-dom';
import { VerificationBadge } from '@/components/VerificationBadge';
import { VERIFICATION_HELP } from '@/lib/taxonomy';
import { config } from '@/lib/config';
import { DEFAULT_CITY } from '@/lib/cities';
import type { VerificationStatus } from '@/types';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const STATUSES: VerificationStatus[] = ['cafe_verified', 'visitor_confirmed', 'source_provided', 'community_reported', 'unverified', 'unknown'];

export default function AboutPage() {
  useDocumentTitle('About');
  return (
    <div className="page max-w-3xl pt-10">
      <p className="eyebrow">About</p>
      <h1 className="mt-2 text-4xl sm:text-5xl">Not home. Not work. Your place.</h1>
      <div className="mt-6 space-y-5 text-[17px] leading-relaxed text-espresso">
        <p>
          Sociologists call them “third places”: the cafés, reading rooms and hangouts that aren’t home or work but hold a city together. THIRD PLACE helps you find the right one in{' '}
          {DEFAULT_CITY.name} by mood, purpose, budget, location and facilities, without scrolling through dozens of listings.
        </p>
        <p>You describe what you need. We shortlist real places that match, explain why, and tell you plainly what we don’t know.</p>
      </div>

      <h2 id="data" className="mt-12 scroll-mt-28 text-3xl">
        Where our data comes from
      </h2>
      <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-mocha">
        <p>
          <strong className="text-espresso">Places</strong> come from{' '}
          <a href="https://www.openstreetmap.org/" target="_blank" rel="noopener noreferrer" className="underline">
            OpenStreetMap
          </a>
          , the community-built map (© OpenStreetMap contributors, available under the{' '}
          <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noopener noreferrer" className="underline">
            Open Database License
          </a>
          ). We use cafés, coffee shops and ice-cream shops, refreshed a few times a day from a shared snapshot. That way your browsing never overloads the volunteer-run servers.
        </p>
        <p>
          OpenStreetMap doesn’t list every café, and many listings have only a name and location. We show exactly what each listing says: name, address, opening hours, cuisine,
          Wi-Fi, seating, accessibility and contact details, <em>only when supplied</em>. Each fact is labelled “source-provided”, which means not verified by us.
        </p>
        <p>
          <strong className="text-espresso">Menus, prices and verified facilities</strong> appear only when a café provides them or our team verifies them. Public map data
          doesn’t include menus, and we never estimate prices.
        </p>
        <p>
          <strong className="text-espresso">Reviews and reports</strong> come from signed-in members. Ratings are averages of real reviews. Reports of wrong information stay
          “community-reported” until a moderator checks them.
        </p>
        <p>
          Spot a mistake in a listing? Every place page links to the source so anyone can fix it, and you can also report it to us.
        </p>
      </div>

      <h2 className="mt-12 text-3xl">How we label information</h2>
      <ul className="mt-4 space-y-3">
        {STATUSES.map((s) => (
          <li key={s} className="flex flex-wrap items-center gap-3">
            <VerificationBadge status={s} />
            <span className="text-sm text-mocha">{VERIFICATION_HELP[s]}</span>
          </li>
        ))}
      </ul>
      <ul className="mt-6 list-disc space-y-2 pl-5 text-[15px] text-mocha">
        <li>Unknown information is never treated as a yes. “Must-have” filters only show places with evidence; “nice-to-have” ranks by evidence.</li>
        <li>Fetching data again isn’t verification: the “fetched” date and the “verified” date are separate.</li>
        <li>No visitor counts, trending lists, popularity scores or invented ratings.</li>
        <li>We don’t infer facilities or ambience from a café’s name, neighbourhood or photos.</li>
        <li>“Open now” uses listed hours in {DEFAULT_CITY.name} time ({DEFAULT_CITY.timezone}). If hours are missing or in a format we can’t read, we say so.</li>
        <li>Your location is requested only when you tap “Near me”. It’s rounded to about 1 km before any request leaves your device, and never stored or sent to an AI provider.</li>
      </ul>

      <h2 id="demo" className="mt-12 scroll-mt-28 text-3xl">
        This deployment
      </h2>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-[15px] text-mocha">
        <li>Place data: {config.demoMode ? 'development demo mode (fictional sample cafés)' : 'live OpenStreetMap snapshot'}</li>
        <li>Accounts, synced saves and public reviews: {config.supabaseConfigured ? 'enabled' : 'not configured. Saves stay on this device.'}</li>
        <li>Map tiles: {config.map.enabled ? (config.map.usingDefaultTiles ? 'OpenStreetMap community tiles' : 'configured tile provider') : 'disabled'}</li>
        <li>AI-assisted search: {config.aiSearchEnabled ? 'enabled, with a rule-based fallback' : 'off; search uses the rule-based parser'}</li>
      </ul>

      <div className="mt-12 flex gap-3">
        <Link to="/find" className="btn-primary">
          Find My Place
        </Link>
        <Link to="/explore" className="btn-ghost">
          Explore
        </Link>
      </div>
    </div>
  );
}
