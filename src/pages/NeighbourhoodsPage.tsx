import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Search } from 'lucide-react';
import { NEIGHBOURHOODS, REGION_LABELS } from '@/lib/taxonomy';
import { DEFAULT_CITY } from '@/lib/cities';
import { config } from '@/lib/config';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

interface GeoResult {
  name: string;
  displayName: string;
  lat: number;
  lng: number;
  type: string;
}

export default function NeighbourhoodsPage() {
  useDocumentTitle('Neighbourhoods');
  const navigate = useNavigate();
  const regions = ['central', 'north', 'south', 'east'] as const;
  const [q, setQ] = useState('');
  const [results, setResults] = useState<GeoResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Area lookup via OpenStreetMap Nominatim (server-side, cached). Explicit submit only.
  const search = async (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (term.length < 3) return setError('Type at least 3 letters.');
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${config.apiBase}/geocode?city=${DEFAULT_CITY.id}&q=${encodeURIComponent(term)}`, { signal: AbortSignal.timeout(12_000) });
      const body = (await res.json().catch(() => null)) as { results?: GeoResult[]; error?: { message: string } } | null;
      if (!res.ok || !body?.results) throw new Error(body?.error?.message ?? 'Area search is unavailable right now.');
      setResults(body.results);
    } catch (err) {
      setResults(null);
      setError((err as Error).message || 'Area search is unavailable right now.');
    } finally {
      setBusy(false);
    }
  };

  const open = (r: GeoResult) => navigate(`/explore?near=${r.lat.toFixed(4)},${r.lng.toFixed(4)}&label=${encodeURIComponent(r.name)}`);

  return (
    <div className="page pt-10">
      <p className="eyebrow">{DEFAULT_CITY.name}</p>
      <h1 className="mt-2 text-4xl sm:text-5xl">Neighbourhoods</h1>
      <p className="mt-3 max-w-2xl text-mocha">Each part of the city has its own rhythm. Areas are approximate circles around real centre points, not official boundaries.</p>

      <form onSubmit={search} className="mt-8 flex max-w-xl flex-col gap-2 sm:flex-row" role="search">
        <label className="relative flex-1">
          <span className="sr-only">Find another area of {DEFAULT_CITY.name}</span>
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-latte" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value.slice(0, 60))} placeholder="Another area, e.g. Hazra, Kalighat, Beleghata" className="input !rounded-full !pl-10" />
        </label>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Searching…' : 'Find area'}
        </button>
      </form>
      <div aria-live="polite">
        {error && <p className="mt-3 text-sm text-clay">{error}</p>}
        {results && results.length === 0 && <p className="mt-3 text-sm text-mocha">No matching area inside {DEFAULT_CITY.name}. Try a different spelling.</p>}
        {results && results.length > 0 && (
          <ul className="mt-4 max-w-xl divide-y divide-oat rounded-2xl border border-oat bg-ivory">
            {results.map((r) => (
              <li key={`${r.lat},${r.lng}`}>
                <button onClick={() => open(r)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-cream">
                  <span>
                    <span className="block text-[15px] text-espresso">{r.name}</span>
                    <span className="line-clamp-1 text-xs text-latte">{r.displayName}</span>
                  </span>
                  <ArrowRight size={16} className="shrink-0 text-latte" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        {results && <p className="mt-2 text-[11px] text-latte">Area search © OpenStreetMap contributors (Nominatim).</p>}
      </div>

      {regions.map((r) => {
        const areas = NEIGHBOURHOODS.filter((n) => n.region === r);
        if (!areas.length) return null;
        return (
          <section key={r} className="mt-12">
            <h2 className="mb-4 text-2xl">{REGION_LABELS[r]}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {areas.map((n) => (
                <Link key={n.slug} to={`/explore?area=${n.slug}`} className="group card block p-5 transition-shadow hover:shadow-lift">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl">{n.name}</h3>
                    <ArrowRight size={16} className="text-latte transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </div>
                  <p className="mt-1 text-sm text-mocha">{n.blurb}</p>
                  <p className="mt-3 text-xs text-latte">Within about {n.radiusKm} km of the centre</p>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
