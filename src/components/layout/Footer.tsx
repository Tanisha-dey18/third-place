import { Link } from 'react-router-dom';
import { Logo } from '../Logo';
import { isDemoData } from '@/lib/config';

export function Footer() {
  return (
    <footer className="mt-24 border-t border-oat/70 bg-sand/40 pb-24 pt-12 md:pb-12">
      <div className="page grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs font-serif text-lg italic text-mocha">Not home. Not work. Your place.</p>
          <p className="mt-3 max-w-sm text-xs leading-relaxed text-latte">
            Starting with Kolkata. We label where every fact comes from and never invent ratings, reviews or popularity.
            {isDemoData && ' Development demo mode: café records shown are fictional.'}
          </p>
        </div>
        <FooterCol title="Discover" links={[['/explore', 'Explore'], ['/find', 'Find My Place'], ['/study', 'Study Spots'], ['/menu', 'Menu explorer']]} />
        <FooterCol title="Kolkata" links={[['/neighbourhoods', 'Neighbourhoods'], ['/hidden-gems', 'Hidden Gems'], ['/mood/date', 'Date Spots'], ['/collections', 'Collections']]} />
        <FooterCol title="THIRD PLACE" links={[['/about', 'About & data policy'], ['/saved', 'Saved places'], ['/profile', 'Profile']]} />
      </div>
      <p className="page mt-10 text-[11px] text-latte">
        Place and map data ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">
          OpenStreetMap contributors
        </a>{' '}
        (ODbL). Mood photography: illustrative stock images via Unsplash, not listed venues.
      </p>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h3 className="eyebrow mb-3 font-sans">{title}</h3>
      <ul className="space-y-2">
        {links.map(([to, label]) => (
          <li key={to}>
            <Link to={to} className="text-sm text-mocha hover:text-espresso">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
