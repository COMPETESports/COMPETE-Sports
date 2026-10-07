# COMPETE — Discovery and accounts

Tournament discovery for adult recreational sports in the United States.
Volleyball first, built multi-sport from the first migration.

To put it online, follow **[DEPLOY.md](./DEPLOY.md)**.
For what each phase covers and the decisions behind it, see
**[docs/phase-1-requirements.md](./docs/phase-1-requirements.md)** and
**[docs/phase-2-accounts.md](./docs/phase-2-accounts.md)**.

---

## What is here

| Area | Where |
|---|---|
| Homepage — featured, local, map | `src/app/page.tsx` |
| Filtered browse | `src/app/events/page.tsx` |
| Tournament detail, map link, Add to Calendar | `src/app/events/[slug]/` |
| Staff tournament entry | `src/app/admin/` |
| Paste-and-parse listing reader | `src/lib/parse-listing.ts` |
| Communities pages | `src/app/communities/` |
| US state map | `src/components/StateMap.tsx`, `src/lib/us-states.ts` |
| Zoomed state map | `src/components/StateDetailMap.tsx`, `src/lib/cluster.ts` |
| Sign up / sign in | `src/app/join/`, `src/app/signin/`, `src/lib/accounts.ts` |
| Google sign-in | `src/lib/google-oauth.ts`, `src/app/api/auth/google/` |
| Player and organizer profiles | `src/app/account/` |
| Saved / upcoming / history lists | `src/lib/my-events.ts` |
| TCPA consent wording and record | `src/lib/sms-consent.ts` |
| Privacy policy and terms | `src/app/privacy/`, `src/app/terms/`, `src/lib/legal.ts` |
| Database schema | `supabase/001_schema.sql`, then `002`, then `003` |
| Airtable import | `scripts/prepare-seed.ts`, `scripts/seed.ts` |
| End-to-end tests | `tests/smoke.spec.ts`, `tests/accounts.spec.ts` |
| Parser unit tests | `tests/parse-listing.test.ts` |
| Health probe for uptime monitoring | `src/app/health/route.ts` |

## Stack

- **Next.js 15** (App Router), TypeScript, Tailwind CSS
- **PostgreSQL** via Supabase, queried with `postgres.js`
- **Vercel** for hosting, CI/CD and preview (staging) deployments
- **Mapbox** for geocoding, behind a bundled US postal-code table

Pages render on the server and read the database directly. There is no
client-side API layer and no state library, because discovery is a read of
one table with filters.

## Commands

```bash
npm run dev                                   # local development
npm run build                                 # production build
npm run typecheck                             # TypeScript, no emit
npm run data:prepare -- data/<export>.csv     # Airtable CSV -> seed JSON
npm run db:seed                               # load seed JSON into Postgres
npx playwright test                           # end-to-end tests
npx tsx --test tests/parse-listing.test.ts    # parser unit tests
npx tsx scripts/build-map.ts                  # regenerate state map geometry
```

Tests run against a running site; start it first, or point `BASE_URL` at a
deployed one. **Restart the server after `npm run build`** — `next start`
keeps serving the build it started with, and a stale server looks exactly
like a bug in whatever you just changed.

## Environment

See `.env.example`. `DATABASE_URL`, `ADMIN_PASSWORD` and `SESSION_SECRET`
are required. `MAPBOX_TOKEN` is optional — without it, location search still
answers ZIP codes and `City, ST` from the bundled postal table and only
loses free-form address lookups.

## Design decisions worth knowing

**Multi-sport from day one.** `sports` is a table, and surfaces, formats and
divisions each belong to a sport. Adding pickleball is inserting rows, not
changing the schema. Volleyball is active; pickleball is seeded but switched
off until it has listings.

**Adult events, enforced. Accounts are a separate question.** There are no
age groups in the event model, and the `events` table carries a `CHECK`
constraint pinning `adult_only` to true, so youth play cannot be listed by
accident. Accounts are open to anyone 13 or over, because a 16-year-old who
plays in open tournaments is a real user — whether a given organizer will
take them is the organizer's call, and the site says so. No date of birth is
stored anywhere, only a self-declared age bracket.

**A minor cannot be texted.** `athlete_profiles` refuses to hold a phone
number on a profile in the `under_18` bracket, and refuses to enable alerts
without a number. Both are `CHECK` constraints, because this is exactly the
kind of rule that rots if it lives in a comment.

**SMS consent is evidence, not a setting.** `sms_consents` is append-only
and stores the exact disclosure text, its version, the timestamp and the IP
for every grant and every revocation. TCPA consent cannot be added
retroactively, so a number collected without this record is a number that
can never be marketed to.

**Surfaces, formats and divisions are many-to-many.** One tournament runs
several at once. Mother Lode, in the launch data, is beach *and* grass.

**Radius search without PostGIS.** A bounding box narrows on the
`(latitude, longitude)` index, then `miles_between()` does the real
great-circle distance. On the launch dataset a 50-mile search plans and runs
in under 2 ms.

**Geocoding is local first.** ZIP codes and `City, ST` resolve from a
bundled table, instantly and free. Mapbox is the fallback, so the bill stays
near zero and an outage there degrades one input rather than the site.

**Filters are a GET form.** Results are a shareable, bookmarkable URL, they
work without JavaScript, and search engines can crawl them. JavaScript only
upgrades it to submit on change.

**Facet counts come from the date and location scope**, not from the fully
filtered set — so the number beside a checkbox tells you what ticking it
would give you, instead of collapsing to zero as you narrow.

**Paste-and-parse is deterministic, not AI.** Tournament posts follow
tight conventions and the vocabulary is closed, so pattern matching fits the
problem: no API key, no per-parse cost, no network call, and the same text
always gives the same answer. It fills the form and reports what it could
not find; a person always reviews before saving. Where a guess would be
shaky — a bare `$500` that might be a payout, a lone `A` that might be an
article, a chatty paragraph with no title line — it fills nothing.

**The map ships no mapping library.** State outlines are generated once
from the US Census boundaries and committed as plain SVG path data — around
40 KB gzipped, served with the page. No tile service, no API key, no
per-view cost, nothing to go down. Every state with data is a real link, so
the map works without JavaScript and is keyboard navigable.

**The loudness is pattern, not photography.** The visual reference is an
80s SoCal beach brand, where the colour normally comes from product photos.
COMPETE has none — every flyer in the source data was a dead link — so sun
rays, jams stripes and scalloped edges are drawn in CSS instead. They cost
nothing to serve and never 404.

**Bright colours decorate; darker siblings carry text.** `--surf` and
`--coral` are for fills and patterns. `--surf-ink` and `--coral-ink` are
what text and buttons use, because the bright steps measure below 3:1 on
sand. Every pairing in `globals.css` was measured rather than eyeballed.

**Featuring is editorial, topped up automatically.** Staff-flagged events
lead the homepage in the order staff set; when there are fewer flags than
slots the rest is filled by rule. Filled slots are labelled differently so
an automatic pick is never passed off as a staff pick.

**Dates are handled in UTC throughout.** A tournament is a calendar date,
not a moment in time; reading it with local getters would shift events a day
backwards for anyone west of Greenwich.
