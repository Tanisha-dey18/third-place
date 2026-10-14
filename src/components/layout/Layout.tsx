import { Suspense, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { MobileTabBar } from './MobileTabBar';
import { DemoBanner } from './DemoBanner';
import { GridSkeleton } from '../States';

export function Layout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[2000] focus:rounded focus:bg-ivory focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <DemoBanner />
      <Header />
      <main id="main" className="flex-1">
        <Suspense
          fallback={
            <div className="page py-10">
              <GridSkeleton />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>
      <Footer />
      <MobileTabBar />
    </div>
  );
}
