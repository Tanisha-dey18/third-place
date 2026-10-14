import { Link } from 'react-router-dom';

/** THIRD PLACE wordmark: an open archway — a doorway to "your place". */
export function LogoMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={className}>
      <rect width="64" height="64" rx="16" fill="#2A1C13" />
      <path d="M20 50V30a12 12 0 0 1 24 0v20" fill="none" stroke="#F5EFE5" strokeWidth="5" strokeLinecap="round" />
      <circle cx="32" cy="38" r="4" fill="#9AA886" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="THIRD PLACE home">
      <LogoMark />
      {!compact && (
        <span className="font-serif text-[19px] font-semibold tracking-[0.08em] text-espresso">
          THIRD<span className="text-sage-dark"> </span>PLACE
        </span>
      )}
    </Link>
  );
}
