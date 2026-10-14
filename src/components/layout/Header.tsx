import { Link, NavLink } from 'react-router-dom';
import { Search, UserRound, Sparkles } from 'lucide-react';
import { Logo } from '../Logo';
import { useAuth } from '@/context/AuthContext';

const NAV = [
  { to: '/explore', label: 'Explore' },
  { to: '/study', label: 'Study Spots' },
  { to: '/mood/date', label: 'Date Spots' },
  { to: '/hidden-gems', label: 'Hidden Gems' },
  { to: '/collections', label: 'Collections' },
];

export function Header() {
  const { user, configured } = useAuth();
  return (
    <header className="sticky top-0 z-[500] border-b border-oat/60 bg-cream/85 backdrop-blur-md">
      <div className="page flex h-16 items-center justify-between gap-6">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `rounded-full px-3.5 py-2 text-[14px] transition-colors ${isActive ? 'bg-sand text-espresso' : 'text-mocha hover:text-espresso'}`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/search" className="rounded-full p-2.5 text-mocha hover:bg-sand lg:hidden" aria-label="Search">
            <Search size={19} />
          </Link>
          <Link to="/find" className="btn-primary hidden !px-4 !py-2 sm:inline-flex">
            <Sparkles size={15} aria-hidden /> Find My Place
          </Link>
          <Link
            to={user ? '/profile' : configured ? '/login' : '/profile'}
            className="hidden items-center gap-2 rounded-full border border-oat px-3.5 py-2 text-sm text-espresso hover:bg-ivory md:inline-flex"
          >
            <UserRound size={16} aria-hidden />
            {user ? 'Profile' : configured ? 'Log in' : 'Profile'}
          </Link>
        </div>
      </div>
      <nav aria-label="Sections" className="flex gap-1.5 overflow-x-auto border-t border-oat/50 px-4 py-2 [scrollbar-width:none] lg:hidden">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => `chip shrink-0 ${isActive ? 'chip-on' : ''}`}>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
