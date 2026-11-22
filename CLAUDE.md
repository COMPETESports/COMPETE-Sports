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
accent). Never reassign; a fifth surface needs a fifth hue. **One exception,
Tom's call on 10 Nov 2026: the US map.** It colours states by Census region
(Northeast teal, Midwest orange, South purple, Pacific lime, Mountain red),
shaded by event count. It holds because the map carries no surface chips and
its legend names the regions. See `map-scale.ts` and `map-regions.ts`; do
not let region hues leak anywhere else.

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
  map-scale.ts      the US map's colours: region hue, shaded by count
  map-regions.ts    Census regions for the map (NOT regions.ts, the rail's 8)
  calendar.ts       .ics files + Google/Apple/Outlook links; league = whole season
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

## Work sessions — start and end

Tom announces when a session starts and when it ends ("I have a 3 hour
window", "time to pause"). **Either announcement triggers a quality
assurance check** — standing instruction, 15 Nov 2026.

**The QA check**, the same at both ends so the two can be compared:
1. **Code** — `git status` (anything uncommitted?), last commits, and
   `tsc` type-check (`node node_modules/typescript/bin/tsc --noEmit`).
2. **Live site — REQUIRED at both start and end, never skipped (Tom,
   21 Nov)** — open https://www.joincompete.com in the browser: the
   homepage map draws with numbers on it, search returns cards, one event
   page opens. Numbers on the map also prove the database is awake.
3. **Carry-overs** — every "Still yours" item from the last session
   report on the build-progress page: done, or still open?
4. Report it as a short ✅ / ⚠️ list. Anything ⚠️ is raised before new work.

**At the start**, after the check — standing rule, Tom, 17 Nov:
1. **Review every dated task** in "Scheduled tasks" at the top of the
   build-progress page. Ask Tom about anything due or past due: done?
2. **Reschedule anything not done by its date** — new date, and an orange
   "moved from …" tag. Tom does not work every day and pivots are normal;
   a stale date on that page is the failure, not a missed task.
3. **Keep the Google Calendar in step.** Every dated task is also an
   all-day event on **tommy@joincompete.com**'s calendar (calendarId
   `tommy@joincompete.com`), written through the Google Calendar connector,
   which is signed in as Tom's personal Gmail and has edit rights to the
   business calendar (shared 17 Nov). Tom sees it in both accounts. NOT the
   "COMPETE" calendar inside the personal account. Moving a date on the page means
   moving the calendar event too; finishing a task means deleting it.
   Titles start "P1 ·", "P2 ·", "P3 ·". All-day, shown as free, no guests,
   no notifications.
4. Read event counts from the live site, not from memory.
5. Then the start-of-session update, and a plan sized to his window.

**At the end**, after the check, in this order:
1. **Show what was built** — a screenshot or short walkthrough of each new
   feature. Tom is a visual learner; a feature he has not seen is not done.
2. **Glossary** — add any new term from the session to the Project doc
   `claude/dictionary.md` (read it first; write the whole doc back).
3. **Progress page** — the build-progress artifact updated in place with
   two reports: this session, and the whole project.
4. **Hand-off note** — update "State, as of" below, so a brand-new
   conversation starts fully briefed.
5. **Commit** — the build check, then the GitHub Desktop summary +
   description.
6. **End-of-day summary on the calendar** (Tom, 19 Nov) — an event on
   tommy@joincompete.com at **10:00 PM Central** that day (30 min, Tom,
   21 Nov — not all-day), titled "End of day · <date> — <theme>",
   free, no notifications: what was done, tomorrow's tasks (Tom's and the
   next session's), and the build-progress link.

## State, as of 21 Nov 2026

**Live at https://www.joincompete.com.** Always use www.joincompete.com/admin
(Vercel one-off deployment URLs are not on the Google key's list). Email via
Resend works; receiving stays off.

**Data:** Migrations 001–027 run (016 deleted on purpose). Tom entered the
Belleville IL events, Missouri Sand Volleyball events and a Stratman event
on 21 Nov. Research doc for adding events: "Adult volleyball events near
St. Louis — winter 2026–27" (Docs artifact E3tEVWPhc6swcWWZuf3zCV) —
~25 confirmed, the rest "check first".

**How Tom runs migrations (settled 21 Nov — do NOT overcomplicate):** open
the .sql file, copy all, paste into the Supabase web SQL editor, Run. No
psql, no Homebrew, nothing local. Terminal is for `cd ~/Desktop/COMPETE-Sports`
then npm/git only. Explain any new term or tool BEFORE giving a command.

**Built 20–21 Nov:**
- Quick fixes (563fd83): date picker confirms, mobile date boxes fit,
  full-width Browse, sign-up tidy, Communities map legend off.
- **Organizer surfaces** stored as "sport:surface" (e.g. volleyball:indoor)
  in organizer_private.surface_slugs; `qualifySurfaces`/`surfaceKey` in
  organizer-fields.ts expand old bare slugs on load. Fixed indoor
  volleyball ticking indoor pickleball.
- **027_format_labels.sql**: `event_discovery.format_labels` = format +
  sub-format from event_brackets ("Coed Quads – Solo Blind Draw"). Event
  page and cards (audienceLine) use it; normalise() falls back to
  format_names. Sleigh, Set, Spike! must have Solo Blind Draw set on its
  bracket to show it — not yet confirmed by Tom.
- **+ New event** on each organizer page → /admin/events/new?organizer=<id>:
  copies their latest event (like Duplicate), else fills from the
  organizer record. Draft, dates blank. Tested OK by Tom (Belleville).
- **Merge any two organizers**: MergeOrganizer shows on every organizer
  page with a search (`findOrganizersToMerge`); the page you're on wins.
- **Organizers list**: clickable headers sort (name, status, confidence,
  events, last, next; second click flips, `dir` param); sort dropdown too.
- **Organizer Type**: datalist of existing types (`organizerCategories`).
- **Map**: shading by count kept but ramps narrowed; borders drawn in the
  page background (fixes missing MO/KS line). Midwest now Benjamin Moore
  Wenge #3C2D2B → Hearthstone Brown #604D44 → #7d6656 → #9b7d6c (Tom tried
  orange, then calamansi yellow — rejected). Watch whether Wenge is too
  dark on the dark map. Homepage title centered.
- Eggnog background: ON HOLD (Tom didn't like it).
- Tests: 56 unit tests pass (run in VM with a separate tsx in /tmp;
  project node_modules are macOS binaries).

**Decided earlier (see specs):** tournament rules and profile decisions in
`claude/tournament-engine-spec.md` and `claude/sports-and-player-profile-spec.md`.

**Business (Tom's), all still open and due — review at session start:**
SS-4 fax (ref 101), choose lawyer (Pete, Polsinelli), rotate DB password,
calls to Flannagan's and Players Sport & Social, terms & privacy, venue
pins, remaining 2027 events; operating agreement Mon 23.

**Next, in order — start here:**
0. **SECURITY & DATA PROTECTION REVIEW — highest priority (Tom, 19 Nov),
   still not started.** Sign-up/sign-in abuse (Turnstile), admin auth
   (single shared ADMIN_PASSWORD?), secrets and the unrotated DB password,
   Supabase RLS and exposed keys, per-instance-memory rate limits, email
   abuse, personal data and who sees it, logging/alerts, backups. Ranked
   list, fix the top items that session.
1. **Public volleyball event submission form** for outside users, with a
   review queue (after security; Tom's friends will add events).
2. **Explain Cloudflare Turnstile** (Tom asked).
3. **Player profile round two** — three pages, migration **028** (027 was
   used for format labels).
4. Tournament engine pieces 4–7 while Tom works.
5. Organizer pages → `VenueSearch` (15 min).

Dated tasks: build-progress artifact (top) and tommy@joincompete.com's calendar.
