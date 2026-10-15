# THIRD PLACE

**Not home. Not work. Your place.**

THIRD PLACE is a café and hangout discovery app, launching in **Kolkata**. It shows **real places from OpenStreetMap**, ranks them by your mood, budget, location and must-haves, and labels every fact with where it came from. It never invents prices, ratings, menus, hours or facilities.

> No fictional cafés are shown in production. An opt-in development demo (`VITE_DEMO_MODE=true`) exists for working offline. It is labelled on every screen, and production builds with it switched on are rejected.

---

## Contents

1. [What it does](#what-it-does)
2. [Architecture](#architecture)
3. [Tech stack](#tech-stack)
4. [Local development](#local-development)
5. [Environment variables](#environment-variables)
6. [Real-world café data](#real-world-café-data)
7. [Supabase setup and migrations](#supabase-setup-and-migrations)
8. [Netlify deployment](#netlify-deployment)
9. [Optional AI search](#optional-ai-search)
10. [Security](#security)
11. [Testing](#testing)
12. [Troubleshooting](#troubleshooting)
13. [Known limitations](#known-limitations)

See also **[DEPLOYMENT.md](DEPLOYMENT.md)**, a step-by-step deployment checklist.

---

## What it does

- **Explore:** find real cafés by neighbourhood, near you (with permission), across the city by name, or for whatever area the map is showing. The list and map stay in sync. Filters cover type of place, listed cuisine, "open now" (in Kolkata time), must-have facilities and budget.
- **Find My Place:** a guided form. Each facility can be a **must-have** (strict: only places with evidence) or a **nice-to-have** (ranked, with an uncertainty penalty). Results explain why each place matches, what's missing, and which requirement to relax.
- **Natural-language search:** for example, *"quiet café near Park Street with Wi-Fi open now"*. The rule-based parser needs no API key, and there's an optional server-side LLM.
- **Moods:** Study, Work, Date, Friends, Solo, Aesthetic, Budget, Coffee & Dessert and Birthday. Each mood page says what evidence it can actually use.
- **Café pages:**
  - source facts, each with a status: hours (with the raw text if it can't be parsed), Wi-Fi, seating, accessibility, cuisine and contact;
  - a provenance box linking back to OpenStreetMap, with a "fix it at the source" link;
  - menus and prices only when verified;
  - reviews, flagging, and suggested corrections.
- **Accounts (Supabase):** saved places, collections, preferences, reviews with optional photos, and reports. Without Supabase these are stored on the device and labelled that way.

### How information is labelled

| Status | Meaning |
|---|---|
| Café-verified | Confirmed by the café |
| Visitor-confirmed | A visitor's report accepted by a moderator |
| Source-provided · not verified | Supplied by an external source (e.g. an OpenStreetMap tag). **Never treated as verified.** |
| Community-reported | Pending reports from members, shown as counts |
| Unverified / Unknown | Listed but never checked / no information |

---

## Architecture

```
Browser (React SPA)
  │  GET /api/places?near=…|bbox=…|keys=…|q=…      (coords rounded to ~1 km)
  ▼
Netlify Function  places   ──►  shared snapshot (Netlify Blobs)
  │   validate · limit · CDN-cache headers           ▲
  │                                                  │  refreshed every 6 h
  │                                     scheduled fn refresh-places
  │   no snapshot yet? ── kick ──► background fn refresh-places-background (≤ 15 min, retries)
  │                                                  │
  └──────────────────────────────────────────────►  Overpass API (OpenStreetMap)

Browser ──► Supabase (RLS): verified layer `cafes` linked by place_key, reviews,
            saved places, collections, reports, community_fact_summary
Browser ──► /api/geocode  (Nominatim, cached 30 days)   /api/ai-search (optional)
```

- **Visitor traffic never reaches Overpass directly.** A single city-wide snapshot of every café-like venue (about 150 for Kolkata today, ~45 KB) is refreshed about 4 times a day. Each request is filtered on the server to the requested area, so the browser never downloads the whole city. Results are capped (300 maximum) and sorted by distance.
- **Place keys** are stable, provider-agnostic IDs: `osm:node:123`, `tp:<uuid>` for THIRD PLACE records, and `demo:<slug>` for development only. All user data references these keys.
- **The verified layer:** rows in Supabase `cafes` (with `place_key`) add menus, prices and verified facilities on top of OSM data, field by field. Stronger evidence wins.
- **Multi-city ready:** cities live in `src/lib/cities.ts` (bounds, timezone, neighbourhood centres). The snapshot, API, parser and UI are all parameterised by city.

### Project layout

```
src/
  lib/places/        osm.ts (normalise + dedupe), openingHours.ts, query.ts (area queries),
                     keys.ts, area.ts, client.ts (fetch/dedupe/abort/cache), service.ts
  lib/engine/        deterministic scoring, NL parser, sanitizer
  lib/repository/    curated.ts (Supabase verified layer), community.ts, library.ts
  lib/cities.ts      city + neighbourhood configuration
  lib/envCheck.ts    environment validation (shared with the build check)
  pages/, components/, hooks/, context/
  data/demoCafes.ts  FICTIONAL development data — only bundled when VITE_DEMO_MODE=true
server/              overpass.ts, snapshot.ts, cache.ts, http.ts, handlers/
netlify/functions/   places, geocode, ai-search, refresh-places (scheduled),
                     refresh-places-background
supabase/migrations/ 001 schema · 002 RLS · 003 real places, moderation
tests/               node:test suites (+ db.migrations.test.ts with PGlite)
scripts/             check-env.ts, run-tests.mjs
```

---

## Tech stack

React 18, TypeScript, Vite 5, Tailwind CSS 3, React Router 6, Leaflet + react-leaflet, lucide-react, Supabase (Postgres, Auth, Storage), Netlify Functions (v2) + Netlify Blobs + scheduled/background functions, zod. Data: OpenStreetMap via Overpass and Nominatim. Tests: Node's built-in test runner via `tsx`, and PGlite for the database suite.

---

## Local development

**Requirements:** Node.js **20.11+** (Node 22 recommended) and npm 10+.

```bash
npm install
```

```bash
npm run dev
```

`npm run dev` serves the app **and** the `/api/*` functions through a Vite dev middleware, so live OpenStreetMap data works locally without the Netlify CLI. The first request builds the city snapshot (5–25 s depending on Overpass load). It's then cached in `node_modules/.cache/third-place/` and survives restarts.

| Command | What it does |
|---|---|
| `npm run dev` | App + API on http://localhost:5173 |
| `npm run build` | Type-check (`tsc -b`) + production build to `dist/` |
| `npm run preview` | Serve the build (no API; use `npx netlify dev` for that) |
| `npm test` | Unit and integration tests (60) |
| `npm run test:db` | Migrations + RLS tests against an in-process Postgres (10) |
| `npm run check:env` | Validate environment variables (runs on every Netlify build) |
| `npx netlify dev` | Optional: full Netlify emulation (Blobs, function routing) |

To work fully offline with fictional data, put `VITE_DEMO_MODE=true` in `.env.local`.

---

## Environment variables

Copy `.env.example` to `.env.local` locally. On Netlify, set them under **Site configuration → Environment variables**. `VITE_*` values are compiled into the **public** browser bundle, so never put a secret in one; `check:env` fails the build if you do.

| Variable | Where | Public? | Required? | Purpose |
|---|---|---|---|---|
| `VITE_SUPABASE_URL` | browser | yes | for accounts | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | browser | yes (anon/publishable key only) | for accounts | Public key; data is protected by RLS. Service-role keys are refused at runtime and at build. |
| `VITE_DEMO_MODE` | browser | yes | no | `true` = fictional dev data. Blocked in production. |
| `VITE_MAP_TILE_URL` / `VITE_MAP_ATTRIBUTION` | browser | yes (restrict key to domain) | recommended in production | Tile provider; default is OSM community tiles (light use only) |
| `VITE_MAP_ENABLED` | browser | yes | no | `false` hides maps |
| `VITE_AI_SEARCH_ENABLED` | browser | yes | no | Enables calls to `/api/ai-search` |
| `OVERPASS_CONTACT` | server | n/a | recommended | Contact **e-mail** in the User-Agent for OSM service operators. Never a URL: overpass-api.de answers HTTP 406 to User-Agents containing a site hostname. |
| `OVERPASS_URLS` | server | n/a | no | Comma-separated https Overpass endpoints (e.g. paid or self-hosted). Default: `overpass-api.de`, `z.overpass-api.de`, `lz4.overpass-api.de` |
| `PLACES_BUDGET_MS` | server | n/a | no | Time budget for a cold-start live fetch (default 24000; Netlify returned a gateway 504 at ~30 s on this site) |
| `APP_ORIGIN`, `AI_ALLOWED_ORIGINS` | server | n/a | no | Extra origins allowed to call `/api/*` cross-origin |
| `AI_PROVIDER`, `AI_MODEL` | server | n/a | no | `anthropic` \| `gemini` \| `groq` |
| `AI_DAILY_LIMIT` | server | n/a | no | Max AI provider calls per UTC day across all users (default 500); protects against cost spikes |
| `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY` | server | **secret** | no | Only for the chosen AI provider |

Netlify sets `URL`, `DEPLOY_PRIME_URL`, `CONTEXT` and the Blobs context automatically. **This app never uses the Supabase service-role key**, so don't add it to the site.

---

## Real-world café data

**Source:** [OpenStreetMap](https://www.openstreetmap.org) via the [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API). The app queries `amenity=cafe`, `amenity=ice_cream` and `amenity=restaurant` + `cuisine=coffee_shop`.

**What's used, and only when supplied:** name, coordinates (way and relation centres), `addr:*`, `opening_hours`, `cuisine`, `internet_access`, `air_conditioning`, `indoor_seating`/`outdoor_seating`, `wheelchair`, `diet:*`, `phone`/`contact:*`, `website`, `check_date`, plus takeaway, delivery, smoking, brand and floor shown as "other details".

**Normalisation rules:**
- **Records skipped and counted:** unnamed venues, invalid or missing coordinates, and anything outside the city.
- **Duplicates:** removed by key, and by the same normalised name within 60 m (e.g. a node and a building outline). Different branches of a chain are kept.
- **Unsafe URLs:** only `http(s)` links survive, with no credentials; phone numbers are sanitised.
- **Opening hours:** interpreted conservatively in **Asia/Kolkata**, including overnight ranges, `24/7`, `off`, split shifts and rule overrides. Anything else (months, sunrise, comments…) is shown as raw text with no open/closed claim.

**Freshness:** each record carries `source.fetchedAt` (when *we* fetched it) and `sourceCheckedAt` (OSM's own `check_date`). Neither is shown as a verification date; `lastVerified` is set only by THIRD PLACE's verified layer.

**Caching and provider policy:**
- **Overpass:** the snapshot is refreshed every 6 h (≈ 4 requests/day/city), with a per-instance concurrency cap of 2, bounded retries across fallback endpoints, a failure backoff, and an identifying User-Agent. API responses are CDN-cached (`s-maxage=1800`, stale-while-revalidate). A smaller response never replaces a good snapshot.
- **Nominatim:** explicit submit only (no autocomplete), ≤ 1 request/s per instance, results cached 30 days, bounded to the city.
- **Tiles:** OSM community tiles are the default for development. For production, configure a provider (e.g. MapTiler or Stadia) and follow its terms.

**Licensing:** OSM data is © OpenStreetMap contributors under the **ODbL 1.0**. We store the normalised snapshot in Netlify Blobs, which ODbL permits, and show attribution on every list, map and place page. User tables in Supabase store only place keys, not OSM data. If you ever publish the snapshot itself as a database, ODbL share-alike applies.

**Coverage reality:** OpenStreetMap doesn't list every café, and most Kolkata listings have no facility or price data (as of Oct 2026, roughly 150 venues; about a fifth list hours). The UI says so, offers "add it to OpenStreetMap", and lets members report facts.

**Scaling path:** for more cities or heavy traffic, set `OVERPASS_URLS` to a paid or self-hosted Overpass instance, or replace `server/overpass.ts` with a PostGIS import of an OSM extract. The rest of the app depends only on the `/api/places` contract.

---

## Supabase setup and migrations

1. Create a project at [supabase.com](https://supabase.com).
2. In the **SQL Editor**, run these **in order**:
   1. `supabase/migrations/20261014000001_schema.sql`
   2. `supabase/migrations/20261014000002_rls.sql`
   3. `supabase/migrations/20261015000003_real_places.sql`

   With the CLI: `supabase link --project-ref <ref>`, then `supabase db push`.
3. **Already running the previous version?** Run only **003**. It's additive and idempotent:
   - it adds `place_key` next to `cafe_id` and backfills it;
   - it drops no tables, columns or rows, and runs in one transaction.

   Take a backup first (Dashboard → Database → Backups).
4. **Auth:** keep Email enabled. Under *URL Configuration*, set the Site URL to your Netlify URL and add `http://localhost:5173` to the redirect URLs.
5. **Storage:** migration 002 creates the public `review-photos` bucket (3 MB; JPEG, PNG or WebP; uploads only into the uploader's own folder).
6. Copy the **Project URL** and **anon/publishable key** into `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

**Old demo rows:** if you previously loaded the old demo seed, remove those rows with `delete from public.cafes where is_demo;`. This is destructive, so run it yourself. Saved places that referenced those rows keep their `tp:` keys and show as "no longer listed".

### What the database enforces

- **RLS on every table.** Users read and write only their own profiles, saved places, collections, items, reports and flags. `user_id` defaults to `auth.uid()`, and any other value is rejected.
- **Café, menu, facility and photo tables are read-only** for anonymous and signed-in users. Moderators write with the service role, outside the app.
- **Reviews:**
  - one per user per place, 1–5 stars, 20–1500 characters, and at most 10 a day;
  - users can't set or change moderation status, so a hidden review stays hidden;
  - `photo_path` must sit in the author's own storage folder.
- **Reports:** inserted as `pending`. There's no update policy, so nobody can approve their own report. `community_fact_summary` exposes anonymous yes/no counts only.
- **Flags:** `content_flags` lets members flag a review once, for moderators.
- **Limits:** 50 collections per user, 200 places per collection, 10 reports per day.

**Moderation policy:** reviews publish immediately, by design (low friction), with the abuse controls above. Anyone signed in can flag a review. Moderators hide reviews and accept or reject reports from the Supabase dashboard. Accepting a facility report means writing a `cafe_facilities` row with status `visitor_confirmed` on the `cafes` row for that `place_key`.

---

## Netlify deployment

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for the full checklist. In short:

1. Connect the Git repository in Netlify. `netlify.toml` already sets the build command (`npm run check:env && npm run build`), `dist`, the functions directory, Node 20, the SPA fallback, a JSON 404 for unknown `/api/*` paths, security headers and CSP.
2. Set the environment variables above (none are strictly required to get live data).
3. Deploy. On the first visit the places function starts the background snapshot build. If Overpass is slow, the first requests return a clear "being refreshed" 503 for a minute. The scheduled function then keeps the snapshot fresh.
4. Verify:
   ```bash
   curl -s "https://YOUR-SITE.netlify.app/api/places?near=22.55,88.35&r=2" | head -c 400
   ```

`/api/*` routes are defined by each function's `config.path`. Netlify evaluates functions before redirects, so the SPA fallback never swallows API calls.

---

## Optional AI search

Discovery never requires AI. When enabled, `/api/ai-search` asks the provider to fill a fixed preference schema. The output is validated against the app's vocabularies, ranking stays deterministic, and optional one-line explanations are accepted only for places the engine already picked. No user IDs, emails or locations are sent. Any failure, timeout or refusal falls back to the rule-based parser.

```
VITE_AI_SEARCH_ENABLED=true
AI_PROVIDER=anthropic            # or gemini / groq
ANTHROPIC_API_KEY=…              # server-side only
AI_MODEL=claude-haiku-5-5        # optional; default claude-opus-5-5
```

**Cost note:** each search makes one or two provider calls. Haiku-class models cost fractions of a cent per search; check your provider's pricing. Platform rate limit: 20/min per IP.

---

## Security

- **Secrets:** only in server-side variables. `check:env` rejects secret-looking values in `VITE_*` variables, and the browser refuses a service-role key.
- **Rate limiting:**
  - **Shared limiter (Netlify Blobs):** on the routes that cost money or touch rate-limited third parties.
    - `/api/ai-search`: 20 requests/min per client, plus `AI_DAILY_LIMIT` per day overall.
    - `/api/geocode`: 10 requests/min per client and 2,000/day overall, counted only on cache misses that reach Nominatim.
  - **How it works:** counters live in the `third-place-ratelimit` store, keyed by a SHA-256 hash of the client IP, so raw IPs are never stored. It's approximate, because Blobs writes aren't atomic. The scheduled job sweeps old windows.
  - **Why not Netlify's rules:** the `config.rateLimit` rules in each function are kept, but on 15 Oct 2026 they were **verified not to be enforced** on this site (36 rapid requests to a 30/min route all returned 200), probably because of the plan.
  - **Per-instance limiters:** `/api/places` (mostly served from the CDN-cached snapshot) and `/api/health` keep in-memory limiters as a safety net.
- **Input validation:** zod and strict parsers, with structured JSON errors.
  - **Size limits:** URLs ≤ 2 KB, AI bodies ≤ 8 KB, search ≤ 60 characters, keys ≤ 50, bbox ≤ 0.4°, radius ≤ 20 km.
  - **Injection:** user text is never interpolated into Overpass queries; name search runs on the snapshot.
  - **SSRF:** provider URLs come only from server configuration.
- **Data sanitisation:** external links are limited to http(s) and opened with `rel="noopener noreferrer nofollow"`; phone numbers are cleaned; React escapes all text.
- **CORS:** same-origin by default; other origins only if configured.
- **Headers:** CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` and `Permissions-Policy`.
- **Caching:** public place data is CDN-cached; errors and anything user-specific are `no-store`. User data never passes through the functions; it goes straight to Supabase under RLS.
- **Privacy:**
  - **Location:** requested only on tap, rounded to about 1 km before leaving the device, never stored, and never sent to AI.
  - **Reviews:** phone numbers and emails are rejected.
  - **Logs:** server logs carry only counts and error types.

---

## Testing

```bash
npm test
```

```bash
npm run test:db
```

`npm test` runs **60 tests**. They cover:
- provider response parsing, using a real Overpass excerpt in `tests/fixtures`;
- missing, invalid and out-of-city coordinates, missing names and addresses, and duplicates;
- unsafe links, place keys, opening hours and Kolkata timezone behaviour;
- area, bbox, key and name queries, filters and sorting;
- strict vs soft requirements, ranking and relaxation;
- provider failures and retries, malformed responses, empty results, injection attempts and rate limits;
- stale snapshots and background-refresh locking;
- the geocoder, AI-function guards and environment validation;
- separation of demo and live data, and a scan for committed secrets.

`npm run test:db` runs **10 tests**. They apply migrations 001–003 to an in-process Postgres (PGlite) with stand-ins for Supabase's `auth` and `storage` schemas, on top of legacy data. They check the backfill, idempotency, RLS isolation and impersonation, key validation, the moderation-status protection, photo ownership, report self-approval, anonymity of the summaries, and read-only café tables. Each rejection asserts the specific database error. PGlite isn't Supabase, so re-check policies on your real project, e.g. with the Supabase advisor.

---

## Diagnostics

- `GET /api/health` returns: whether the shared cache is Netlify Blobs or memory-only, each city's snapshot (place count, age), and the last refresh (trigger, outcome, and every Overpass attempt as host / HTTP status / duration). It contains no secrets and no user data, and is never cached.
- Function logs carry one JSON line per event: `places_request` (query kind, status, `tier` = snapshot or live, duration, counts), `overpass_attempt` (host, status, ms, outcome) and `snapshot_refresh` / `scheduled_refresh` / `background_handoff`. They never include IP addresses, coordinates or search text.

## Troubleshooting

> **Resolved production incident (Oct 2026):** every `/api/places` call returned 503 within a second. Cause: the server sent `User-Agent: THIRD-PLACE/1.0 (https://<site>.netlify.app)`, built from Netlify's `URL` variable, and overpass-api.de answers any User-Agent containing a site hostname with **HTTP 406 Not Acceptable**. The old code treated 406 as non-retryable. The User-Agent is now fixed (`ThirdPlace/1.0 (Kolkata cafe discovery[; contact: e-mail])`), and 406/403 are logged as `rejected`.

| Symptom | Cause / fix |
|---|---|
| "Café data from OpenStreetMap couldn’t be loaded right now…" (503) | No snapshot yet and every Overpass attempt failed. Open `/api/health`: `sharedCache` must be `netlify-blobs`, and `lastRefresh.attempts` lists each host/status/duration. The background function keeps retrying for up to 15 min after a failure. |
| Persistent 503s | Overpass is overloaded or unreachable. Set `OVERPASS_URLS` to another instance, then redeploy. |
| "The café data service isn't available on this deployment" | `/api/places` returned non-JSON: `vite preview` or static hosting without functions. Use `npm run dev` or `npx netlify dev`, or deploy to Netlify. |
| Build fails at `check:env` | Read the error. Common causes: demo mode on in production, a secret in a `VITE_*` variable, or only one of the two Supabase variables set. |
| Login says accounts aren't available | The Supabase variables are missing at build time. Set them and redeploy. |
| Saving fails with a `saved_places_key_valid` error | Old cached data. Clear site data for the app, then retry. |
| Map is grey | Tile provider is blocked, offline or rate-limited. Configure `VITE_MAP_TILE_URL`. |
| A café is missing | It isn't in OpenStreetMap yet. Add it there; it appears after the next snapshot refresh (≤ 6 h). |

---

## Known limitations

- **Coverage is only as good as OpenStreetMap.** Kolkata has about 150 mapped café-like venues, most with no facility, price or hours data. Strict filters therefore often return few results, and the UI says so.
- **Menus, prices, noise and atmosphere** exist only once a café or moderator adds them through the Supabase verified layer. There's no admin UI yet; moderation happens in the Supabase dashboard.
- **Snapshot staleness:** places can be up to ~6 h (normally) or several days (provider outage) behind OSM. Staleness is flagged in the UI.
- **Single city:** saved places outside the snapshot area resolve through per-element lookups, which only succeed for places inside the city's bounds.
- **No clustering:** at most 300 markers per view, so clustering wasn't needed.
- **Not verified live in this environment:**
  - **Netlify:** routing, Blobs, `/api/places`, `/api/health`, `/api/geocode` and the AI 503 fallback were verified live on 15 Oct 2026. The scheduled job (`refresh-places`) and background function haven't been observed running, because function logs require dashboard access. Netlify's platform rate-limit rules are **not** enforced on this site; the shared Blobs limiter covers the routes that matter.
  - **Production configuration (verified 15 Oct 2026):** Supabase is **not configured**, so accounts, synced saves, public reviews and reports run in device-only mode. AI search is not configured, so the rule-based parser is used.
  - **Console message:** browsers log a CSP error for an inline script injected by Netlify's own toolbar script (`/.netlify/scripts/hud`). The site's HTML has no inline scripts and the app is unaffected. To remove it, disable the Netlify Drawer/toolbar for the site rather than loosening `script-src`.
  - **Supabase:** the SQL was validated with PGlite, but there was no live Supabase project, so Auth flows weren't exercised end-to-end.
  - **AI search:** there were no AI API keys, so no live provider call was made.
- **Overpass:** the public instance was intermittently overloaded (HTTP 504) during development. Production should set `OVERPASS_CONTACT` and consider a dedicated instance for reliability.
