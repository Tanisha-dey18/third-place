# THIRD PLACE

**Not home. Not work. Your place.**

THIRD PLACE is a café and hangout discovery app for Kolkata. You describe what you need ("a quiet café in South Kolkata to study for three hours, with charging, under ₹400") and it returns a ranked shortlist. Each result says why it fits, how sure we are, and what we don't know.

> **Demo mode is on by default.** The app ships with 18 **fictional** cafés so every feature can be used without any accounts or API keys. They are labelled "Demo" everywhere. Their names, addresses, menus, prices, hours and facility statuses are illustrative. The data contains no reviews or ratings: ratings only ever come from real review records.

---

## Contents

1. [Features](#features)
2. [Quick start](#quick-start)
3. [Project structure](#project-structure)
4. [Environment variables](#environment-variables)
5. [Supabase setup](#supabase-setup-database--auth)
6. [Netlify deployment](#netlify-deployment)
7. [Optional AI search](#optional-ai-assisted-search)
8. [Maps](#maps)
9. [How recommendations work](#how-recommendations-work)
10. [Data honesty rules](#data-honesty-rules)
11. [Security notes](#security-notes)
12. [What works without credentials](#what-works-without-credentials)
13. [Troubleshooting](#troubleshooting)
14. [Known limitations](#known-limitations)

---

## Features

| Area | What's implemented |
|---|---|
| **Home** | Natural-language hero search with location and budget pickers. Also: Explore by Mood, Recommended for You (only when you've set preferences), Discover Nearby (geolocation on request, or a neighbourhood), Study-Friendly, Best for Dates, Budget-Friendly, Coffee & Dessert, Hidden Gems, neighbourhoods and Recently Added (by real `created_at`). |
| **Mood discovery** | 9 moods (Study, Date, Friends, Aesthetic, Budget, Coffee & Dessert, Solo, Work, Birthday). Each opens a real filtered, ranked page (`/mood/:slug`). |
| **Find My Place** | Guided form: occasion, budget, location (current, neighbourhood or anywhere), distance, atmosphere, must-have facilities, food, seating, minimum rating and open-at time. The engine is deterministic: it scores each place, applies penalties, explains every result, flags unknowns, and suggests which constraint to relax when nothing matches. |
| **Natural-language search** | Rule-based parser (no network). It extracts occasion, budget, area or region, atmosphere, facilities, duration, time, rating and food, then shows "What we understood". An optional server-side LLM can do the parsing and write explanations for results that already passed the engine. |
| **Explore** | Search by name, dish or area (debounced). Filters for neighbourhood, budget, occasion, atmosphere and confirmed facilities. Sort by best match, distance, price, verified rating or newest. List and map views with marker highlighting, "Load more", and URL-shareable state. |
| **Café pages** | Photos, address, coordinates, price with its status, opening hours with "open now", contact, study-suitability summary, a facility table where every row has its own source and date, noise, seating, dietary and accessibility details. Also: menu with categories and a veg filter, a mini map, directions, save, add to collection, share, reviews, and report incorrect info. |
| **Study Spots** | A dedicated page with must-have filters (charging, Wi-Fi, comfortable seating, AC, long stay, quiet, group tables), budget, location and distance. Each place shows a transparent checklist, when it was last verified, and a one-tap report. |
| **Menu explorer** | Every menu item across places, with search, category, price cap, veg-only, house signatures, and bestsellers (shown only when a source is recorded). |
| **Accounts** | Supabase Auth email/password sign-up, login and logout, persistent session, and a profile with budget, home neighbourhood and optional dietary preferences. |
| **Saved & collections** | Save or unsave places. Collections can be created, renamed and deleted, and places added or removed (with starters: Date Ideas, Study Spots, Weekend Plans, Places to Try, Coffee Favourites). Signed in, these sync to Supabase. Signed out, they stay on this device and are labelled that way. Device-saved places move to the account on first sign-in. |
| **Community** | 1–5 star reviews (one per person per place), optional photo upload to Supabase Storage, and reports for facilities, noise, menu prices and hours. Ratings are aggregated from real rows only. |
| **Curated collections** | Built automatically from records using visible rules (e.g. "Wi-Fi and charging both confirmed"). Never "trending". |

---

## Quick start

Requirements: **Node 18.18+** (Node 20 LTS recommended) and npm.

```bash
npm install
```

```bash
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173). No `.env` is needed for demo mode.

Other scripts:

| Command | Purpose |
|---|---|
| `npm run build` | Type-check (`tsc -b`) and produce the production build in `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | 19 checks covering the parser, engine, filters, opening hours, study summary, sanitizer, demo-data integrity and the AI function's guard rails |
| `npm run seed:sql` | Regenerate `supabase/seed/demo_seed.sql` from `src/data/demoCafes.ts` |
| `npm run typecheck` | TypeScript only |

To test the Netlify Function locally as well, use the Netlify CLI (`npx netlify dev`). It serves the app and `/.netlify/functions/*` together.

---

## Project structure

```
ThirdPlace/
├── index.html                 # App shell, fonts, meta
├── netlify.toml               # Build, SPA redirect, security headers, functions dir
├── .env.example               # Every variable, documented (placeholders only)
├── netlify/functions/
│   └── ai-search.ts           # Optional server-side AI (Anthropic / Gemini / Groq)
├── supabase/
│   ├── migrations/
│   │   ├── 20261014000001_schema.sql   # Tables, constraints, indexes, triggers, views
│   │   └── 20261014000002_rls.sql      # Row Level Security, grants, storage bucket
│   └── seed/demo_seed.sql              # Optional fictional data (is_demo = true)
├── scripts/
│   ├── engine-check.ts        # npm test
│   └── generate-demo-seed.ts  # npm run seed:sql
└── src/
    ├── types.ts               # Domain model (Cafe, MenuItem, FacilityRecord, …)
    ├── data/demoCafes.ts      # 18 FICTIONAL demo cafés
    ├── lib/
    │   ├── engine/            # parse.ts · score.ts · profiles.ts · sanitize.ts · types.ts
    │   ├── repository/        # cafes.ts · community.ts · library.ts (demo ⇄ Supabase)
    │   ├── ai.ts              # Browser client for the AI function (with fallback)
    │   ├── config.ts          # Browser-safe env handling (+ service-key leak guard)
    │   ├── filters.ts         # Explore filters & sorting
    │   ├── geo.ts             # Haversine, opening-hours logic, directions links
    │   ├── study.ts           # Study-suitability summary
    │   ├── taxonomy.ts        # Vocabularies, labels, neighbourhoods
    │   ├── moods.ts           # Mood presets
    │   └── validation.ts      # zod schemas for forms
    ├── context/               # Auth, Data, Library (saved/collections), Toast
    ├── components/            # Cards, MatchCard, Results, MapView (lazy), dialogs, …
    └── pages/                 # Home, Explore, Mood, Study, Find, Search, CafeDetail,
                               # Menu, Neighbourhoods, Collections, Saved, Auth, Profile, About
```

### The repository layer

The UI never touches Supabase or the demo array directly. It talks to three small interfaces:

- `CafeRepository.listCafes()` returns either `DEMO_CAFES` or rows from `cafes` + `cafe_facilities` + `cafe_photos` + `menu_items`, mapped into the same `Cafe` shape (`mapCafeRow`).
- `CommunityRepository` handles ratings, reviews and reports, stored either in the browser (demo) or in Supabase.
- `LibraryRepository` handles saved places and collections, stored either in the browser or in Supabase.

Switching from demo to real data is a configuration change (`VITE_CAFE_DATA_SOURCE=supabase`), not a UI rewrite.

---

## Environment variables

Copy `.env.example` to `.env.local` for local development. In Netlify, set them under **Site configuration → Environment variables**.

| Variable | Where it's used | Safe in the browser? | Purpose |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Browser | ✅ Yes | Your project URL (`https://xxxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Browser | ✅ Yes (anon/publishable key only) | Public key. All private data is protected by RLS. The app **refuses** a service-role/secret key here and shows a configuration error. |
| `VITE_CAFE_DATA_SOURCE` | Browser | ✅ Yes | `demo` (default) or `supabase` |
| `VITE_MAP_TILE_URL` | Browser | ✅ Yes (restrict any key to your domain) | Leaflet tile template; defaults to OpenStreetMap community tiles |
| `VITE_MAP_ATTRIBUTION` | Browser | ✅ Yes | Attribution HTML for your tile provider |
| `VITE_MAP_ENABLED` | Browser | ✅ Yes | `false` hides maps (list view still works) |
| `VITE_AI_SEARCH_ENABLED` | Browser | ✅ Yes | `true` makes search call the AI function. It's only a flag; no key is involved. |
| `AI_PROVIDER` | Netlify Function | ❌ Server only | `anthropic`, `gemini` or `groq` |
| `AI_MODEL` | Netlify Function | ❌ Server only | Optional override. Defaults: `claude-opus-5-5`, `gemini-2.5-flash`, `llama-3.3-70b-versatile` |
| `ANTHROPIC_API_KEY` | Netlify Function | ❌ **Secret** | Needed when `AI_PROVIDER=anthropic` |
| `GEMINI_API_KEY` | Netlify Function | ❌ **Secret** | Needed when `AI_PROVIDER=gemini` |
| `GROQ_API_KEY` | Netlify Function | ❌ **Secret** | Needed when `AI_PROVIDER=groq` |
| `AI_ALLOWED_ORIGINS` | Netlify Function | ❌ Server only | Optional comma-separated origin allow-list. Defaults to same-origin only. |

Anything prefixed `VITE_` ends up in the public JavaScript bundle. **Never** put a secret behind a `VITE_` name. The Supabase **service-role key is not used anywhere in this project.** Keep it out of Netlify unless you add an admin tool.

---

## Supabase setup (database + auth)

1. **Create a project** at [supabase.com](https://supabase.com). The free tier is fine.
2. **Run the migrations.** In the dashboard, open **SQL Editor** and run these in order:
   1. `supabase/migrations/20261014000001_schema.sql`
   2. `supabase/migrations/20261014000002_rls.sql`

   If you use the Supabase CLI, `supabase link` then `supabase db push` does the same.
3. **(Optional) Load the demo data into the database.** Run `supabase/seed/demo_seed.sql`.
   - Do this if you enable accounts **while still showing demo cafés**. Saved places, collections and reviews reference `cafes.id` through foreign keys, so the demo cafés must exist in the database. The seed uses the same IDs as the bundled data.
   - Every seeded row has `is_demo = true`. To remove them later, run `delete from public.cafes where is_demo;` (cascades to facilities, photos and menus).
4. **Auth settings** (*Authentication → Providers → Email*): keep email/password on. Under *URL Configuration*, set the **Site URL** to your Netlify URL and add `http://localhost:5173` to *Redirect URLs* for local testing. If email confirmation is on (the default), new users must click the emailed link before logging in. The app handles this.
5. **Copy the keys** from *Project Settings → API*: the Project URL and the **anon / publishable** key. Never copy the service-role key into the frontend.
6. **Configure the app:**
   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY
   VITE_CAFE_DATA_SOURCE=demo        # or "supabase" once you have real records
   ```
7. **Adding real cafés.** Insert into `cafes`, `cafe_facilities`, `cafe_photos` and `menu_items` with `is_demo = false`, a real `data_source`, an honest `verification_status` and the `last_verified_at` dates. Writes need the service role (Table Editor or a trusted server); users can't modify café data. Then set `VITE_CAFE_DATA_SOURCE=supabase`.

### What the schema enforces

- **Primary keys and foreign keys** everywhere, with `on delete cascade` for child rows. Every table has `created_at` and `updated_at`, kept current by triggers.
- **CHECK constraints** cover controlled vocabularies (occasions, atmospheres, facilities, menu categories, verification statuses), price ranges, paired coordinates and text lengths. A menu item can't be marked bestseller without a `bestseller_source`.
- **One review per user per place.** Ratings are only exposed through `cafe_rating_summary`, which is computed from `reviews`.
- **A profile row is created automatically** for every new auth user. Facility reports are limited to 10 per user per day.
- **Indexes** cover neighbourhood, price, location, created date, and GIN indexes on tags, occasions and atmosphere.

### Row Level Security summary

| Table | anon | signed-in user |
|---|---|---|
| `cafes`, `cafe_facilities`, `cafe_photos`, `menu_items` | read | read (no writes) |
| `user_profiles` | none | read/insert/update **own row only** |
| `saved_places`, `collections`, `collection_items` | none | full access to **own rows only** |
| `reviews` | read published | read published + own; write/update/delete **own** |
| `facility_reports` | none | insert own (status `pending`), read own |
| `storage: review-photos` | read | upload/delete only inside `<their user id>/` |

`public_reviews` exposes published reviews plus the reviewer's chosen display name, never emails or private preferences.

The migrations were tested against a real Postgres engine (PGlite) with stubbed `auth` and `storage` schemas. Both migrations and the seed load cleanly. One user can't read or write another's saved places, users can't modify café or menu tables, and ratings come only from review rows. Still, re-test on your own project before launch.

---

## Netlify deployment

1. Push this folder to a Git repository (GitHub, GitLab or Bitbucket).
2. In Netlify, choose **Add new site → Import an existing project** and select the repo. `netlify.toml` already sets:
   - build command `npm run build`, publish directory `dist`, Node 20
   - functions directory `netlify/functions`
   - an SPA redirect (`/* → /index.html 200`) so deep links like `/cafe/margin-notes` work
   - security headers and long-term caching for hashed assets
3. Add environment variables (see the table above). For demo mode you need **none**.
4. Deploy. After adding or changing a `VITE_*` variable, **trigger a new deploy**, because these values are baked in at build time.
5. Put the Netlify URL into Supabase *Authentication → URL Configuration*.

You can also deploy from the CLI with `npx netlify deploy --build --prod`.

---

## Optional AI-assisted search

AI is **optional**: search, Find My Place and every ranking work without it.

**How it works**

1. The browser posts the query to `/.netlify/functions/ai-search`. No user ID, email or device location is sent.
2. The function asks the configured provider to fill a **fixed schema** of preferences (occasion, budget, area, facilities, …). The result is validated by `sanitizePreferences`, which drops anything outside the app's vocabularies.
3. The **deterministic engine** ranks actual café records. The AI never picks, names or invents places.
4. If enabled, the function writes a one-sentence explanation for each of the top five results. It receives only those records' facts, and any explanation for an unknown ID is discarded. Each one is labelled as an AI-written summary in the UI.
5. If anything fails (not configured, timeout, refusal, invalid output, rate limit), the browser silently falls back to the rule-based parser.

**Configure it** (in Netlify environment variables):

```
VITE_AI_SEARCH_ENABLED=true
AI_PROVIDER=anthropic          # or gemini / groq
ANTHROPIC_API_KEY=…            # the matching key, server-side only
# AI_MODEL=…                   # optional override
```

The Anthropic integration uses the official `@anthropic-ai/sdk` with structured outputs (`messages.parse` + `zodOutputFormat`) and `effort: "low"` to keep it fast. The default model is `claude-opus-5-5`; set `AI_MODEL=claude-haiku-5-5` for a much cheaper option. Gemini and Groq are called through their REST APIs in JSON mode and validated with the same zod schema.

**Guard rails in the function:** POST only, an 8 KB body limit, a 300-character query limit, a same-origin check (or `AI_ALLOWED_ORIGINS`), a best-effort per-IP limit of 20 requests/minute per function instance, 15 s provider timeouts, and generic error messages to the client.

---

## Maps

- Built with **Leaflet + react-leaflet**. The map is code-split, so the ~150 KB Leaflet chunk loads only when a map is shown.
- Features: café markers, popups with directions, list and map views, highlighting the selected café from the list, a "your location" marker, neighbourhood filtering, and distance sorting.
- **Location is requested only when you tap "Use my location".** If it's denied, you can pick a neighbourhood instead. Coordinates stay in memory and are never stored or sent to a server.
- **Tile provider.** The default is the OpenStreetMap community tile server, styled with a warm CSS tint. It's suitable **for demos and light traffic only** under the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/). For a public launch, set `VITE_MAP_TILE_URL` and `VITE_MAP_ATTRIBUTION` for a keyed provider (MapTiler, Stadia Maps, Thunderforest, …), follow its attribution and caching terms, and restrict the key to your domain.
- If tiles fail to load, an overlay says so and markers still work. `VITE_MAP_ENABLED=false` removes maps entirely. Places without coordinates are counted and never placed at a guessed location.
- Directions open Google Maps using coordinates, or the address when coordinates are missing.

---

## How recommendations work

`src/lib/engine/score.ts` is a pure, deterministic function.

**1. Hard constraints decide eligibility.**
- Constraints: budget ceiling, neighbourhood or region, maximum distance, each must-have facility, seating, minimum rating and open-at time.
- A constraint that is **confirmed false** makes the place ineligible.
- A constraint that is **unknown** keeps the place eligible, but it is **penalised** (−7) and listed under "Missing or unverified".

**2. Soft components produce a score.** These are occasion fit, atmosphere overlap, verification-weighted facility confidence, budget comfort, proximity, food match, keyword match and data quality. Only the components relevant to the request count, and the total is normalised to 0–100.

**3. Weak evidence costs points.** Facilities that are only community-reported or unverified incur extra penalties. Unverified claims are never listed as a reason.

**4. Relaxation analysis.** When fewer than 3 places qualify, the engine re-runs with each constraint removed in turn and offers "Drop ‘Within 1 km’ (+4)" buttons. The closest near-misses are shown with the exact requirement each one fails.

**5. Weak matches are collapsed.** Places scoring below 30 sit behind "Show weaker matches".

Occasion profiles (`profiles.ts`) are **soft** boosts only. "Laptop-friendly" maps to the *work-friendly atmosphere*, never to Wi-Fi or charging.

Because the input is a plain `Preferences` object, an LLM (or any future service) can produce it without changing the engine.

---

## Data honesty rules

- Every important fact carries a status: **Café-verified · Visitor-confirmed · Community-reported · Unverified · Unknown**, plus a last-verified date where known.
- Card facility pills show only facilities that are **available and confirmed** by the café or a visitor. The Explore "must have" filter uses the same rule. Unverified or unknown facilities are hidden, never assumed, and the number hidden is shown.
- Ratings exist only when real reviews exist. In demo mode your own reviews are stored in your browser and labelled "stored on this device".
- No visitor counts, trending lists or popularity claims are generated. "Hidden gems" is an explicitly editorial tag. Curated collections show the rule that built them.
- Demo records show a "Demo" badge on every card, a notice on every detail page, the label "(illustrative demo address)" on addresses, and a site-wide banner. Photos are labelled as illustrative stock images.

---

## Security notes

What is implemented:
- RLS on every table.
- Anon key only in the browser, with a runtime guard that rejects service-role or secret keys.
- Secrets only in Netlify Functions.
- zod validation on all forms, mirrored by database CHECK constraints.
- Report rate limiting in the database.
- An AI function with input limits, an origin check and a per-IP limit.
- Security headers (`X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`).
- Reviews reject phone numbers and emails, to avoid exposing personal contact details.
- No hardcoded localhost URLs: auth redirects use `window.location.origin`.

What this does **not** claim:
- The AI function's rate limit is in-memory and per instance, so it is best-effort. For production, add Netlify rate limiting or an external store.
- There is no CAPTCHA on sign-up, and no moderation UI for reports or reviews yet (moderators use the Supabase dashboard).
- Review photo uploads are checked for type and size, but aren't scanned.

---

## What works without credentials

With no `.env` at all:

- ✅ Home, all sections, mood pages, Hidden Gems, Neighbourhoods, About.
- ✅ Natural-language search (rule-based) with "What we understood", ranked results, unknowns and relaxation suggestions.
- ✅ Find My Place, including current location (with permission), distance limits and opening-time checks.
- ✅ Explore with search, all filters, all sorts, list and map views, and Load more.
- ✅ Café detail pages, menus, study summaries, directions and sharing.
- ✅ Study Spots and the Menu explorer.
- ✅ Save, collections (create, rename, delete, add, remove), reviews and reports, **stored in this browser only** and labelled that way.
- ✅ Profile preferences stored on the device, which power "Recommended for you".
- ✅ Map, using OSM community tiles. It needs internet access; no key is required.
- ⛔ Accounts, cross-device sync, public reviews, photo uploads and sent reports. These need Supabase.
- ⛔ AI-assisted parsing and explanations. These need a provider key, and the rule-based fallback is used instead.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| A "Configuration error: a secret Supabase key…" banner | You put the service-role or secret key in `VITE_SUPABASE_ANON_KEY`. Use the **anon/publishable** key and rotate the leaked secret in Supabase. |
| Login page says accounts aren't available | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are missing or invalid. They must be set **at build time**, so redeploy after setting them. |
| "insert or update on table saved_places violates foreign key constraint" | You're using accounts with demo cafés but didn't run `supabase/seed/demo_seed.sql`. |
| Sign-up works but login fails | Email confirmation is on. Click the link in the email, and check that the Site URL and Redirect URLs include your domain. |
| `Could not load cafés: …` with `VITE_CAFE_DATA_SOURCE=supabase` | The migrations weren't run, or the RLS migration wasn't applied. Re-run both SQL files. |
| Empty home page with "No places listed yet" | Data source is `supabase` but the `cafes` table is empty. Add records, load the seed, or switch back to `demo`. |
| Deep links 404 on Netlify | Make sure `netlify.toml` is at the repo root (it holds the SPA redirect). |
| Map is grey or shows an error overlay | You're offline, or the tile provider is rate-limiting or needs a key. Set `VITE_MAP_TILE_URL` to a keyed provider, or `VITE_MAP_ENABLED=false`. |
| Search never says "Understood with AI assistance" | Check `VITE_AI_SEARCH_ENABLED=true` (then redeploy), `AI_PROVIDER` and the matching key in Netlify. Look at the function logs. Locally, use `npx netlify dev`, because `npm run dev` doesn't run functions. |
| "Use my location" does nothing | The browser blocked permission, or the page isn't on HTTPS/localhost. Pick a neighbourhood instead. |

---

## Known limitations

- **No real café data is included.** All 18 places are fictional, by design. Launching for real means collecting and verifying records (`is_demo = false`).
- Demo coordinates are placed near real neighbourhood centres for map and distance demos. They don't mark real businesses.
- All cafés are loaded at once (fine for hundreds of records). For thousands, move filtering into SQL or RPC and paginate server-side; the repository interface is where that change belongs.
- There's no live seat-availability data. "Group study tables" uses the listed seating.
- Opening-time checks use the browser's local time, so they assume you're in Kolkata (IST).
- Moderation (accepting reports, hiding reviews) happens in the Supabase dashboard; there's no in-app admin UI.
- The AI path was implemented and its guard rails tested (no-key 503, origin rejection, input validation), but **no live provider call was made** while building, because no API keys were supplied.
- Supabase Auth flows were implemented against the documented `supabase-js` v2 API but not run end-to-end against a live project. The SQL and RLS were tested in Postgres (PGlite) with stubbed Supabase schemas.
#   t h i r d - p l a c e  
 