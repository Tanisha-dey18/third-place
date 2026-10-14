# THIRD PLACE: deployment checklist

Steps marked 🧑 are **external account setup** that only the owner can do (dashboards, keys). Steps marked ✅ are already implemented in code.

## 1. Before you deploy

- [ ] Run locally:
  ```bash
  npm ci
  ```
  ```bash
  npm test
  ```
  ```bash
  npm run test:db
  ```
  ```bash
  npm run build
  ```
- [ ] Confirm `.env`/`.env.local` are **not** committed. `.gitignore` covers them ✅.
- [ ] `git status` shows no secrets; `tests/env-and-separation.test.ts` scans for committed keys ✅.

## 2. Supabase (optional, but needed for accounts) 🧑

- [ ] Create a project, then **back up** if it already has data.
- [ ] Run the migrations in order in the SQL Editor:
  1. `20261014000001_schema.sql`
  2. `20261014000002_rls.sql`
  3. `20261015000003_real_places.sql`

  (Existing installs: only 003, which is additive, idempotent and transactional.)
- [ ] Authentication → URL Configuration: Site URL = your Netlify URL; add redirect URLs for previews and `http://localhost:5173`.
- [ ] Optionally remove old fictional rows yourself: `delete from public.cafes where is_demo;`
- [ ] Copy the Project URL and the **anon/publishable** key. Do **not** copy the service-role key anywhere.
- [ ] Run Supabase's Security Advisor and confirm RLS is on for every table.

## 3. Netlify site 🧑

- [ ] Add new site → Import from Git → pick the repo. Build settings come from `netlify.toml` ✅.
- [ ] Environment variables (Site configuration → Environment variables):

  | Variable | Value | Scope |
  |---|---|---|
  | `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` | Builds |
  | `VITE_SUPABASE_ANON_KEY` | anon/publishable key | Builds |
  | `OVERPASS_CONTACT` | your email or site URL | Functions |
  | `VITE_MAP_TILE_URL`, `VITE_MAP_ATTRIBUTION` | your tile provider (key restricted to your domain) | Builds |
  | `AI_PROVIDER` + key, `VITE_AI_SEARCH_ENABLED=true` | optional | Functions / Builds |

- [ ] Make sure `VITE_DEMO_MODE` is **unset** for production. The build refuses it ✅.
- [ ] Deploy. The build log should show `[check-env] OK`.

## 4. After the first deploy

- [ ] Open the site. The first `/api/places` call kicks off `refresh-places-background` ✅.
- [ ] Within about a minute:
  ```bash
  curl -s "https://<site>/api/places?near=22.55,88.35&r=2" | head -c 300
  ```
  Expect `"provider":"openstreetmap"` and real places.
- [ ] Check routing:
  - `curl -i https://<site>/api/nope` returns **404 JSON**;
  - `https://<site>/cafe/osm-node-2561110172` loads directly (SPA deep link);
  - `https://<site>/explore?area=gariahat` loads.
- [ ] Functions → logs: `refresh-places` (scheduled every 6 h) logs `{"updated":true,…}`.
- [ ] Netlify **Rate limiting**: confirm the rules from the function configs are listed under the site's security settings. Code-based rules need a plan that supports them; if they're unavailable, the in-memory limiters still apply per instance.
- [ ] Response headers: `curl -I https://<site>/` shows the CSP, HSTS and frame headers.
- [ ] If Supabase is configured: sign up, confirm the email, save a place, create a collection, post a review, and check that a second account can't see the first account's saved places.

## 5. Ongoing

- Moderation: hide flagged reviews (`reviews.status = 'hidden'`) and accept or reject `facility_reports` from the Supabase dashboard (service role).
- For reliability at scale: set `OVERPASS_URLS` to a dedicated or paid Overpass instance, and switch map tiles to a paid provider.
- Data fixes belong at the source: use the "Fix it at the source" link to edit OpenStreetMap.
