import { Link, useLocation } from 'react-router-dom';
import { Compass, Search, Bookmark, UserRound } from 'lucide-react';

const TABS = [
  { to: '/', label: 'Explore', icon: Compass, match: (p: string) => p === '/' || /^\/(explore|mood|study|hidden-gems|cafe|neighbourhoods|menu)/.test(p) },
  { to: '/search', label: 'Search', icon: Search, match: (p: string) => p.startsWith('/search') || p.startsWith('/find') },
  { to: '/saved', label: 'Saved', icon: Bookmark, match: (p: string) => p.startsWith('/saved') || p.startsWith('/collections') },
  { to: '/profile', label: 'Profile', icon: UserRound, match: (p: string) => /^\/(profile|login|signup|about)/.test(p) },
];

export function MobileTabBar() {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Primary" className="safe-bottom fixed inset-x-0 bottom-0 z-[600] border-t border-oat/70 bg-ivory/95 backdrop-blur-md md:hidden">
      <ul className="grid grid-cols-4">
        {TABS.map(({ to, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={to}>
              <Link
                to={to}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${active ? 'text-espresso' : 'text-latte'}`}
              >
                <Icon size={21} strokeWidth={active ? 2.2 : 1.7} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
