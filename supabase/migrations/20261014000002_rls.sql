-- ════════════════════════════════════════════════════════════════
-- THIRD PLACE · 002 · Row Level Security, grants and storage
-- ════════════════════════════════════════════════════════════════

-- Enable RLS everywhere. Without a matching policy, access is denied.
alter table public.cafes             enable row level security;
alter table public.cafe_facilities   enable row level security;
alter table public.cafe_photos       enable row level security;
alter table public.menu_items        enable row level security;
alter table public.user_profiles     enable row level security;
alter table public.saved_places      enable row level security;
alter table public.collections       enable row level security;
alter table public.collection_items  enable row level security;
alter table public.reviews           enable row level security;
alter table public.facility_reports  enable row level security;

-- ── Public café data: read-only for everyone ────────────────────
-- Writes happen only with the service-role key (server/admin), which bypasses RLS.
drop policy if exists "cafes are public" on public.cafes;
create policy "cafes are public" on public.cafes for select to anon, authenticated using (true);

drop policy if exists "facilities are public" on public.cafe_facilities;
create policy "facilities are public" on public.cafe_facilities for select to anon, authenticated using (true);

drop policy if exists "photos are public" on public.cafe_photos;
create policy "photos are public" on public.cafe_photos for select to anon, authenticated using (true);

drop policy if exists "menus are public" on public.menu_items;
create policy "menus are public" on public.menu_items for select to anon, authenticated using (true);

-- ── Profiles: owner only ────────────────────────────────────────
drop policy if exists "read own profile" on public.user_profiles;
create policy "read own profile" on public.user_profiles for select to authenticated using (id = auth.uid());
drop policy if exists "insert own profile" on public.user_profiles;
create policy "insert own profile" on public.user_profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "update own profile" on public.user_profiles;
create policy "update own profile" on public.user_profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ── Saved places: owner only ────────────────────────────────────
drop policy if exists "own saved places" on public.saved_places;
create policy "own saved places" on public.saved_places for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── Collections: owner only ─────────────────────────────────────
drop policy if exists "own collections" on public.collections;
create policy "own collections" on public.collections for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own collection items" on public.collection_items;
create policy "own collection items" on public.collection_items for all to authenticated
  using (exists (select 1 from public.collections c where c.id = collection_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.collections c where c.id = collection_id and c.user_id = auth.uid()));

-- ── Reviews: public read (published), owner write ───────────────
drop policy if exists "published reviews are public" on public.reviews;
create policy "published reviews are public" on public.reviews for select to anon, authenticated
  using (status = 'published' or user_id = auth.uid());
drop policy if exists "write own review" on public.reviews;
create policy "write own review" on public.reviews for insert to authenticated with check (user_id = auth.uid() and status = 'published');
drop policy if exists "update own review" on public.reviews;
create policy "update own review" on public.reviews for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and status = 'published');
drop policy if exists "delete own review" on public.reviews;
create policy "delete own review" on public.reviews for delete to authenticated using (user_id = auth.uid());

-- ── Facility reports: users submit and see their own; moderators use service role
drop policy if exists "submit own report" on public.facility_reports;
create policy "submit own report" on public.facility_reports for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');
drop policy if exists "read own reports" on public.facility_reports;
create policy "read own reports" on public.facility_reports for select to authenticated using (user_id = auth.uid());

-- ── Grants (RLS still applies on top of these) ──────────────────
grant usage on schema public to anon, authenticated;
grant select on public.cafes, public.cafe_facilities, public.cafe_photos, public.menu_items to anon, authenticated;
grant select on public.cafe_rating_summary, public.public_reviews to anon, authenticated;
grant select, insert, update on public.user_profiles to authenticated;
grant select, insert, update, delete on public.saved_places, public.collections, public.collection_items to authenticated;
grant select on public.reviews to anon;
grant select, insert, update, delete on public.reviews to authenticated;
grant select, insert on public.facility_reports to authenticated;
revoke insert, update, delete on public.cafes, public.cafe_facilities, public.cafe_photos, public.menu_items from anon, authenticated;

-- ════════════════════════════════════════════════════════════════
-- Storage: visitor review photos (optional)
-- Public-read bucket; users may only write inside their own folder
-- (<user_id>/<file>). Size/type limits are enforced by the bucket.
-- ════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('review-photos', 'review-photos', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "review photos are public" on storage.objects;
create policy "review photos are public" on storage.objects for select to anon, authenticated
  using (bucket_id = 'review-photos');

drop policy if exists "upload own review photos" on storage.objects;
create policy "upload own review photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'review-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "delete own review photos" on storage.objects;
create policy "delete own review photos" on storage.objects for delete to authenticated
  using (bucket_id = 'review-photos' and (storage.foldername(name))[1] = auth.uid()::text);
