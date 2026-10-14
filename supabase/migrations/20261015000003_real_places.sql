-- ════════════════════════════════════════════════════════════════
-- THIRD PLACE · 003 · Real places, moderation & abuse controls
--
-- Non-destructive and safe to run on a database that already has data:
--   • adds `place_key` (e.g. 'osm:node:123', 'tp:<uuid>') next to the old
--     `cafe_id` references and backfills it; nothing is dropped
--   • cafes become THIRD PLACE's verified/curated layer, linked to
--     provider places by place_key
--   • adds the 'source_provided' verification status
--   • review moderation: users can't change moderation status, a daily
--     review limit, photo paths bound to the uploader, and review flags
--   • public summary of UNVERIFIED community facility reports
-- Run after 001 and 002. Wrapped in a transaction: all or nothing.
-- ════════════════════════════════════════════════════════════════
begin;

-- ── Vocabulary ───────────────────────────────────────────────────
create or replace function public.is_verification_status(v text)
returns boolean language sql immutable as $$
  select v in ('cafe_verified', 'visitor_confirmed', 'source_provided', 'community_reported', 'unverified', 'unknown')
$$;

-- Provider-qualified place keys stored in user data. Demo keys are never accepted.
create or replace function public.is_place_key(k text)
returns boolean language sql immutable as $$
  select k ~ '^osm:(node|way|relation):[0-9]{1,15}$'
      or k ~ '^tp:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;

-- ── cafes: curated / verified layer ──────────────────────────────
alter table public.cafes add column if not exists place_key text;
alter table public.cafes add column if not exists city text not null default 'kolkata';
alter table public.cafes add column if not exists menu_known boolean not null default false;
update public.cafes set place_key = 'tp:' || id::text where place_key is null;
update public.cafes set menu_known = true where not menu_known and exists (select 1 from public.menu_items m where m.cafe_id = cafes.id);
alter table public.cafes alter column place_key set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cafes_place_key_valid') then
    alter table public.cafes add constraint cafes_place_key_valid check (public.is_place_key(place_key));
  end if;
end $$;
create unique index if not exists cafes_place_key_uidx on public.cafes (place_key);
create index if not exists cafes_city_idx on public.cafes (city) where not is_demo;
-- Curated rows created to enrich a provider place may not have their own neighbourhood label.
alter table public.cafes alter column neighbourhood drop not null;

-- ── user data: reference places by key ───────────────────────────
alter table public.saved_places add column if not exists place_key text;
update public.saved_places s set place_key = c.place_key from public.cafes c where s.place_key is null and s.cafe_id = c.id;
alter table public.saved_places alter column cafe_id drop not null;
alter table public.saved_places alter column place_key set not null;
alter table public.saved_places alter column user_id set default auth.uid();
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'saved_places_key_valid') then
    alter table public.saved_places add constraint saved_places_key_valid check (public.is_place_key(place_key));
  end if;
end $$;
create unique index if not exists saved_places_user_key_uidx on public.saved_places (user_id, place_key);

alter table public.collection_items add column if not exists place_key text;
update public.collection_items i set place_key = c.place_key from public.cafes c where i.place_key is null and i.cafe_id = c.id;
alter table public.collection_items alter column cafe_id drop not null;
alter table public.collection_items alter column place_key set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'collection_items_key_valid') then
    alter table public.collection_items add constraint collection_items_key_valid check (public.is_place_key(place_key));
  end if;
end $$;
create unique index if not exists collection_items_key_uidx on public.collection_items (collection_id, place_key);
alter table public.collections alter column user_id set default auth.uid();

-- At most 50 collections and 200 places per collection per user (abuse guard).
create or replace function public.limit_collections()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'collections' then
    if (select count(*) from public.collections where user_id = new.user_id) >= 50 then
      raise exception 'Collection limit reached (50).';
    end if;
  else
    if (select count(*) from public.collection_items where collection_id = new.collection_id) >= 200 then
      raise exception 'A collection can hold up to 200 places.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists collections_limit on public.collections;
create trigger collections_limit before insert on public.collections for each row execute function public.limit_collections();
drop trigger if exists collection_items_limit on public.collection_items;
create trigger collection_items_limit before insert on public.collection_items for each row execute function public.limit_collections();

