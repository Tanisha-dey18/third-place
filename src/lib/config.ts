// Browser-safe runtime configuration. Only VITE_* variables are read here,
// and every one of them is safe to ship in the public bundle.

const env = import.meta.env;

const supabaseUrl = (env.VITE_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (env.VITE_SUPABASE_ANON_KEY ?? '').trim();

/** Guard against accidentally pasting a service-role key into the frontend. */
function looksLikeServiceRole(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  try {
    const payload = JSON.parse(atob(key.split('.')[1] ?? ''));
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
}

const serviceRoleLeak = supabaseAnonKey !== '' && looksLikeServiceRole(supabaseAnonKey);
if (serviceRoleLeak) {
  // Refuse to use it. A service-role key in the browser bypasses Row Level Security.
  console.error('[THIRD PLACE] VITE_SUPABASE_ANON_KEY looks like a service-role/secret key. It has been ignored. Use the anon/publishable key.');
}

export const config = {
  supabaseUrl,
  supabaseAnonKey: serviceRoleLeak ? '' : supabaseAnonKey,
  supabaseConfigured: /^https:\/\/.+/.test(supabaseUrl) && supabaseAnonKey !== '' && !serviceRoleLeak,
  serviceRoleLeak,
  cafeDataSource: (env.VITE_CAFE_DATA_SOURCE === 'supabase' ? 'supabase' : 'demo') as 'demo' | 'supabase',
  map: {
    /** True when using the default community OSM tiles (fine for demos/low traffic only). */
    usingDefaultTiles: !env.VITE_MAP_TILE_URL,
    enabled: env.VITE_MAP_ENABLED !== 'false',
    tileUrl: env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      env.VITE_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  aiSearchEnabled: env.VITE_AI_SEARCH_ENABLED === 'true',
};

/** True when café records come from the bundled fictional dataset. */
export const isDemoData = config.cafeDataSource === 'demo' || !config.supabaseConfigured;
