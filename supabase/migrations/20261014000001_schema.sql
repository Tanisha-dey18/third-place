-- ════════════════════════════════════════════════════════════════
-- THIRD PLACE · 001 · Core schema
-- Run in order in the Supabase SQL editor, or with `supabase db push`.
-- ════════════════════════════════════════════════════════════════

-- gen_random_uuid() is built into Postgres 13+ (Supabase), no extension needed.

-- ── Shared enums (as CHECK-constrained text for easy evolution) ──
-- verification status vocabulary used across tables
create or replace function public.is_verification_status(v text)
returns boolean language sql immutable as $$
  select v in ('cafe_verified', 'visitor_confirmed', 'community_reported', 'unverified', 'unknown')
$$;

-- ── updated_at trigger helper ───────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ════════════════════════════════════════════════════════════════
-- Public café data (readable by everyone, writable only by service role)
-- ════════════════════════════════════════════════════════════════

create table if not exists public.cafes (
  id                      uuid primary key default gen_random_uuid(),
  slug                    text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  name                    text not null check (length(name) between 1 and 120),
  is_demo                 boolean not null default false,
  tagline                 text check (length(tagline) <= 200),
  description             text check (length(description) <= 4000),
  neighbourhood           text not null check (neighbourhood ~ '^[a-z0-9-]+$'),
  address                 text check (length(address) <= 300),
  latitude                numeric(9,6) check (latitude between -90 and 90),
  longitude               numeric(9,6) check (longitude between -180 and 180),
  price_min               integer check (price_min >= 0),
  price_max               integer check (price_max >= 0),
  price_status            text not null default 'unknown' check (public.is_verification_status(price_status)),
  opening_hours           jsonb check (opening_hours is null or jsonb_typeof(opening_hours) = 'array'),
  hours_status            text not null default 'unknown' check (public.is_verification_status(hours_status)),
  hours_last_verified_at  timestamptz,
  phone                   text check (length(phone) <= 30),
  website                 text check (website is null or website ~* '^https?://'),
  instagram               text check (length(instagram) <= 60),
  atmosphere              text[] not null default '{}'
                          check (atmosphere <@ array['quiet','cosy','romantic','lively','aesthetic','outdoor','work_friendly']),
  occasions               text[] not null default '{}'
                          check (occasions <@ array['study','work','date','friends','birthday','solo','coffee','dessert','photography','relaxation']),
  noise_level             text check (noise_level in ('quiet','moderate','lively')),
  noise_status            text not null default 'unknown' check (public.is_verification_status(noise_status)),
  seating_indoor          boolean,
  seating_outdoor         boolean,
  group_friendly          boolean,
  seating_note            text check (length(seating_note) <= 300),
  food_types              text[] not null default '{}',
  serves_veg              boolean,
  serves_non_veg          boolean,
  dietary_status          text not null default 'unknown' check (public.is_verification_status(dietary_status)),
  tags                    text[] not null default '{}',
  accessibility_note      text check (length(accessibility_note) <= 500),
  data_source             text not null,
  verification_status     text not null default 'unverified' check (public.is_verification_status(verification_status)),
  last_verified_at        timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint price_range_valid check (price_min is null or price_max is null or price_max >= price_min),
  constraint coordinates_paired check ((latitude is null) = (longitude is null))
);

create index if not exists cafes_neighbourhood_idx on public.cafes (neighbourhood);
create index if not exists cafes_price_idx on public.cafes (price_min);
create index if not exists cafes_occasions_idx on public.cafes using gin (occasions);
create index if not exists cafes_atmosphere_idx on public.cafes using gin (atmosphere);
create index if not exists cafes_tags_idx on public.cafes using gin (tags);
create index if not exists cafes_location_idx on public.cafes (latitude, longitude);
create index if not exists cafes_created_idx on public.cafes (created_at desc);
drop trigger if exists cafes_updated_at on public.cafes;
create trigger cafes_updated_at before update on public.cafes for each row execute function public.set_updated_at();

