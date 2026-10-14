// Database suite: applies the real migrations to an in-process Postgres
// (PGlite) with minimal stand-ins for Supabase's `auth` and `storage`
// schemas, then checks Row Level Security as different users.
// Run with: npm run test:db
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const LEGACY_CAFE = '00000000-0000-4000-8000-000000000001';
const migration = (f: string) => readFileSync(`supabase/migrations/${f}`, 'utf8');

async function as<T = Record<string, unknown>>(uid: string | null, sql: string, role = 'authenticated'): Promise<T[]> {
  await db.exec(`set role ${uid ? role : 'anon'}; select set_config('request.uid', '${uid ?? ''}', false); select set_config('request.role', '${uid ? role : 'anon'}', false);`);
  try {
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec(`reset role; select set_config('request.role', '', false);`);
  }
}
async function rejects(uid: string | null, sql: string, why: string, expected: RegExp) {
  // Assert the SPECIFIC failure, so a typo in the SQL can't make a test pass.
  await assert.rejects(() => as(uid, sql), (e: Error) => expected.test(e.message), why);
}

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.role', true), '') $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
    grant usage on schema auth, storage to anon, authenticated;
    grant execute on function auth.uid(), auth.role() to anon, authenticated;
  `);
  await db.exec(migration('20261014000001_schema.sql'));
  await db.exec(migration('20261014000002_rls.sql'));
  // Legacy data written by the previous app version (cafe_id references), to prove 003 is non-destructive.
  await db.exec(`
    insert into auth.users values ('${A}', '{"display_name":"Asha"}'), ('${B}', '{}');
    insert into public.cafes (id, slug, name, neighbourhood, data_source) values ('${LEGACY_CAFE}', 'legacy-cafe', 'Legacy Café', 'park-street', 'manual');
    insert into public.saved_places (user_id, cafe_id) values ('${A}', '${LEGACY_CAFE}');
    insert into public.reviews (user_id, cafe_id, rating, body) values ('${A}', '${LEGACY_CAFE}', 4, 'A perfectly good legacy review text.');
  `);
  await db.exec(migration('20261015000003_real_places.sql'));
});

test('migrations apply cleanly and backfill existing rows (nothing dropped)', async () => {
  const [cafe] = (await db.query<{ place_key: string }>(`select place_key from public.cafes where id = '${LEGACY_CAFE}'`)).rows;
  assert.equal(cafe.place_key, `tp:${LEGACY_CAFE}`);
  const [saved] = (await db.query<{ place_key: string; cafe_id: string }>(`select place_key, cafe_id from public.saved_places`)).rows;
  assert.equal(saved.place_key, `tp:${LEGACY_CAFE}`);
  assert.equal(saved.cafe_id, LEGACY_CAFE, 'legacy reference kept');
  const [rating] = (await db.query<{ average_rating: string; review_count: number }>(`select * from public.cafe_rating_summary`)).rows;
  assert.equal(Number(rating.average_rating), 4);
  assert.equal(rating.review_count, 1);
});

test('re-running migration 003 is safe (idempotent)', async () => {
  await db.exec(migration('20261015000003_real_places.sql'));
  assert.equal((await db.query(`select * from public.saved_places`)).rows.length, 1);
});

test('users only see and change their own saved places; impersonation is rejected', async () => {
  await as(B, `insert into public.saved_places (place_key) values ('osm:node:2561110172')`); // user_id defaults to auth.uid()
  assert.equal((await as(A, `select * from public.saved_places`)).length, 1);
  assert.equal((await as(B, `select * from public.saved_places`)).length, 1);
  await rejects(B, `insert into public.saved_places (user_id, place_key) values ('${A}', 'osm:node:1')`, 'cannot write as another user', /row-level security/);
  const deleted = await as(B, `delete from public.saved_places where user_id = '${A}' returning id`);
  assert.equal(deleted.length, 0, 'cannot delete another user’s rows');
  assert.equal((await as(null, `select * from public.saved_places`).catch(() => [])).length, 0, 'anon sees nothing');
});

test('place keys are validated; demo keys never enter the database', async () => {
  await rejects(A, `insert into public.saved_places (place_key) values ('demo:margin-notes')`, 'demo key rejected', /saved_places_key_valid/);
  await rejects(A, `insert into public.saved_places (place_key) values ('osm:node:abc')`, 'malformed key rejected', /saved_places_key_valid/);
});

test('collections: owner-only items', async () => {
  const [col] = await as<{ id: string }>(A, `insert into public.collections (name) values ('Study Spots') returning id`);
  await as(A, `insert into public.collection_items (collection_id, place_key) values ('${col.id}', 'osm:node:1')`);
  await rejects(B, `insert into public.collection_items (collection_id, place_key) values ('${col.id}', 'osm:node:2')`, 'cannot add to another user’s collection', /row-level security/);
  assert.equal((await as(B, `select * from public.collection_items`)).length, 0);
});

test('reviews: published on insert, moderation status protected, photo path bound to the author', async () => {
  const [r] = await as<{ id: string; status: string }>(B, `insert into public.reviews (place_key, rating, body, status) values ('osm:node:2561110172', 5, 'Lovely place, quiet in the mornings.', 'hidden') returning id, status`);
  assert.equal(r.status, 'published', 'users cannot choose a moderation status');
  // A moderator (service role, bypasses RLS) hides it.
  await db.exec(`select set_config('request.role', 'service_role', false); update public.reviews set status = 'hidden' where id = '${r.id}'; select set_config('request.role', '', false);`);
  const status = async () => (await db.query<{ status: string }>(`select status from public.reviews where id = '${r.id}'`)).rows[0].status;
  assert.equal(await status(), 'hidden');
  await as(B, `update public.reviews set status = 'published', body = 'Edited text that is long enough.' where id = '${r.id}'`);
  assert.equal(await status(), 'hidden', 'author cannot re-publish a hidden review');
  assert.equal((await as(null, `select * from public.public_reviews where id = '${r.id}'`)).length, 0, 'hidden reviews are not public');
  await rejects(B, `insert into public.reviews (place_key, rating, body, photo_path) values ('osm:node:7', 4, 'Photo path belongs to someone else.', '${A}/x.jpg')`, 'foreign photo path rejected', /reviews_photo_owner/);
  await rejects(A, `insert into public.reviews (place_key, rating, body) values ('osm:node:8', 9, 'Rating out of range should fail.')`, 'rating checked', /reviews_rating_check/);
});

test('public review view exposes display names, never emails or private preferences', async () => {
  const rows = await as<Record<string, unknown>>(null, `select * from public.public_reviews`);
  assert.ok(rows.length >= 1);
  assert.ok(rows.some((x) => x.author_name === 'Asha'));
  for (const row of rows) for (const k of Object.keys(row)) assert.ok(!/email|budget|dietary|neighbourhood/.test(k), k);
  assert.equal((await as(B, `select * from public.user_profiles`)).length, 1, 'profiles are private to their owner');
});

test('reports: pending only, cannot be self-approved, summarised anonymously', async () => {
  await as(A, `insert into public.facility_reports (place_key, report_type, facility, reported_available, details) values ('osm:node:2561110172', 'facility', 'wifi', true, 'Asked staff, Wi-Fi works well.')`);
  await as(B, `insert into public.facility_reports (place_key, report_type, facility, reported_available, details) values ('osm:node:2561110172', 'facility', 'wifi', false, 'No Wi-Fi when I visited today.')`);
  await rejects(A, `insert into public.facility_reports (place_key, report_type, facility, details, status) values ('osm:node:1', 'facility', 'ac', 'Trying to self-approve this.', 'accepted')`, 'cannot insert accepted', /row-level security/);
  const updated = await as(A, `update public.facility_reports set status = 'accepted' returning id`).catch(() => []);
  assert.equal(updated.length, 0, 'no update policy: reporters cannot accept reports');
  assert.equal((await as(A, `select * from public.facility_reports`)).length, 1, 'users see only their own reports');
  const [sum] = await as<{ yes_count: number; no_count: number; user_id?: string }>(null, `select * from public.community_fact_summary where place_key = 'osm:node:2561110172'`);
  assert.deepEqual([sum.yes_count, sum.no_count], [1, 1]);
  assert.equal(sum.user_id, undefined, 'summary is anonymous');
});

test('review flags: users flag once; cannot read others’ flags', async () => {
  const [rev] = (await db.query<{ id: string }>(`select id from public.reviews limit 1`)).rows;
  await as(B, `insert into public.content_flags (review_id, reason) values ('${rev.id}', 'spam')`);
  await rejects(B, `insert into public.content_flags (review_id, reason) values ('${rev.id}', 'spam')`, 'duplicate flag rejected', /duplicate key|unique/);
  assert.equal((await as(A, `select * from public.content_flags`)).length, 0);
});

test('public café data is read-only for everyone except the service role', async () => {
  assert.ok((await as(null, `select id from public.cafes`)).length >= 1, 'anon can read cafés');
  await rejects(A, `update public.cafes set name = 'hacked'`, 'users cannot edit cafés', /permission denied/);
  await rejects(A, `insert into public.menu_items (cafe_id, name, category, source) values ('${LEGACY_CAFE}', 'x', 'coffee', 's')`, 'users cannot add menu items', /permission denied/);
});
