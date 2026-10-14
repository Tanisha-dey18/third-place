import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { validateEnv, looksSecret } from '../src/lib/envCheck';
import { DEMO_CAFES } from '../src/data/demoCafes';
import { normalizeOsmElements } from '../src/lib/places/osm';

const errors = (env: Record<string, string>, context?: string) => validateEnv(env, { context }).filter((i) => i.level === 'error').map((i) => i.variable);

test('env: secrets in browser-exposed variables are errors', () => {
  const serviceJwt = `x.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.y`;
  const anonJwt = `x.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.y`;
  assert.ok(looksSecret(serviceJwt));
  assert.ok(!looksSecret(anonJwt));
  assert.ok(errors({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: serviceJwt }).includes('VITE_SUPABASE_ANON_KEY'));
  assert.ok(errors({ VITE_ANTHROPIC_KEY: 'sk-ant-api03-abc' }).includes('VITE_ANTHROPIC_KEY'));
  assert.ok(errors({ VITE_SECRET_THING: 'x' }).includes('VITE_SECRET_THING'));
  assert.deepEqual(errors({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: anonJwt }), []);
});

test('env: half-configured Supabase and non-https URLs are errors', () => {
  assert.ok(errors({ VITE_SUPABASE_URL: 'https://abc.supabase.co' }).includes('VITE_SUPABASE_ANON_KEY'));
  assert.ok(errors({ VITE_SUPABASE_URL: 'http://abc.supabase.co', VITE_SUPABASE_ANON_KEY: 'k' }).includes('VITE_SUPABASE_URL'));
});

test('env: demo mode can never be enabled in a production deploy', () => {
  assert.ok(errors({ VITE_DEMO_MODE: 'true' }, 'production').includes('VITE_DEMO_MODE'));
  assert.deepEqual(errors({ VITE_DEMO_MODE: 'true' }, 'deploy-preview'), []);
  assert.deepEqual(errors({}, 'production'), [], 'missing optional services are warnings, not errors');
  assert.ok(validateEnv({}, { context: 'production' }).some((i) => i.variable === 'VITE_MAP_TILE_URL' && i.level === 'warning'));
});

test('env: AI provider must be valid; keys are server-only names', () => {
  assert.ok(errors({ AI_PROVIDER: 'openai' }).includes('AI_PROVIDER'));
  assert.ok(validateEnv({ AI_PROVIDER: 'anthropic' }).some((i) => i.variable === 'ANTHROPIC_API_KEY'));
});

test('demo data is isolated: fictional, prefixed keys, never produced by the live normaliser', () => {
  assert.ok(DEMO_CAFES.length > 0);
  assert.ok(DEMO_CAFES.every((c) => c.isDemo && c.id.startsWith('demo:') && c.source.provider === 'demo'));
  const live = normalizeOsmElements(JSON.parse(readFileSync('tests/fixtures/overpass-kolkata-sample.json', 'utf8')).elements, { cityId: 'kolkata', fetchedAt: 'now' });
  assert.ok(live.places.every((p) => !p.isDemo && !p.id.startsWith('demo:')));
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test('production code paths never import demo data statically', () => {
  const offenders = [...walk('src'), ...walk('server'), ...walk('netlify')]
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes(join('data', 'demoCafes')))
    .filter((f) => /^\s*import\s[^;]*demoCafes/m.test(readFileSync(f, 'utf8')));
  assert.deepEqual(offenders, [], 'demo data may only be loaded via dynamic import() behind VITE_DEMO_MODE');
  const service = readFileSync('src/lib/places/service.ts', 'utf8');
  assert.match(service, /if \(config\.demoMode\) return demoQuery/);
  assert.ok(!/catch[^}]*demo/i.test(service), 'live failures never fall back to demo data');
});

test('no secrets are committed in source files', () => {
  const files = [...walk('src'), ...walk('server'), ...walk('netlify'), ...walk('supabase'), '.env.example', 'netlify.toml', 'README.md'].filter((f) => !f.includes('fixtures'));
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    assert.ok(!/sk-ant-api\d\d-[A-Za-z0-9_-]{20,}/.test(text), f);
    assert.ok(!/sb_secret_[A-Za-z0-9]{10,}/.test(text), f);
    assert.ok(!/eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(text), `${f} contains a JWT`);
  }
});
