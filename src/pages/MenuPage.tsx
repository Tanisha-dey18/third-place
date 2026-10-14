import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import type { MenuCategory } from '@/types';
import type { Cafe } from '@/types';
import { config } from '@/lib/config';
import { fetchCuratedMenus } from '@/lib/repository/curated';
import { MENU_CATEGORY_LABELS, neighbourhoodName } from '@/lib/taxonomy';
import { MenuItemRow } from '@/components/MenuList';
import { EmptyState, ErrorState, GridSkeleton } from '@/components/States';
import { useDebounced } from '@/hooks/useDebounced';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

type Mode = 'all' | 'signature' | 'bestseller';
const PAGE = 30;

export default function MenuPage() {
  useDocumentTitle('Menu explorer');
  // Menus come only from THIRD PLACE's verified records (or the opt-in demo).
  const [cafes, setCafes] = useState<Cafe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const load = import.meta.env.VITE_DEMO_MODE === 'true'
      ? import('@/data/demoCafes').then((m) => m.DEMO_CAFES)
      : config.supabaseConfigured
        ? fetchCuratedMenus(80)
        : Promise.resolve([] as Cafe[]);
    load
      .then((list) => active && setCafes(list))
      .catch((e: Error) => active && setError(e.message || 'Could not load menus.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [attempt]);
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim().toLowerCase(), 200);
  const [cat, setCat] = useState<MenuCategory | 'all'>('all');
  const [mode, setMode] = useState<Mode>('all');
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [vegOnly, setVegOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const items = useMemo(() => {
    const all = cafes.flatMap((c) => (c.menu ?? []).map((m) => ({ item: m, cafe: c })));
    return all
      .filter(({ item, cafe }) => {
        if (cat !== 'all' && item.category !== cat) return false;
        if (mode === 'signature' && !item.isSignature) return false;
        if (mode === 'bestseller' && !(item.isBestseller && item.bestsellerSource)) return false;
        if (vegOnly && item.dietary !== 'veg' && item.dietary !== 'vegan') return false;
        if (maxPrice != null && (item.priceInr == null || item.priceInr > maxPrice)) return false;
        if (query && !`${item.name} ${item.description ?? ''} ${cafe.name}`.toLowerCase().includes(query)) return false;
        return true;
      })
      .sort((a, b) => Number(b.item.isSignature) - Number(a.item.isSignature) || (a.item.priceInr ?? 1e9) - (b.item.priceInr ?? 1e9));
  }, [cafes, cat, mode, vegOnly, maxPrice, query]);

  return (
    <div className="page pt-10">
      <p className="eyebrow">Menu explorer</p>
      <h1 className="mt-2 text-4xl sm:text-5xl">Signature drinks, popular plates</h1>
      <p className="mt-3 max-w-2xl text-mocha">
        Browse menus that cafés have provided or our team has verified. “Bestseller” appears only when the café provided it or reliable popularity records exist, and we show the source.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Search dishes and drinks</span>
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-latte" aria-hidden />
          <input value={q} onChange={(e) => { setQ(e.target.value.slice(0, 60)); setLimit(PAGE); }} type="search" placeholder="Cold brew, cheesecake, chai…" className="input !rounded-full !py-2.5 !pl-10" />
        </label>
        <select value={maxPrice ?? ''} onChange={(e) => setMaxPrice(e.target.value ? Number(e.target.value) : null)} className="chip !py-2.5" aria-label="Maximum price">
          <option value="">Any price</option>
          {[100, 200, 300, 500].map((p) => (
            <option key={p} value={p}>
              Up to ₹{p}
            </option>
          ))}
        </select>
        <button aria-pressed={vegOnly} onClick={() => setVegOnly((v) => !v)} className={`chip !py-2.5 ${vegOnly ? 'chip-on' : ''}`}>
          Veg only
        </button>
      </div>
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        {(['all', 'signature', 'bestseller'] as Mode[]).map((m) => (
          <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)} className={`chip shrink-0 ${mode === m ? 'chip-on' : ''}`}>
            {m === 'all' ? 'All items' : m === 'signature' ? 'House signatures' : 'Bestsellers (sourced)'}
          </button>
        ))}
        <span className="mx-1 w-px shrink-0 bg-oat" aria-hidden />
        <button aria-pressed={cat === 'all'} onClick={() => setCat('all')} className={`chip shrink-0 ${cat === 'all' ? 'chip-on' : ''}`}>
          Every category
        </button>
        {(Object.keys(MENU_CATEGORY_LABELS) as MenuCategory[]).map((c) => (
          <button key={c} aria-pressed={cat === c} onClick={() => setCat(c)} className={`chip shrink-0 ${cat === c ? 'chip-on' : ''}`}>
            {MENU_CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {error ? (
          <ErrorState message={error} onRetry={retry} />
        ) : loading ? (
          <GridSkeleton count={3} />
        ) : items.length === 0 ? (
          cafes.length === 0 ? (
          <EmptyState title="No verified menus yet">
            Menus and prices appear here only when a café provides them or our team verifies them. Public map data doesn’t include menus, and we don’t guess.{' '}
            <Link to="/explore" className="underline">
              Explore places
            </Link>{' '}
            instead, or report a menu from any café page.
          </EmptyState>
        ) : (
          <EmptyState title="No menu items match">Try another category or remove the price limit.</EmptyState>
        )
        ) : (
          <>
            <p className="mb-2 text-sm text-mocha">{items.length} item{items.length === 1 ? '' : 's'}</p>
            <ul className="card divide-y divide-oat/60 px-5">
              {items.slice(0, limit).map(({ item, cafe }) => (
                <MenuItemRow
                  key={item.id}
                  item={item}
                  showCafe={
                    <p className="text-xs text-latte">
                      at{' '}
                      <Link to={`/cafe/${cafe.slug}#menu`} className="text-mocha underline decoration-oat underline-offset-2">
                        {cafe.name}
                      </Link>
                      , {neighbourhoodName(cafe.neighbourhood)}
                      {cafe.isDemo && ' · demo'}
                    </p>
                  }
                />
              ))}
            </ul>
            {items.length > limit && (
              <div className="mt-6 text-center">
                <button onClick={() => setLimit((l) => l + PAGE)} className="btn-ghost">
                  Load more
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
