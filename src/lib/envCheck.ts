// Environment validation shared by the browser config, the build-time
// check (scripts/check-env.ts) and tests. Pure: pass the variables in.

export interface EnvIssue {
  level: 'error' | 'warning';
  variable: string;
  message: string;
}

export function decodeJwtRole(token: string): string | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('utf8');
    const payload = JSON.parse(json) as { role?: unknown };
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

/** Values that must never appear in a browser-exposed (VITE_*) variable. */
export function looksSecret(value: string): boolean {
  const v = value.trim();
  return (
    v.startsWith('sb_secret_') ||
    /^sk-ant-/.test(v) ||
    /^sk-[A-Za-z0-9_-]{20,}$/.test(v) ||
    /^gsk_[A-Za-z0-9]{20,}$/.test(v) ||
    decodeJwtRole(v) === 'service_role'
  );
}

export function validateEnv(env: Record<string, string | undefined>, opts: { context?: string } = {}): EnvIssue[] {
  const issues: EnvIssue[] = [];
  const get = (k: string) => (env[k] ?? '').trim();
  const production = opts.context === 'production';

  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('VITE_') || !value) continue;
    if (looksSecret(value)) issues.push({ level: 'error', variable: name, message: 'Looks like a secret key. VITE_* variables are public. Move it to a server-only variable and rotate it.' });
    if (/SECRET|SERVICE_ROLE|PRIVATE/i.test(name)) issues.push({ level: 'error', variable: name, message: 'Secret-sounding names must not use the VITE_ prefix (they would ship to browsers).' });
  }

  const url = get('VITE_SUPABASE_URL');
  const anon = get('VITE_SUPABASE_ANON_KEY');
  if (!!url !== !!anon) issues.push({ level: 'error', variable: url ? 'VITE_SUPABASE_ANON_KEY' : 'VITE_SUPABASE_URL', message: 'Set both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, or neither.' });
  if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/i.test(url) && !/^https:\/\//.test(url)) {
    issues.push({ level: 'error', variable: 'VITE_SUPABASE_URL', message: 'Must be an https:// URL (e.g. https://xxxx.supabase.co).' });
  }
  if (!url && production) issues.push({ level: 'warning', variable: 'VITE_SUPABASE_URL', message: 'Accounts, saved places sync, reviews and reports are disabled without Supabase.' });

  if (get('VITE_DEMO_MODE') === 'true' && production) {
    issues.push({ level: 'error', variable: 'VITE_DEMO_MODE', message: 'Demo mode (fictional cafés) must not be enabled in a production deploy.' });
  }
  if (env.VITE_CAFE_DATA_SOURCE) issues.push({ level: 'warning', variable: 'VITE_CAFE_DATA_SOURCE', message: 'No longer used. Live OpenStreetMap data is the default; use VITE_DEMO_MODE=true for local demos.' });
  if (env.SUPABASE_SERVICE_ROLE_KEY) issues.push({ level: 'warning', variable: 'SUPABASE_SERVICE_ROLE_KEY', message: 'This app never needs the service-role key. Remove it from the site’s environment.' });

  if (production && !get('VITE_MAP_TILE_URL')) {
    issues.push({ level: 'warning', variable: 'VITE_MAP_TILE_URL', message: 'Using OpenStreetMap community tiles, which are not for heavy production traffic. Configure a tile provider.' });
  }
  if (production && !get('OVERPASS_CONTACT')) {
    issues.push({ level: 'warning', variable: 'OVERPASS_CONTACT', message: 'Set a contact (email or URL) so OpenStreetMap service operators can reach you.' });
  }
  const provider = get('AI_PROVIDER');
  if (get('VITE_AI_SEARCH_ENABLED') === 'true' && !provider) {
    issues.push({ level: 'warning', variable: 'AI_PROVIDER', message: 'AI search is enabled in the browser but no provider is configured; the rule-based parser will be used.' });
  }
  if (provider) {
    const keyVar = { anthropic: 'ANTHROPIC_API_KEY', gemini: 'GEMINI_API_KEY', groq: 'GROQ_API_KEY' }[provider];
    if (!keyVar) issues.push({ level: 'error', variable: 'AI_PROVIDER', message: 'Must be anthropic, gemini or groq.' });
    else if (!get(keyVar)) issues.push({ level: 'warning', variable: keyVar, message: `AI_PROVIDER=${provider} but ${keyVar} is not set.` });
  }
  return issues;
}
