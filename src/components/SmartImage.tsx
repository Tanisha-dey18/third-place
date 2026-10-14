import { useId, useState } from 'react';
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
  const patternId = `tp-arches-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    // No photo: a branded tile with the initial, never a stock photo pretending to be the place.
    const initial = label?.trim().charAt(0).toUpperCase();
    return (
      <div className={`relative flex items-center justify-center overflow-hidden bg-sand text-latte ${className}`} role="img" aria-label={label ? `${label} (no photo yet)` : alt}>
        <svg className="absolute inset-0 h-full w-full opacity-[0.18]" aria-hidden>
          <defs>
            <pattern id={patternId} width="36" height="36" patternUnits="userSpaceOnUse">
              <path d="M8 34V20a10 10 0 0 1 20 0v14" fill="none" stroke="#8A7562" strokeWidth="1.4" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${patternId})`} />
        </svg>
        {initial ? (
          <span className="relative font-serif text-5xl text-mocha/80">{initial}</span>
        ) : (
          <Coffee size={22} className="relative" aria-hidden />
        )}
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
