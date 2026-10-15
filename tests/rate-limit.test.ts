import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSharedRateLimiter, sweepRateLimits } from '../server/rateLimit';
import type { BlobLike } from '../server/cache';

/** In-memory stand-in for a Netlify Blobs store (get/setJSON/list/delete). */
function fakeStore() {
  const data = new Map<string, unknown>();
  const store: BlobLike & { list(o: { prefix: string }): Promise<{ blobs: { key: string }[] }>; delete(k: string): Promise<void> } = {
    async get(key) {
      return data.has(key) ? structuredClone(data.get(key)) : null;
    },
    async setJSON(key, value) {
      data.set(key, structuredClone(value));
    },
    async list({ prefix }) {
      return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    },
    async delete(key) {
      data.delete(key);
    },
  };
  return { store, data };
}

test('limits are shared across function instances (two limiters, one store)', async () => {
  const { store } = fakeStore();
  const t = 1_800_000_000_000;
  const instanceA = createSharedRateLimiter({ route: 'ai', perClient: 3, windowMs: 60_000 }, async () => store, () => t);
  const instanceB = createSharedRateLimiter({ route: 'ai', perClient: 3, windowMs: 60_000 }, async () => store, () => t);
  const results = [await instanceA.check('1.2.3.4'), await instanceB.check('1.2.3.4'), await instanceA.check('1.2.3.4'), await instanceB.check('1.2.3.4')];
  assert.deepEqual(results.map((r) => r.allowed), [true, true, true, false], 'the 4th request is refused even though it hit another instance');
  assert.equal(results[3].reason, 'client');
  assert.ok(results[3].retryAfter > 0 && results[3].retryAfter <= 60);
  assert.ok(results.every((r) => r.shared));
  assert.equal((await instanceB.check('5.6.7.8')).allowed, true, 'other clients are unaffected');
});

test('a new window resets the client counter', async () => {
  const { store } = fakeStore();
  let t = 1_800_000_000_000;
  const rl = createSharedRateLimiter({ route: 'geo', perClient: 1, windowMs: 60_000 }, async () => store, () => t);
  assert.equal((await rl.check('ip')).allowed, true);
  assert.equal((await rl.check('ip')).allowed, false);
  t += 60_000;
  assert.equal((await rl.check('ip')).allowed, true);
});

test('raw IP addresses are never stored (keys use a hash)', async () => {
  const { store, data } = fakeStore();
  const rl = createSharedRateLimiter({ route: 'ai', perClient: 5, windowMs: 60_000 }, async () => store);
  await rl.check('203.0.113.42');
  const keys = [...data.keys()];
  assert.equal(keys.length, 1);
  assert.ok(!keys[0].includes('203.0.113.42'));
  assert.match(keys[0], /^rl\/ai\/w\/\d+\/[0-9a-f]{24}$/);
});

test('global daily cap bounds total usage (e.g. paid AI calls) across all clients', async () => {
  const { store } = fakeStore();
  const t = Date.parse('2026-10-15T10:00:00Z');
  const rl = createSharedRateLimiter({ route: 'ai', perClient: 100, windowMs: 60_000, globalPerDay: 2 }, async () => store, () => t);
  assert.equal((await rl.check('a')).allowed, true);
  assert.equal((await rl.check('b')).allowed, true);
  const third = await rl.check('c');
  assert.equal(third.allowed, false);
  assert.equal(third.reason, 'global');
  assert.equal(third.retryAfter, 14 * 3600, 'retry at the next UTC day');
});

test('falls back to a per-instance limiter when Blobs are unavailable or failing', async () => {
  const none = createSharedRateLimiter({ route: 'ai', perClient: 1, windowMs: 60_000 }, async () => null);
  assert.deepEqual([(await none.check('x')).allowed, (await none.check('x')).allowed], [true, false]);
  assert.equal((await none.check('x')).shared, false);
  const broken: BlobLike = { get: async () => { throw new Error('blob down'); }, setJSON: async () => undefined };
  const flaky = createSharedRateLimiter({ route: 'ai', perClient: 1, windowMs: 60_000 }, async () => broken);
  assert.deepEqual([(await flaky.check('y')).allowed, (await flaky.check('y')).allowed], [true, false], 'never fails open completely');
});

test('sweep removes expired windows and old day counters only', async () => {
  const { store, data } = fakeStore();
  const now = Date.parse('2026-10-15T10:00:00Z');
  data.set(`rl/ai/w/${now - 3_600_000}/abc`, { n: 1 });
  data.set(`rl/ai/w/${now - 30_000}/def`, { n: 1 });
  data.set('rl/ai/day/2026-10-10', { n: 9 });
  data.set('rl/ai/day/2026-10-15', { n: 9 });
  data.set('snapshot/v1/kolkata', { value: 1 });
  const removed = await sweepRateLimits(store, now);
  assert.equal(removed, 2);
  assert.deepEqual([...data.keys()].sort(), ['rl/ai/day/2026-10-15', `rl/ai/w/${now - 30_000}/def`, 'snapshot/v1/kolkata'].sort());
});

test('AI endpoint returns 429 from the shared limiter when configured', async () => {
  process.env.AI_PROVIDER = 'groq';
  process.env.GROQ_API_KEY = 'test-fake-key-value-123';
  const { default: ai } = await import('../netlify/functions/ai-search');
  try {
    let last = 0;
    // No Blobs locally → per-instance fallback with the same 20/min rule.
    for (let i = 0; i < 21; i++) {
      const res = await ai(new Request('http://localhost/api/ai-search', { method: 'POST', headers: { 'x-nf-client-connection-ip': '198.51.100.7' }, body: JSON.stringify({ action: 'parse', query: 'x'.repeat(400) }) }));
      last = res.status;
    }
    assert.equal(last, 429);
  } finally {
    delete process.env.AI_PROVIDER;
    delete process.env.GROQ_API_KEY;
  }
});
