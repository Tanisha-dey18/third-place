import { useState } from 'react';
import { Coffee } from 'lucide-react';

interface Props {
  src: string | null | undefined;
  alt: string;
  className?: string;
  /** Rendered width hint, used to request a right-sized image from the CDN. */
  width?: number;
  eager?: boolean;
  label?: string;
}

/** Unsplash-style CDN URLs get a responsive srcset; everything else is used as-is. */
function withWidth(src: string, w: number) {
  if (!/images\.unsplash\.com/.test(src)) return src;
  const u = new URL(src);
  u.searchParams.set('w', String(w));
  u.searchParams.set('auto', 'format');
  return u.toString();
}

/**
 * Lazy-loaded image with a calm placeholder and graceful failure:
 * a broken or missing image becomes a branded tile, never a broken icon.
 */
export function SmartImage({ src, alt, className = '', width = 600, eager = false, label }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className={`flex items-center justify-center bg-sand text-latte ${className}`} role="img" aria-label={alt}>
        <div className="flex flex-col items-center gap-1.5">
          <Coffee size={22} aria-hidden />
          {label && <span className="px-3 text-center font-serif text-sm text-mocha">{label}</span>}
        </div>
      </div>
    );
  }
  return (
    <div className={`relative overflow-hidden bg-sand ${className}`}>
      {!loaded && <div className="shimmer absolute inset-0" aria-hidden />}
      <img
        src={withWidth(src, width)}
        srcSet={/images\.unsplash\.com/.test(src) ? `${withWidth(src, width)} 1x, ${withWidth(src, width * 2)} 2x` : undefined}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`h-full w-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}
