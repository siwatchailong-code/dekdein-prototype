# dekdein.

Vanilla HTML/CSS/JS marketplace app. Auth + user profile are wired to
Supabase; everything else (jobs, matching, chat, ranking, challenges) is
still static prototype data — see the "Still prototype" list at the
bottom.

## Local development

1. `cp env.example.js env.js` and fill in your Supabase project's URL +
   anon key (Supabase dashboard → Project Settings → API).
2. Run `supabase/schema.sql` once against your project (SQL Editor, or
   `psql`/the Supabase CLI).
3. Serve the folder with any static server, e.g. `npx serve .` or
   `python3 -m http.server`, and open `index.html`.

No build step is required for local dev — `env.js` is loaded directly.

## Deploying to Vercel

1. Push this folder to a git repo, import it into Vercel.
2. In Vercel → Project Settings → Environment Variables, set:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
3. Vercel runs `npm run build` (see `vercel.json` / `package.json`),
   which runs `scripts/generate-env.js` to write `env.js` from those
   variables at build time. The real values are never committed to git.

## Database

`supabase/schema.sql` creates:
- `public.profiles` (id, email, full_name, role, avatar_url, created_at,
  updated_at), 1:1 with `auth.users`
- a trigger that auto-creates a `profiles` row right after signup, using
  the `full_name`/`role` passed into `supabase.auth.signUp()`
- Row Level Security: signed-in users can read all profiles (needed to
  browse/match with providers), but can only update their own row.

## Still prototype (not connected to a backend)

Jobs, posting a job, matching, chat messages, ranking, challenges, and
provider job requests all use static in-memory demo data, as they did
before this change. Only account creation, login, session, logout, and
the user's own profile record are real.
