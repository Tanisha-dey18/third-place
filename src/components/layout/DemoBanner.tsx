import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FlaskConical, X } from 'lucide-react';
import { config, isDemoData } from '@/lib/config';

const KEY = 'tp-demo-banner';

export function DemoBanner() {
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });
  const leak = config.serviceRoleLeak;
  if (!isDemoData && !leak) return null;
  if (hidden && !leak) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      sessionStorage.setItem(KEY, '1');
    } catch {
      /* storage unavailable */
    }
  };

  return (
    <div className="bg-espresso text-ivory">
      <div className="page flex items-center gap-3 py-2 text-[12.5px]">
        <FlaskConical size={14} className="shrink-0 text-sage" aria-hidden />
        {leak ? (
          <p className="flex-1 font-semibold">Configuration error: a secret Supabase key was supplied to the browser and has been ignored.</p>
        ) : (
          <p className="flex-1">
            <strong className="font-semibold">Demo mode.</strong> Cafés shown are fictional samples, and their names, menus, prices and facilities are illustrative.
            {!config.supabaseConfigured && ' Accounts are off, so saved places stay on this device.'}{' '}
            <Link to="/about#demo" className="underline underline-offset-2">
              Learn more
            </Link>
          </p>
        )}
        {!leak && (
          <button onClick={dismiss} className="rounded p-1 hover:bg-mocha" aria-label="Dismiss demo notice">
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
