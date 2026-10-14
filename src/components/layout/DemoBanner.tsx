import { FlaskConical } from 'lucide-react';
import { config } from '@/lib/config';

/**
 * Persistent (non-dismissible) notice when the opt-in fictional demo data is
 * active, or when the configuration is unsafe. Never shown for live data.
 */
export function DemoBanner() {
  if (!config.demoMode && !config.serviceRoleLeak) return null;
  return (
    <div className="bg-espresso text-ivory" role="status">
      <div className="page flex items-center gap-3 py-2 text-[12.5px]">
        <FlaskConical size={14} className="shrink-0 text-sage" aria-hidden />
        {config.serviceRoleLeak ? (
          <p className="flex-1 font-semibold">Configuration error: a secret Supabase key was supplied to the browser and has been ignored. Rotate it.</p>
        ) : (
          <p className="flex-1">
            <strong className="font-semibold">Development demo mode.</strong> Every café shown is fictional sample data, not a real business. Turn off with VITE_DEMO_MODE.
          </p>
        )}
      </div>
    </div>
  );
}
