import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useData } from '@/context/DataContext';
import { NEIGHBOURHOODS, REGION_LABELS } from '@/lib/taxonomy';
import { SmartImage } from '@/components/SmartImage';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function NeighbourhoodsPage() {
  useDocumentTitle('Neighbourhoods');
  const { cafes } = useData();
  const byArea = useMemo(() => {
    const m = new Map<string, typeof cafes>();
    for (const c of cafes) m.set(c.neighbourhood, [...(m.get(c.neighbourhood) ?? []), c]);
    return m;
  }, [cafes]);
  const regions = ['central', 'north', 'south', 'east'] as const;

  return (
    <div className="page pt-10">
      <p className="eyebrow">Kolkata</p>
      <h1 className="mt-2 text-4xl sm:text-5xl">Neighbourhoods</h1>
      <p className="mt-3 max-w-2xl text-mocha">Each part of the city has its own rhythm. We list only neighbourhoods we can support with actual records.</p>
      {regions.map((r) => {
        const areas = NEIGHBOURHOODS.filter((n) => n.region === r);
        if (!areas.length) return null;
        return (
          <section key={r} className="mt-12">
            <h2 className="mb-4 text-2xl">{REGION_LABELS[r]}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {areas.map((n) => {
                const list = byArea.get(n.slug) ?? [];
                return (
                  <Link key={n.slug} to={`/explore?area=${n.slug}`} className="group card overflow-hidden transition-shadow hover:shadow-lift">
                    <SmartImage src={list[0]?.photos[0]?.url} alt="" label={n.name} className="aspect-[16/8]" width={600} />
                    <div className="p-5">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xl">{n.name}</h3>
                        <ArrowRight size={16} className="text-latte transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </div>
                      <p className="mt-1 text-sm text-mocha">{n.blurb}</p>
                      <p className="mt-3 text-xs font-medium text-sage-dark">
                        {list.length ? `${list.length} place${list.length === 1 ? '' : 's'}: ${list.slice(0, 3).map((c) => c.name).join(', ')}${list.length > 3 ? '…' : ''}` : 'No places listed yet'}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
