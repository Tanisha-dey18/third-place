import { Link } from 'react-router-dom';
import { VerificationBadge } from '@/components/VerificationBadge';
import { VERIFICATION_HELP } from '@/lib/taxonomy';
import { config, isDemoData } from '@/lib/config';
import type { VerificationStatus } from '@/types';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const STATUSES: VerificationStatus[] = ['cafe_verified', 'visitor_confirmed', 'community_reported', 'unverified', 'unknown'];

export default function AboutPage() {
  useDocumentTitle('About');
  return (
    <div className="page max-w-3xl pt-10">
      <p className="eyebrow">About</p>
      <h1 className="mt-2 text-4xl sm:text-5xl">Not home. Not work. Your place.</h1>
      <div className="mt-6 space-y-5 text-[17px] leading-relaxed text-espresso">
        <p>
          Sociologists call them “third places”: the cafés, reading rooms and hangouts that aren’t home or work but hold a city together. THIRD PLACE helps you find the right one in
          Kolkata by mood, purpose, budget, location and facilities, without scrolling through dozens of listings.
        </p>
        <p>You describe what you need. We shortlist places that genuinely match, explain why, and tell you plainly what we don’t know.</p>
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
        <li>Unknown information is never treated as a yes. “Laptop-friendly” never implies charging points or Wi-Fi.</li>
        <li>Ratings are averaged from real review records only. We never seed reviews, ratings, visitor counts or “trending” lists.</li>
        <li>“Bestseller” labels appear only with a recorded source (café-provided data or reliable popularity records).</li>
        <li>Community reports are shown as community-reported until confirmed.</li>
        <li>Your location is requested only when you ask for nearby results, and it isn’t stored or sent to any AI provider.</li>
      </ul>

      <h2 id="demo" className="mt-12 scroll-mt-28 text-3xl">
        Demo mode
      </h2>
      <div className="mt-4 space-y-3 text-[15px] text-mocha">
        {isDemoData ? (
          <p>
            <strong className="text-espresso">This deployment is running on demo data.</strong> Every café you see is fictional, and its name, address, menu, prices, hours and facility statuses are
            illustrative. Coordinates are placed near real neighbourhood centres so the map and distance sorting can be demonstrated. Photos are generic stock images.
          </p>
        ) : (
          <p>This deployment reads café records from the database. Any record marked “Demo” is fictional sample data.</p>
        )}
        <ul className="list-disc space-y-1 pl-5">
          <li>Accounts: {config.supabaseConfigured ? 'enabled (Supabase Auth)' : 'disabled. Saved places and collections are stored in this browser only.'}</li>
          <li>Map: {config.map.enabled ? 'enabled' : 'disabled for this deployment'}</li>
          <li>AI-assisted search: {config.aiSearchEnabled ? 'enabled, with a rule-based fallback' : 'off. Search uses the deterministic rule-based parser.'}</li>
        </ul>
      </div>

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
