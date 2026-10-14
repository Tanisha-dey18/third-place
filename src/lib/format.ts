import type { Cafe } from '@/types';

export function formatPriceRange(c: Pick<Cafe, 'priceMin' | 'priceMax'>): string | null {
  if (c.priceMin == null) return null;
  if (c.priceMax == null || c.priceMax === c.priceMin) return `₹${c.priceMin.toLocaleString('en-IN')}`;
  return `₹${c.priceMin.toLocaleString('en-IN')}–${c.priceMax.toLocaleString('en-IN')}`;
}

export function formatInr(n: number | null): string {
  return n == null ? 'Price not confirmed' : `₹${n.toLocaleString('en-IN')}`;
}

export function plural(n: number, word: string, pluralWord = `${word}s`) {
  return `${n} ${n === 1 ? word : pluralWord}`;
}
