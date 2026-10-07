# COMPETE — working notes for Claude

Read this first. It is the project's memory: what COMPETE is, what has
already been decided, and the conventions that keep the codebase coherent.
If something here conflicts with an instinct, this file wins — most of these
lines exist because the obvious thing was tried and was wrong.

Owner: Tom Heimrich. He addresses Claude as **Randy**.

---

## What this is

An **event discovery platform for adult recreational sports in the United
States**, launching with volleyball and pickleball. Players find tournaments,
leagues and open play in one place instead of across a dozen Facebook groups.
Organizers get their events in front of players.

**COMPETE does not process registrations or payments.** Decided 2 Oct 2026.
It is a discovery layer that links out to whatever the organizer already
uses. The long-term vision (registration, payments, bracket generation, live
scoring) is real but explicitly later, and nothing is being built toward it
beyond keeping `registration_url` on the bracket so an internal record could
attach there one day without a migration.

**Players are the product; organizers are the customer.** Revenue comes from
the supply side — $10/$15/$20 annual for local/regional/national — and
**nothing is charged at launch**. Any feature that charges players is wrong:
the survey showed willingness to pay is flat across usage, and someone who
cannot spare $5 is exactly the person who most needs to find a cheap local
event.

---

## Stack

- **Next.js 15** (App Router, RSC, Server Actions), TypeScript, Tailwind v3
- **PostgreSQL** on Supabase, queried with **`postgres.js`** — no Supabase
  SDK anywhere. The app talks to a plain connection string, so moving to any
  other Postgres host is a connection-string change. Keep it that way.
- **Vercel** for hosting
- **scrypt** password hashing, server-side sessions (opaque token in cookie,
  SHA-256 stored, revocable)
- Geocoding from a **bundled US postal table** (`zipcodes` npm). No Mapbox,
  no key, no bill — deliberately removed 2 Oct.
- Playwright e2e + `node --test` units. **38 e2e + 13 unit, all passing.**

### Commands
```bash
npm run dev            # local server
npm run build          # production build
npm test               # units then e2e (e2e needs a server running)
npm run data:prepare && npm run db:seed          # core seed
npm run data:history  && npm run db:seed:history # 2022-24 archive
```

---

## Taxonomy — Tom's vocabulary, do not "correct" it

| Axis | Values |
|---|---|
| **Surface** | Beach · Grass · Turf · Indoor |
| **Format** | Doubles · Triples · Quads · Sixes · Blind Draw |
| **Gender** | Men's · Women's · Co-ed · Reverse Co-ed |
| **Division** | Open · AAA · AA · A · BBB · BB · B · Masters (55+) |

**"Division" means the competitive skill tier.** Gender is a separate axis.
An earlier pass renamed the UI to "Skill level" on the reasoning that
volleyball players say "division" for the gender bracket. They do not. It was
reverted. Do not do it again.

Each division carries a plain-English `descriptor` in the database — Open
(Semi Pro), AAA (High Competitive), AA (Competitive), A (Low Competitive),
BBB (Advanced Recreational), BB (Recreational), B (Low Recreational). These
are data, not UI decoration: "BB" means nothing to a newcomer, and a player
who cannot place themselves does not enter.

Other settled points:
- **Reverse Co-ed is its own gender value**, not a flavour of coed. The
  format inverts which positions each gender may play, so showing it to
  someone who filtered for Co-ed is a wrong answer.
- **Blind Draw is a Format** (a registration style — you enter alone and are
  assigned a partner), for both sports.
- **Fives does not exist.** Not in Tom's list, zero of 398 imported events.
- **Masters stays on the division axis**, even though age is not skill. It is
  the axis organizers print it on.
- **C and Recreational are retired but not deleted** — real Phase 1 events
  used them. `divisions.is_active = false` hides them; the data survives.

---

## Decisions that are closed

Written up fully in the claude.ai Project (`claude/decisions-locked.md`).
Short version — do not rebuild these without Tom reopening them:

- **Ratings and reviews: cut.** Cold start, moderation liability, and
  publishing 2-star reviews of the customer you are invoicing. Use signals
  that cannot be gamed: "47 players saved this", "running since 2018".
- **Player rankings: cut.** Inventing a national ranking from an empty
  database is worse than having none.
- **Player "Upgrade to Premium": cut.** Contradicts the business model.
- **Date of birth: never collected.** Age brackets only.
- **Emergency contact: not collected.** Only makes sense if we took
  registrations.
- **Direct-message inbox: not built.** `mailto:` does the 90% version.
- **"What's filling up" capacity: approved, with a constraint.** COMPETE
  cannot measure it, so it is organizer-reported and the UI must say so. A
  database check rejects a count with no `capacity_updated_at`.

---

## Conventions that matter

**Honest data, always.** This is the strongest principle in the codebase.
- Never invent a value the source does not state. 136 imported events have no
  skill tier because the 2022 sheet has no such column — `division_id` is
  nullable and null means "the source does not say".
- `event_brackets.confirmed = false` marks every bracket derived by cross
  product rather than stated by an organizer. All 2,574 are currently false,
  because the source sheets list Sex, Format and Division(s) as independent
  comma lists and genuinely never record which combinations ran. **Confirmed
  brackets can only come from organizer submission.**
