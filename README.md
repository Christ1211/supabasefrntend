# Webinar Admin

Airtable-style admin for the Supabase webinar migration project (`nqsyzxwamtwjrhokpjof`).
Browse / search / filter / sort / export and full **CRUD** on the base tables, with views
exposed read-only. Gated by **Supabase Auth** (individual logins). Deployable to Vercel.

Built with Next.js 14 (App Router) + TypeScript. All data queries run **server-side** with the
service-role key — it never reaches the browser. Auth uses the public anon key (login only).

## How it's secured

- **RLS is enabled** on the tables. The browser never gets a data key.
- The browser only holds the **anon key**, used solely to sign in / hold the session. With RLS on
  and no anon policies, that key can't read or write any data.
- All reads/writes go through **server-side API routes** that (1) verify the logged-in user, then
  (2) use the **service-role key** (server-only env var). No session → `401`.
- `middleware.ts` redirects unauthenticated browser navigation to `/login`.
- Writes are allowed only on the base **tables** (`webinar_registrants`, `webinar_events`);
  `v_*` views are read-only (and Postgres wouldn't accept writes through them anyway).

## Local setup

1. Copy env and fill keys:
   ```bash
   cp .env.example .env.local
   ```
   - `SUPABASE_SERVICE_ROLE_KEY` — Dashboard → Settings → API → **service_role** (secret)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Dashboard → Settings → API → **anon / public**
2. Create at least one login: Dashboard → **Authentication → Users → Add user** (email + password).
   There is no public sign-up by design.
3. Run:
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:3000 → you'll hit the login page.

## Deploy to Vercel

1. Push this folder to a GitHub repo (`.env.local` is gitignored — keys are NOT committed).
2. In Vercel: **New Project** → import the repo.
3. Add the env vars in **Project → Settings → Environment Variables** (same as `.env.local`):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`  ← keep this one secret; it's server-only
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `N8N_WEBINAR_WEBHOOK_URL`  ← server-only; fired when a webinar is created
4. Deploy. Add users in Supabase → Authentication → Users to grant access.
5. In Supabase → Authentication → URL Configuration, add your Vercel domain to the allowed
   redirect/site URLs (so auth cookies work on the deployed domain).

## Features

- **Source switcher** — registrants / events (editable tables) + the `v_*` views (read-only).
- **Search** (email / name / phone), **filters** (reg status, traffic sources, registrant/attendee/
  no-show, registered-date range — shown only when the column exists in the source), **sort**
  (click any header), **pagination** with exact counts.
- **CRUD** on tables: **+ New**, **Edit**, **Delete** (with confirm). Edit/create drawer renders a
  field per column; booleans as true/false/null; blank = `null`.
- **CSV export** of the current filtered/sorted set (capped 10k rows).
- Toasts for success/errors; logged-in email + **Log out** in the top bar.

## Architecture

```
middleware.ts                refresh session + redirect unauthenticated browser nav to /login
app/login/page.tsx           email/password sign-in (anon client)
app/page.tsx                 server component → reads user → renders <Explorer/>
app/api/data/route.ts        GET list · POST create · PATCH update · DELETE  (all auth-guarded)
app/api/export/route.ts      CSV (auth-guarded)
lib/supabase.ts              service-role admin client (SERVER ONLY — data)
lib/supabase-server.ts       SSR auth client (reads cookies — getUser)
lib/supabase-browser.ts      browser auth client (login/logout)
lib/auth.ts                  requireUser() guard for API routes
lib/sources.ts               source whitelist + writable/readable rules
lib/query.ts                 search/filter/sort param parsing + query builder
lib/schema.ts                sources list + filter/column display config
components/Explorer.tsx       the whole client UI (table, filters, pager, CRUD drawer, toasts)
```

## New-webinar → backfill flow

Creating a webinar (events table → **+ New webinar**) always sets `webinar_status = Scheduled`
(fixed, not a dropdown). On insert, the server `POST`s `{ webinarId, webinar }` to
`N8N_WEBINAR_WEBHOOK_URL`. The n8n workflow **"Webinar Created → Backfill Unregistered (Supabase)"**
(she-sells-n8n, id `544uahWDCgdc3mGo`, webhook path `/webhook/webinar-created-backfill`) then runs a
single Supabase `PATCH` that stamps every `is_registrant = false` row with the new `event_id` and
sets `is_registrant = true` — i.e. binds all currently-unregistered leads to the new webinar.

- The webhook does **not** touch each registrant's own `id`; it writes the FK column `event_id`.
- Verified safe: 0 duplicate emails among unregistered rows, so the `(email, event_id)` unique
  index won't be violated when they all get the same `event_id`.
- The n8n workflow holds the Supabase service-role key in its HTTP headers — it's a backend secret
  there, same pattern as the existing Close workflows on that instance.

## Notes

- **Writes hit live, migration-bound data.** CRUD is real `insert`/`update`/`delete` on
  182k-row tables. The unique `(email, event_id)` index keeps inserts from duplicating.
- To add a new view to the picker, add it to `SOURCES` in `lib/schema.ts` (reads work for any
  `v_*` name automatically; writes stay disabled on views).
- `count: 'exact'` adds slight latency to unfiltered paging on the big table; filtered is fast.