-- ── reviews ──────────────────────────────────────────────────────
alter table public.reviews add column if not exists place_key text;
update public.reviews r set place_key = c.place_key from public.cafes c where r.place_key is null and r.cafe_id = c.id;
alter table public.reviews alter column cafe_id drop not null;
alter table public.reviews alter column place_key set not null;
alter table public.reviews alter column user_id set default auth.uid();
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'reviews_key_valid') then
    alter table public.reviews add constraint reviews_key_valid check (public.is_place_key(place_key));
  end if;
  -- A review may only reference a photo inside its author's own storage folder.
  if not exists (select 1 from pg_constraint where conname = 'reviews_photo_owner') then
    alter table public.reviews add constraint reviews_photo_owner
      check (photo_path is null or split_part(photo_path, '/', 1) = user_id::text) not valid;
  end if;
end $$;
create unique index if not exists reviews_user_key_uidx on public.reviews (user_id, place_key);
create index if not exists reviews_place_idx on public.reviews (place_key, created_at desc);

-- Moderation status is owned by moderators (service role). Users can't publish
-- a hidden review, hide others', or change status by editing their own.
create or replace function public.protect_review_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'published';
    if (select count(*) from public.reviews where user_id = new.user_id and created_at > now() - interval '1 day') >= 10 then
      raise exception 'Daily review limit reached. Thank you for contributing!';
    end if;
  else
    new.status := old.status;
    new.user_id := old.user_id;
    new.place_key := old.place_key;
  end if;
  return new;
end $$;
drop trigger if exists reviews_protect_status on public.reviews;
create trigger reviews_protect_status before insert or update on public.reviews for each row execute function public.protect_review_status();

-- Updating an existing review: RLS allowed it only for published rows before;
-- authors may still edit text/rating of a hidden review but it stays hidden.
drop policy if exists "update own review" on public.reviews;
create policy "update own review" on public.reviews for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── review flags (abuse reports) ─────────────────────────────────
create table if not exists public.content_flags (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  review_id   uuid not null references public.reviews (id) on delete cascade,
  reason      text not null check (reason in ('spam', 'offensive', 'personal_info', 'not_a_real_visit', 'other')),
  status      text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, review_id)
);
alter table public.content_flags enable row level security;
drop policy if exists "flag reviews" on public.content_flags;
create policy "flag reviews" on public.content_flags for insert to authenticated with check (user_id = auth.uid() and status = 'open');
drop policy if exists "read own flags" on public.content_flags;
create policy "read own flags" on public.content_flags for select to authenticated using (user_id = auth.uid());
grant select, insert on public.content_flags to authenticated;
drop trigger if exists content_flags_updated_at on public.content_flags;
create trigger content_flags_updated_at before update on public.content_flags for each row execute function public.set_updated_at();

-- ── facility reports (suggested corrections) ─────────────────────
alter table public.facility_reports add column if not exists place_key text;
alter table public.facility_reports add column if not exists reported_available boolean;
update public.facility_reports f set place_key = c.place_key from public.cafes c where f.place_key is null and f.cafe_id = c.id;
alter table public.facility_reports alter column cafe_id drop not null;
alter table public.facility_reports alter column place_key set not null;
alter table public.facility_reports alter column user_id set default auth.uid();
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'facility_reports_key_valid') then
    alter table public.facility_reports add constraint facility_reports_key_valid check (public.is_place_key(place_key));
  end if;
end $$;
create index if not exists facility_reports_place_idx on public.facility_reports (place_key, status);
-- Insert policy already forces status = 'pending'; there is no update policy, so a
-- reporter can never accept their own report. Moderators use the service role.

-- ── Public read models (recreated for place_key) ─────────────────
drop view if exists public.cafe_rating_summary;
create view public.cafe_rating_summary
with (security_invoker = true) as
select place_key,
       round(avg(rating)::numeric, 2) as average_rating,
       count(*)::int                  as review_count
from public.reviews
where status = 'published'
group by place_key;

drop view if exists public.public_reviews;
-- Deliberately NOT security_invoker: exposes only published reviews and the
-- reviewer's chosen display name (never emails or private preferences).
create view public.public_reviews as
select r.id, r.place_key, r.user_id, p.display_name as author_name,
       r.rating, r.body, r.visited_on, r.photo_path, r.created_at
from public.reviews r
left join public.user_profiles p on p.id = r.user_id
where r.status = 'published';

-- Aggregated, anonymous counts of PENDING (unverified) facility reports from
-- the last year. Shown as "community-reported", never as confirmed facts.
create or replace view public.community_fact_summary as
select place_key,
       facility,
       count(*) filter (where reported_available is true)::int  as yes_count,
       count(*) filter (where reported_available is false)::int as no_count,
       max(created_at) as latest_at
from public.facility_reports
where status = 'pending'
  and report_type = 'facility'
  and facility is not null
  and reported_available is not null
  and created_at > now() - interval '365 days'
group by place_key, facility;

grant select on public.cafe_rating_summary, public.public_reviews, public.community_fact_summary to anon, authenticated;

commit;
