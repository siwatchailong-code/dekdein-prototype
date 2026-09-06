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
  request (query already scoped `provider_id = auth.uid()`, so two
  freelancers can never see the same request — each match is created
  against one specific provider by `create_match_request`), with the real
  customer name (a second `profiles` read by `customer_id`), a real
  relative-request time, and the real proposed/agreed price.
  รับงาน/ข้าม call `accept_match`/`decline_match`, both button-guarded
  against double-tap and re-querying the queue on failure in case the
  request went stale between load and tap. Declining loads the next
  pending request, if any; nothing is left to show once none remain.
  **No job title/description, service area, distance, schedule time, or
  photos are shown** — `matches` has no columns for any of that and no
  `jobs` table exists (see "Still prototype" below); the card says so
  instead of fabricating them, and points to the chat for those details.
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

The app exposes a dedicated freelancer application screen
(`freelancer-verify`) and gates opening availability on the confirmed
`profiles.identity_verified` flag (`phone_verified` is not checked — no
phone OTP provider is live). The browser only reads `identity_verified`;
it never sets it. That flag is set server-side by
`approve_freelancer_application()` — see Admin below.

## Admin — freelancer application review (`admin-applications`)

An account with `profiles.role = 'admin'` (confirmed real enum label,
confirmed real `is_admin(auth.uid())` function) is routed straight to this
screen after sign-in, and a flag icon on Home (hidden for everyone else)
also opens it. It lists every `pending` row in `public.freelancer_applications`
— RLS already lets an admin see all rows, not just their own — with the
applicant's real name, service area, services, bio, starting price,
portfolio note, and identity-document link. อนุมัติ/ปฏิเสธ call
`approve_freelancer_application(uuid)` / `reject_freelancer_application(uuid,
text)` directly; both RPCs re-check `is_admin()` server-side themselves, so
the client-side role check here is a UX convenience, not the real security
boundary. **No schema change was needed for this screen** — it is built
entirely on PHASE 3's existing table/RLS/RPCs.

⚠️ PHASE 3 (`claude/phase3-freelancer-application.sql`) was verified correct
in an isolated local sandbox only (see
`claude/freelancer-application-form-fix.md`) — whether it has actually been
run against production is still unconfirmed. Until it has, `submit
/approve/reject_freelancer_application` will fail with a real Postgres
"function does not exist" error, which this screen surfaces via toast
rather than pretending to succeed.
