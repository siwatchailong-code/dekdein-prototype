# dekdein.

Vanilla HTML/CSS/JS marketplace app. Auth + user profile, and the real
matching/chat workflow (public.matches + public.chat_messages and their
RPCs) are wired to Supabase; ranking, challenges, and posting a job are
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

Customer and freelancer use separate sign-up choices. A customer account is created for hiring; a freelancer account is created with `role='rider'` and must pass the verification gate before it can open availability. The selected `role` is sent at signup (`customer` or `rider`) because the confirmed production role enum uses those labels. Freelancer availability is opened only after `phone_verified` and `identity_verified` are both true; the browser never writes either flag. `disable_freelancer()` is used to stop receiving new requests.

## Matching & chat (real)

Backed by the confirmed `matches` / `chat_messages` schema and RPCs
(`create_match_request`, `accept_match`, `decline_match`,
`propose_match_price`, `respond_price_proposal`, plus `enable_availability`
/ `disable_freelancer`):

- **Match screen** lists real available, verified freelancers (`profiles`
  where `is_freelancer=true, availability_status='available',
  identity_verified=true`) when signed in; tapping "แมตช์" calls
  `create_match_request`.
- **Provider-request** shows the provider's oldest pending incoming
  request; รับงาน/ข้าม call `accept_match`/`decline_match`.
  **My Jobs** lists the signed-in person's real matches (either side).
- **Chat** is real (`chat_messages`, live via Supabase Realtime `postgres_changes`)
  once opened from a real match. Plain messages insert directly
  (`kind:'text'`, `sender_role` derived as `'customer'`/`'rider'` from
  which side of the match the signed-in user is on — never `'provider'`).
  The ฿ button calls `propose_match_price`; a price-proposal bubble's
  รับราคา/ปฏิเสธ buttons call `respond_price_proposal`.
- **Location** uses Leaflet + OpenStreetMap tiles (search/reverse-geocode
  via the free Nominatim API) — no API key required, only network access
  to `unpkg.com`, `tile.openstreetmap.org`, and `nominatim.openstreetmap.org`.
  Selected location is on-screen draft state only (no `jobs` table exists
  in the confirmed schema to persist it to).

`complete_match` and `cancel_match` exist in production but have no UI
trigger yet.

## Still prototype (not connected to a backend)

Posting a job (no `jobs` table exists — see above), ranking, and
challenges use static in-memory demo data.


## Current verification gate

The app now exposes a dedicated freelancer verification screen and gates opening
availability on the confirmed `profiles.phone_verified` and
`profiles.identity_verified` flags. The browser only reads these flags; it does
not mark a person verified. The server-side phone/identity document submission
and approval workflow is not invented in this repo because its production RPC,
RLS and Storage schema have not been exported/confirmed yet.