- Where a control fires, record what it did, at the time it did it — do not
  infer it later from state.

**Colour is semantic.** Each playing surface owns a neon hue everywhere it
appears: beach orange, grass green, indoor blue, turf purple (also the
accent). Never reassign; a fifth surface needs a fifth hue. The map ramp uses
violet precisely because the three primaries are spoken for.

**Measure contrast, do not eyeball it.** Every pairing in `globals.css` has a
recorded ratio. Three failed a first draft at ~4.4 and were adjusted. There
is a short WCAG luminance script; re-run it before changing any colour.

**Neon decorates, off-white carries body text.** A neon may be a heading, a
number, a chip, a border or a glow. Never a paragraph.

**Fonts are self-hosted** via Fontsource (Titan One, Fredoka, Nunito), not
pulled from Google at runtime. Google Fonts is unreachable from the build
environment, so an `@import` fell back to system faces *silently* — every
design screenshot before 2 Oct was showing fallbacks. A self-hosted font
cannot fail quietly.

**Comments explain why, not what.** Especially where the obvious approach was
tried and rejected.

---

## Compliance — treat as load-bearing

Tom has stated that legal compliance around minors is of the utmost
importance. The age gate is self-reported, so the obligation is visibility
and evidence, not prevention.

- Database constraints: a minor's profile **cannot** hold a phone number, and
  no phone means no alerts. `saveProfile` revokes every live SMS consent when
  a number leaves.
- `age_bracket_changes` is **append-only and enforced** — a trigger refuses
  deletes and refuses any edit except writing the delivery receipt.
- **The direction that matters is under-18 → adult**, not the reverse. Going
  *to* under-18 engages protections automatically. Going *from* it is what a
  minor would do to unlock texting.
- `/admin/compliance` is the review queue, and includes a standing check that
  no under-18 profile holds contact data. It must always read zero.
- Alerts need `RESEND_API_KEY`. Without it they log and are marked **"not
  sent"** — deliberately visible rather than silently failing.

TCPA consent evidence lives in `sms_consents` (append-only, versioned
disclosure text). COPPA is avoided by a 13+ account floor. `LEGAL_ENTITY`
and `GOVERNING_STATE` in `src/lib/legal.ts` were confirmed 6 Oct — COMPETE
SPORTS LLC, Missouri. **Neither `/privacy` nor `/terms` has been reviewed by
a lawyer**, and that is still outstanding.

---

## Where things are

```
src/app/            routes (App Router)
  admin/compliance/ the age-gate review queue
src/lib/
  queries.ts        discovery search, facets, bracket-aware filtering
  accounts.ts       sessions, registration, profiles, consent
  compliance.ts     age-bracket audit + operator alerts
  map-scale.ts      the Communities map colour ramp
  legal.ts          entity, governing state, contact address
supabase/           001 → 005, run in order
scripts/            seed + the 2022-24 import pipeline
tests/              *.spec.ts = Playwright, *.test.ts = node:test
DEPLOY.md           step-by-step deployment
```

The claude.ai Project holds the long-form docs: `decisions-locked.md`,
`design-system.md`, `wireframe-review.md`, `history-merge.md`,
`survey-findings.md`, `partner-crm-concept.md`, and the two build-status
files.

---

## Gotchas that have already cost time

- **Stale `next start` server.** Repeatedly looked like a code bug. Always
  rebuild *and* restart; `pkill -f next-server`, not `next start`.
- **Transaction pooler, port 6543.** Not 5432. The driver is configured for
  it (`prepare: false`) and they are not interchangeable.
- **`postgres.js` returns `date` as a Date on some load paths**, so
  `Date >= '2026-10-02'` silently evaluates false. Normalise at the query
  edge — see `asDateStrings()` in `my-events.ts`.
- **Supabase free tier pauses after one week of inactivity.** Looks like an
  outage; it is a Restore click.
- **Server Actions must be async** — exporting a non-async helper from a
  `'use server'` file breaks the build.
- **Tests:** chips uppercase via CSS; Next's route announcer also has
  `role=alert`; visually-hidden inputs need `check({force:true})`. Never
  assert on an element that was already on screen before the action — a
  profile-save test raced for exactly that reason.

---

## State, as of 5 Oct 2026

**Built and tested:** Phase 1 discovery, Phase 2 accounts/profiles, the
2022-24 historical import (398 events, 295 organizations, 138 venues), the
bracket model, the age-gate audit, and the neon redesign.

**Deploying now.** Supabase project → migrations 001-005 → seed locally →
GitHub → Vercel (`.vercel.app` first, domain second).

**Next after deploy:** the partner CRM. Its first job is **contact
enrichment, not pipeline management** — 258 of 295 organizations have no
contact route at all, which is the real bottleneck. Google Places lookup on
organization name + city should recover a meaningful share. Needs
`NEXT_PUBLIC_GOOGLE_MAPS_KEY`.

**Then:** organization pages + Follow (the organizer's reason to care, and
the cold-call opener), free-text search, venue amenities, list/map toggle,
and organizer self-serve submission with its division → format → skill
cascade — which is the only way confirmed brackets ever arrive.