create table if not exists public.cafe_facilities (
  id                uuid primary key default gen_random_uuid(),
  cafe_id           uuid not null references public.cafes (id) on delete cascade,
  facility          text not null check (facility in ('wifi','charging','ac','comfortable_seating','outdoor_seating','long_stay','veg_options','parking','wheelchair_access')),
  available         boolean,            -- null = unknown
  status            text not null default 'unknown' check (public.is_verification_status(status)),
  note              text check (length(note) <= 300),
  source            text,
  last_verified_at  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (cafe_id, facility),
  -- a facility can't be "verified" without saying whether it exists
  constraint verified_has_value check (status in ('unknown') or available is not null or status = 'unverified')
);
create index if not exists cafe_facilities_lookup_idx on public.cafe_facilities (facility, available);
drop trigger if exists cafe_facilities_updated_at on public.cafe_facilities;
create trigger cafe_facilities_updated_at before update on public.cafe_facilities for each row execute function public.set_updated_at();

create table if not exists public.cafe_photos (
  id               uuid primary key default gen_random_uuid(),
  cafe_id          uuid not null references public.cafes (id) on delete cascade,
  url              text not null check (url ~* '^https://'),
  alt              text check (length(alt) <= 200),
  credit           text check (length(credit) <= 200),
  is_illustrative  boolean not null default false,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists cafe_photos_cafe_idx on public.cafe_photos (cafe_id, sort_order);
drop trigger if exists cafe_photos_updated_at on public.cafe_photos;
create trigger cafe_photos_updated_at before update on public.cafe_photos for each row execute function public.set_updated_at();

create table if not exists public.menu_items (
  id                 uuid primary key default gen_random_uuid(),
  cafe_id            uuid not null references public.cafes (id) on delete cascade,
  name               text not null check (length(name) between 1 and 120),
  description        text check (length(description) <= 500),
  category           text not null check (category in ('coffee','tea','cold_beverages','bakery','desserts','breakfast','main_course','snacks')),
  price_inr          integer check (price_inr >= 0 and price_inr <= 100000),
  photo_url          text check (photo_url is null or photo_url ~* '^https://'),
  dietary            text check (dietary in ('veg','non_veg','vegan','contains_egg')),
  is_bestseller      boolean not null default false,
  bestseller_source  text check (length(bestseller_source) <= 200),
  is_signature       boolean not null default false,
  popularity_note    text check (length(popularity_note) <= 200),
  source             text not null,
  last_updated       date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- never a bestseller label without a recorded source
  constraint bestseller_needs_source check (not is_bestseller or bestseller_source is not null)
);
create index if not exists menu_items_cafe_idx on public.menu_items (cafe_id, category);
create index if not exists menu_items_flags_idx on public.menu_items (is_signature, is_bestseller);
drop trigger if exists menu_items_updated_at on public.menu_items;
create trigger menu_items_updated_at before update on public.menu_items for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- Private user data
-- ════════════════════════════════════════════════════════════════

create table if not exists public.user_profiles (
  id                       uuid primary key references auth.users (id) on delete cascade,
  display_name             text check (length(display_name) <= 40),
  preferred_budget         text check (preferred_budget in ('under150','150to300','300to500','500to1000','flexible')),
  preferred_neighbourhood  text check (preferred_neighbourhood ~ '^[a-z0-9-]+$'),
  dietary_preferences      text[] not null default '{}' check (cardinality(dietary_preferences) <= 8),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
drop trigger if exists user_profiles_updated_at on public.user_profiles;
create trigger user_profiles_updated_at before update on public.user_profiles for each row execute function public.set_updated_at();

-- Create a profile row automatically for every new auth user.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_profiles (id, display_name)
  values (new.id, nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 40), ''))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table if not exists public.saved_places (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  cafe_id     uuid not null references public.cafes (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, cafe_id)
);
create index if not exists saved_places_user_idx on public.saved_places (user_id, created_at desc);

