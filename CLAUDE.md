# COMPETE — working notes for Claude

Read this first. It is the project's memory: what COMPETE is, how Tom
works, what has already been decided, and the conventions that keep the
codebase coherent.
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
| **Format** | Doubles (2v2) · Triples or Trips (3v3) · Quads (4v4) · Sixes (6v6) · Blind Draw |
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
  organizers-admin.ts  the organizer list, profile, merge, contacts, venues
  organizer-fields.ts  types + constants for the above ('use server' split)
  venues-admin.ts      venue list, merge, profile, delete
  read-flyer.ts        the vision model that reads an event flyer
  crm.ts               RETIRED 9 Nov — reads work, all writes refuse
supabase/           001 → 022, run in order. 016 is DELETED, not missing —
                    020 superseded it; the gap in the numbering is deliberate.
scripts/            seed + the 2022-24 import pipeline
tests/              *.spec.ts = Playwright, *.test.ts = node:test
DEPLOY.md           step-by-step deployment
```

**The long-form docs are NOT files on disk.** They live in the claude.ai
Project knowledge base and are read with the Projects tool
(`project_read`), never with Read/Glob/Grep. A path like
`claude/work-split.md` is a Project doc path, not a filesystem path —
looking for it on disk finds nothing. A session not attached to the
COMPETE SPORTS Project cannot see them at all, and should ask rather
than guess.

The ones worth reading, and only when a task needs them:
`work-split.md` (everything outstanding, this week by day),
`running-locally.md` (migrations and the dev server),
`decisions-locked.md`, `design-system.md`, `dictionary.md`.

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

## How Tom works

- **Visual and kinesthetic learner.** Show him rather than describe.
- **Any SQL or Terminal command** gets one sentence on what it does, then
  the full how-to — which file, how to open it, where to paste it. Never
  assume he knows a step. He has asked for this more than once.
- He commits and pushes through **GitHub Desktop**. Claude's shell has no
  git identity and cannot commit for him — hand him a summary line and a
  description instead. Commit frequently; that is his standing rule.
- **Progress update at the start and end of every session**, in the
  build-progress page format.
- Disagree *before* building, not after.
- **Never run `npm install`** from Claude's Linux shell — it would replace
  his macOS binaries. `tsc` runs fine; `npm run build` and the tests can
  only run on his Mac.
- **Migrations:** Claude writes the numbered `.sql`; Tom pastes it into the
  Supabase SQL Editor himself. Claude never runs one.

---

## State, as of 10 Nov 2026

**Live.** Deployed on Vercel, database on Supabase (East US). 568 events,
4 of them in 2027. 1,581 organizations. 172 venues, 12 on an exact pin.
hello@joincompete.com sends with SPF, DKIM and DMARC passing.

**9 Nov — the organizer merge, the big one.** `partner_prospects` (1,310
researched) and `organizers` (271 with events) became one table of 1,581.
Everything private — phone, notes, pipeline, research provenance — moved
to `organizer_private`, which has **no public read policy**. `organizers`
stays publicly readable and holds only public identity: name, slug, city,
state, website. `organizer_contacts` holds several named people per
organization.

**`partner_prospects` is FROZEN.** The `/admin/crm` screens are retired:
removed from the nav, bannered, and all five write actions refuse. Reads
still work so nothing is lost before the replacement has been used.

**Migrations 001–022 are run.** 016 is absent on purpose: it was written
on 3 Nov, never run, and 020 creates everything it would have added in
the right place. It was deleted on 10 Nov rather than left lying around
being mistaken for pending work. Git still has it; 020's header explains
what it was for.

**Also recent:** the flyer vision reader, Google Places venue lookup and
exact pins, multi-sport and surfaces per organizer (022), a 0–5
confidence scale separate from pipeline stage (021), creating a venue
from Google and linking it in one step, and deleting a venue that holds
no events.

**Next, and it is the priority:** *leagues visible to players.*
Submission has worked since 31 Oct; a player still cannot see a league in
search. That is the whole gap between COMPETE being a very good CRM and
being a product. After that: the public organizer page, and the 13
confirmed 2027 events that are still unentered.
