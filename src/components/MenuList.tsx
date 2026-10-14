import { useMemo, useState } from 'react';
import { Award, Leaf, Sparkle } from 'lucide-react';
import type { Dietary, MenuCategory, MenuItem } from '@/types';
import { DIETARY_LABELS, MENU_CATEGORY_LABELS } from '@/lib/taxonomy';
import { formatInr } from '@/lib/format';
import { formatDate } from './VerificationBadge';

const ORDER: MenuCategory[] = ['coffee', 'tea', 'cold_beverages', 'bakery', 'desserts', 'breakfast', 'main_course', 'snacks'];

export function DietaryMark({ d }: { d: Dietary | null }) {
  if (!d) return <span className="text-[11px] text-latte">Dietary info not confirmed</span>;
  const veg = d === 'veg' || d === 'vegan';
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-mocha" title={DIETARY_LABELS[d]}>
      <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border ${veg ? 'border-sage-dark' : d === 'contains_egg' ? 'border-[#C79A2E]' : 'border-clay'}`} aria-hidden>
        <span className={`h-1.5 w-1.5 rounded-full ${veg ? 'bg-sage-dark' : d === 'contains_egg' ? 'bg-[#C79A2E]' : 'bg-clay'}`} />
      </span>
      {DIETARY_LABELS[d]}
    </span>
  );
}

export function MenuItemRow({ item, showCafe }: { item: MenuItem; showCafe?: React.ReactNode }) {
  return (
    <li className="flex gap-4 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h4 className="font-sans text-[15px] font-medium text-espresso">{item.name}</h4>
          {item.isSignature && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sage-light px-2 py-0.5 text-[10.5px] font-medium text-sage-dark" title="Described by the café as a house signature">
              <Sparkle size={11} aria-hidden /> Signature
            </span>
          )}
          {item.isBestseller && item.bestsellerSource && (
            <span className="inline-flex items-center gap-1 rounded-full bg-clay-light px-2 py-0.5 text-[10.5px] font-medium text-[#8A4F2E]" title={`Source: ${item.bestsellerSource}`}>
              <Award size={11} aria-hidden /> Bestseller
            </span>
          )}
        </div>
        {showCafe}
        {item.description && <p className="mt-0.5 text-sm text-mocha">{item.description}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <DietaryMark d={item.dietary} />
          {item.isBestseller && item.bestsellerSource && <span className="text-[11px] text-latte">Bestseller source: {item.bestsellerSource}</span>}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-[15px] ${item.priceInr == null ? 'text-xs text-latte' : 'font-medium text-espresso'}`}>{formatInr(item.priceInr)}</p>
      </div>
    </li>
  );
}

export function MenuList({ items }: { items: MenuItem[] }) {
  const cats = useMemo(() => ORDER.filter((c) => items.some((i) => i.category === c)), [items]);
  const [active, setActive] = useState<MenuCategory | 'all'>('all');
  const [vegOnly, setVegOnly] = useState(false);
  if (!items.length) return <p className="rounded-2xl border border-dashed border-oat p-5 text-sm text-mocha">No menu has been added for this place yet.</p>;
  const shown = items.filter((i) => (active === 'all' || i.category === active) && (!vegOnly || i.dietary === 'veg' || i.dietary === 'vegan'));
  const updated = items.map((i) => i.lastUpdated).filter(Boolean).sort().pop();
  const sources = Array.from(new Set(items.map((i) => i.source)));
  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto pb-2 [scrollbar-width:none]" role="tablist" aria-label="Menu categories">
        <button role="tab" aria-selected={active === 'all'} onClick={() => setActive('all')} className={`chip shrink-0 ${active === 'all' ? 'chip-on' : ''}`}>
          All
        </button>
        {cats.map((c) => (
          <button key={c} role="tab" aria-selected={active === c} onClick={() => setActive(c)} className={`chip shrink-0 ${active === c ? 'chip-on' : ''}`}>
            {MENU_CATEGORY_LABELS[c]}
          </button>
        ))}
        <button aria-pressed={vegOnly} onClick={() => setVegOnly((v) => !v)} className={`chip shrink-0 ${vegOnly ? 'chip-on' : ''}`}>
          <Leaf size={13} aria-hidden /> Veg only
        </button>
      </div>
      {shown.length === 0 ? (
        <p className="py-6 text-sm text-mocha">No confirmed vegetarian items in this category.</p>
      ) : (
        <ul className="divide-y divide-oat/60">
          {shown.map((i) => (
            <MenuItemRow key={i.id} item={i} />
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-latte">
        Source: {sources.join(', ')}
        {updated && ` · last updated ${formatDate(updated)}`}. Prices in INR per item; taxes may apply.
      </p>
    </div>
  );
}