create table if not exists public.collections (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null check (length(trim(name)) between 1 and 60),
  description  text check (length(description) <= 300),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists collections_user_name_uidx on public.collections (user_id, lower(name));
drop trigger if exists collections_updated_at on public.collections;
create trigger collections_updated_at before update on public.collections for each row execute function public.set_updated_at();

create table if not exists public.collection_items (
  id             uuid primary key default gen_random_uuid(),
  collection_id  uuid not null references public.collections (id) on delete cascade,
  cafe_id        uuid not null references public.cafes (id) on delete cascade,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (collection_id, cafe_id)
);
create index if not exists collection_items_collection_idx on public.collection_items (collection_id);

-- Touch the parent collection when items change.
create or replace function public.touch_collection()
returns trigger language plpgsql as $$
begin
  update public.collections set updated_at = now() where id = coalesce(new.collection_id, old.collection_id);
  return null;
end $$;
drop trigger if exists collection_items_touch on public.collection_items;
create trigger collection_items_touch after insert or delete on public.collection_items for each row execute function public.touch_collection();

-- ════════════════════════════════════════════════════════════════
-- Community data
-- ════════════════════════════════════════════════════════════════

create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  cafe_id     uuid not null references public.cafes (id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  body        text not null check (length(trim(body)) between 20 and 1500),
  visited_on  date check (visited_on >= date '2000-01-01'),  -- future dates rejected by the app
  photo_path  text check (photo_path is null or photo_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+$'),
  status      text not null default 'published' check (status in ('published','hidden')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, cafe_id)  -- one review per person per place
);
create index if not exists reviews_cafe_idx on public.reviews (cafe_id, created_at desc);
drop trigger if exists reviews_updated_at on public.reviews;
create trigger reviews_updated_at before update on public.reviews for each row execute function public.set_updated_at();

create table if not exists public.facility_reports (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  cafe_id         uuid not null references public.cafes (id) on delete cascade,
  report_type     text not null check (report_type in ('facility','menu_price','opening_hours','noise','other')),
  facility        text check (facility in ('wifi','charging','ac','comfortable_seating','outdoor_seating','long_stay','veg_options','parking','wheelchair_access')),
  reported_value  text check (length(reported_value) <= 120),
  details         text not null check (length(trim(details)) between 10 and 1000),
  status          text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint facility_required check (report_type <> 'facility' or facility is not null)
);
create index if not exists facility_reports_cafe_idx on public.facility_reports (cafe_id, status);
create index if not exists facility_reports_user_idx on public.facility_reports (user_id, created_at desc);
drop trigger if exists facility_reports_updated_at on public.facility_reports;
create trigger facility_reports_updated_at before update on public.facility_reports for each row execute function public.set_updated_at();

-- Simple abuse guard: at most 10 reports per user per day.
create or replace function public.limit_reports()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.facility_reports where user_id = new.user_id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Daily report limit reached. Thank you for helping!';
  end if;
  return new;
end $$;
drop trigger if exists facility_reports_limit on public.facility_reports;
create trigger facility_reports_limit before insert on public.facility_reports for each row execute function public.limit_reports();

-- ════════════════════════════════════════════════════════════════
-- Public read models (no emails or private fields exposed)
-- ════════════════════════════════════════════════════════════════

-- Ratings are ALWAYS derived from actual review rows.
create or replace view public.cafe_rating_summary
with (security_invoker = true) as
select cafe_id,
       round(avg(rating)::numeric, 2) as average_rating,
       count(*)::int                  as review_count
from public.reviews
where status = 'published'
group by cafe_id;

-- Deliberately NOT security_invoker: user_profiles is private (RLS = own row only),
-- but a reviewer's chosen display name must be visible next to their review.
-- This view exposes only published reviews and the display name: never emails,
-- budgets, neighbourhoods or dietary preferences.
create or replace view public.public_reviews as
select r.id, r.cafe_id, r.user_id, p.display_name as author_name,
       r.rating, r.body, r.visited_on, r.photo_path, r.created_at
from public.reviews r
left join public.user_profiles p on p.id = r.user_id
where r.status = 'published';
