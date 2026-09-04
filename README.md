# dekdein.

Vanilla HTML/CSS/JS marketplace app. Auth + user profile are wired to
Supabase; everything else (jobs, matching, chat, ranking, challenges) is
still static prototype data — see the "Still prototype" list at the
bottom.

## Local development

1. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in your shell, then run
   `npm run build` — this writes `public/env.js` (see `build.js`).
2. `schema.sql` is documentation only now — it contains no SQL to run. It
   explains how production's real schema differs from this repo's original
   prototype schema. `legacy-schema.sql` holds that original executable SQL
   for historical reference, but it is marked **do not run against current
   production** for the same reason. See both files' headers for details.
3. Serve `public/` with any static server, e.g. `npx serve public` or
   `python3 -m http.server --directory public`, and open `index.html`.

## Deploying to Vercel

1. Push this folder to a git repo, import it into Vercel.
2. In Vercel → Project Settings → Environment Variables, set:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
3. Vercel runs `npm run build` (see `vercel.json` / `package.json`),
   which runs `build.js` to assemble `public/` and write `public/env.js`
   from those variables at build time. The real values are never
   committed to git.

## Database

`schema.sql` is documentation only (no executable SQL) — see its header for
the confirmed real differences between production and this repo's original
prototype schema: production's name column is `name` (not `full_name`), and
production has `is_customer`, `is_freelancer`, `availability_status`,
`phone_verified`, `identity_verified`, plus the `enable_freelancer()` /
`disable_freelancer()` / `enable_availability()` functions.

`legacy-schema.sql` holds the *original* executable table/trigger/RLS SQL
this repo started with, kept for historical reference only — it is marked
**do not run against current production**, since it declares a `full_name`
column and a `handle_new_user()` version that no longer match what's live.

Neither file should be used to (re)create or alter the production schema.
A trustworthy schema/migration file can only be written from an actual
export of the live database (see `schema.sql`'s header for how).

## Account model

One account can hold both capabilities at once — there is no separate
sign-up-as-provider flow. Every new account starts with customer
capability only; tapping "เปิดโหมดผู้ให้บริการ" from Home calls
`enable_availability()` to add freelancer capability to that same account,
and exiting provider mode calls `disable_freelancer()` to pause it (the
account keeps both capabilities — this only pauses receiving job
requests). The legacy `role` column is still written on signup
(`role: 'customer'`) for backward compatibility with anything that still
reads it, but no longer drives the UI.

## Still prototype (not connected to a backend)

Jobs, posting a job, matching, chat messages, ranking, challenges, and
provider job requests all use static in-memory demo data. Only account
creation, login, session, logout, the user's own profile record, and the
customer/freelancer capability toggle are real.
