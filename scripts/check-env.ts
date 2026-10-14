// Build-time environment check (runs before `npm run build` on Netlify).
// Fails the build on unsafe configuration — a secret in a VITE_* variable,
// half-configured Supabase, or demo mode in a production deploy — and prints
// warnings for optional services that aren't configured.
// Netlify sets CONTEXT to "production", "deploy-preview" or "branch-deploy".
import { validateEnv } from '../src/lib/envCheck';

const context = process.env.CONTEXT ?? (process.env.NODE_ENV === 'production' ? 'production' : 'local');
const issues = validateEnv(process.env, { context });

for (const i of issues) {
  const line = `[check-env] ${i.level.toUpperCase()} ${i.variable}: ${i.message}`;
  if (i.level === 'error') console.error(line);
  else console.warn(line);
}

const errors = issues.filter((i) => i.level === 'error');
if (errors.length) {
  console.error(`[check-env] ${errors.length} configuration error(s) — refusing to build (context: ${context}).`);
  process.exit(1);
}
console.log(`[check-env] OK (context: ${context}, ${issues.length} warning(s)).`);
