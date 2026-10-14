import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Search, Wallet, Sparkles } from 'lucide-react';
import { BUDGET_OPTIONS, NEIGHBOURHOODS } from '@/lib/taxonomy';
import type { BudgetBand } from '@/types';

const EXAMPLES = [
  'Quiet café in South Kolkata to study for 3 hours, with charging, under ₹400',
  'Cosy date café near Park Street',
  'Affordable cafés with good desserts in Salt Lake',
  'Laptop-friendly places with Wi-Fi and comfortable seating',
];

export function HeroSearch({ defaultBudget, defaultArea }: { defaultBudget?: BudgetBand | null; defaultArea?: string | null }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [area, setArea] = useState(defaultArea ?? 'anywhere');
  const [budget, setBudget] = useState<string>(defaultBudget ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = (e?: FormEvent, text = q) => {
    e?.preventDefault();
    if (text.trim().length > 300) {
      setError('Please keep it under 300 characters.');
      return;
    }
    const p = new URLSearchParams();
    if (text.trim()) p.set('q', text.trim());
    if (area !== 'anywhere') p.set('area', area);
    if (budget) p.set('budget', budget);
    if (!text.trim()) {
      // No text: go straight to the guided Find My Place flow with the selections.
      navigate(`/find?${p.toString()}`);
      return;
    }
    navigate(`/search?${p.toString()}`);
  };

  return (
    <form onSubmit={submit} className="rounded-3xl bg-ivory p-2.5 shadow-lift sm:p-3" role="search" aria-label="Find a place">
      <label htmlFor="hero-q" className="sr-only">
        Describe what you’re looking for
      </label>
      <div className="flex items-start gap-3 rounded-2xl px-3 py-2.5">
        <Search size={20} className="mt-1 shrink-0 text-latte" aria-hidden />
        <textarea
          id="hero-q"
          rows={2}
          maxLength={300}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="A quiet corner to study near Ballygunge, under ₹300…"
          className="w-full resize-none bg-transparent text-[16px] leading-relaxed text-espresso placeholder:text-latte/80 focus:outline-none"
        />
      </div>
      <div className="mt-1 flex flex-col gap-2 border-t border-oat/60 pt-2.5 sm:flex-row sm:items-center">
        <div className="flex flex-1 gap-2">
          <label className="flex flex-1 items-center gap-2 rounded-xl bg-cream px-3 py-2 text-sm">
            <MapPin size={15} className="text-latte" aria-hidden />
            <span className="sr-only">Location</span>
            <select value={area} onChange={(e) => setArea(e.target.value)} className="w-full bg-transparent text-espresso focus:outline-none">
              <option value="anywhere">All Kolkata</option>
              {NEIGHBOURHOODS.map((n) => (
                <option key={n.slug} value={n.slug}>
                  {n.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 items-center gap-2 rounded-xl bg-cream px-3 py-2 text-sm">
            <Wallet size={15} className="text-latte" aria-hidden />
            <span className="sr-only">Budget per person</span>
            <select value={budget} onChange={(e) => setBudget(e.target.value)} className="w-full bg-transparent text-espresso focus:outline-none">
              <option value="">Any budget</option>
              {BUDGET_OPTIONS.filter((b) => b.band !== 'flexible').map((b) => (
                <option key={b.band} value={b.band}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="submit" className="btn-primary !py-3 sm:!px-6">
          <Sparkles size={16} aria-hidden /> Find My Place
        </button>
      </div>
      {error && <p className="px-3 pt-2 text-sm text-clay">{error}</p>}
      <div className="flex gap-2 overflow-x-auto px-1 pb-1 pt-3 [scrollbar-width:none]">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => {
              setQ(ex);
              submit(undefined, ex);
            }}
            className="shrink-0 rounded-full border border-oat px-3 py-1.5 text-[12.5px] text-mocha hover:bg-cream"
          >
            {ex}
          </button>
        ))}
      </div>
    </form>
  );
}
