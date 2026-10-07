# Phase 1 — Discovery: requirements as built

The SOW requires the Phase 1 data model, filter list, geocoding provider and
performance targets to be agreed in writing before the phase can be
accepted. This document records what was built so it can be approved or
corrected. Anything added after approval is a change order.

Built against the SOW dated 09.2026 and the Airtable export
`Compete Sports Database-Primary Database.csv` (156 rows).

---

## 1. Scope decisions taken

| Decision | What was built | Why it matters |
|---|---|---|
| Multi-sport model | Sport is a table; surfaces, formats, divisions belong to a sport | Adding pickleball later is data entry, not a change order |
| Adult recreational only | No age groups anywhere; database constraint pins `adult_only` to true | Youth play cannot be added by accident |
| Launch sport | Volleyball active, pickleball seeded but inactive | Proves the model without an empty second sport on the site |
| Geocoding provider | Bundled US postal table first, **Mapbox** as fallback | Near-zero cost; Mapbox outage degrades one input, not the site |
| Registration | Always links out to the organizer | Phase 1 excludes registration and payments |

---

## 2. Tournament data model

One row per tournament in `events`, with venue, organizer, surfaces,
formats and divisions as related records.

### Event fields

| Field | Type | Required | Public | Notes |
|---|---|---|---|---|
| `name` | text | yes | yes | |
| `slug` | text | auto | yes (URL) | from name + city + date |
| `sport_id` | ref | yes | yes | volleyball at launch |
| `starts_on` | date | yes | yes | |
| `ends_on` | date | no | yes | multi-day events |
| `registration_deadline` | date | no | yes | |
| `entry_fee_cents` | integer | no | yes | stored in cents, never floats |
| `fee_basis` | enum | yes | yes | `per_player` \| `per_team` |
| `payout_text` | text | no | yes | free text; "N/A" is treated as empty |
| `event_page_url` | url | no | yes | where registration happens |
| `flyer_url` | url | no | not shown yet | see §7 |
| `notes` | text | no | yes | organizer's own words |
| `event_type` | enum | yes | yes | `tournament` \| `league` |
| `status` | enum | yes | — | `draft` \| `approved` \| `cancelled` \| `archived` |
| `adult_only` | boolean | yes | stated on page | constrained to true |
| `source` | enum | yes | — | `admin` \| `import` \| `host` |

**Only `approved` events are visible publicly.** Everything else is
invisible to the public site and to search engines.

### Venue fields

`name`, `address_line`, `city`, `state` (2-letter), `postal_code`,
`latitude`, `longitude`, `geo_precision`, `geocoded_at`.

`geo_precision` records how coordinates were obtained — `exact` (geocoding
provider), `postal` (ZIP centre), `city` (city centre), `unknown`. A venue
known only to city level says so on its page rather than implying accuracy
it does not have.

### Organizer fields

`name`, `slug`, `contact_email`, `website_url`. Deduplicated by name on
import, so one organizer's events group together from the start.

---

## 3. Discovery filters — the closed list

Per the SOW this list is closed. Adding to it requires a change order.

| Filter | Control | Behaviour |
|---|---|---|
| **Location** | text: ZIP or `City, ST` | resolved to coordinates |
| **Radius** | 10 / 25 / 50 / 100 / 250 miles | default 50 |
| **Date from** | date | defaults to today |
| **Date until** | date | optional |
| **Surface** | multi-select | Beach, Grass, Turf, Indoor |
| **Format** | multi-select | 17 volleyball formats |
| **Gender** | multi-select | Men's, Women's, Coed, Open/Mixed |
| **Division** | multi-select | Open, AAA, AA, A, BB, B, C, Recreational, Masters |
| **State** | set by the Communities map | two-letter code; see §6a |
| **Sort** | Date / Distance / Price | Distance needs a location |

Multiple values within one filter are OR'd; different filters are AND'd.
This matches how players think: *"beach or grass, but it has to be BB."*

Gender is derived from the format rather than entered separately, so the two
can never disagree.

---

## 4. Search behaviour

- Location resolves ZIP codes and `City, ST` from a bundled US postal table.
  Anything else goes to Mapbox. Common abbreviations are expanded, so
  "St. Louis" works.
- A location that cannot be resolved is **reported on the page**, and
  results fall back to nationwide — never silently ignored.
- Radius filtering uses a bounding box on the coordinate index, then a true
  great-circle distance.
- Venues without coordinates never appear in a radius search. Admin flags
  these so they can be fixed.
- Past events drop off automatically at midnight UTC.
- Facet counts reflect the current date and location scope, not the fully
  filtered set, so a count shows what ticking that box would give you.

---

## 5. Tournament detail page

Shows: name, date range, venue and address, surfaces, formats, divisions,
who it is for, entry fee and basis, registration deadline, payout, organizer
name and email, organizer notes, and a statement that it is an adult
recreational event.

Three actions: **Register** (out to the organizer), **Add to Calendar**
(iCalendar download, all-day entry — the source data records dates, not
reliable start times), and **Open in maps**.

Each page carries `SportsEvent` structured data so search engines can show
it as an event, and is listed in `sitemap.xml`.

---

## 6. Admin tournament entry (temporary, per SOW)

A single shared staff password, a signed HTTP-only session cookie, no user
table. Deliberately small, because Host accounts in Phase 2/3 replace it.

Staff can list and search tournaments, filter by status, create and edit
them, and change status inline. Saving a venue without coordinates geocodes
it automatically. Required fields are validated server-side; at least one
format and one division are enforced.

**Paste-and-parse entry.** A staff member can paste the raw text of a
Facebook post, flyer or organizer email and have the recognisable fields
filled in for review: name, dates, registration deadline, entry fee and
basis, payout, surface, formats, divisions, venue, address, city, state,
ZIP, registration link, organizer email and schedule notes. Auto-filled
fields are marked in the form and the marking clears when edited. Nothing
saves without a person pressing save.

This is data entry assistance, not an import pipeline: the text is supplied
by a person, parsing is deterministic pattern matching with no third-party
service, and nothing is fetched from any website. Automated scraping, feeds
and recurring imports remain excluded from this phase.

`/admin` is excluded from search engines and from the sitemap.

---

## 6a. Communities and the state map — ADDED AFTER THE ORIGINAL SCOPE

**This is change-order territory and is flagged so it can be priced.** SOW
§16 makes "new filters, sort modes... advanced map/geospatial behavior" an
automatic change-order trigger, and the Phase 1 filter list in §3 was
closed. This was built at Client request on 22 September 2026.

**What was built**

- `/communities` — a landing page listing every sport on the platform.
  Volleyball is live; pickleball is present and clearly marked "coming
  soon" rather than hidden, with a prompt for organizers to list the first
  events. A third card invites requests for sports not yet covered.
- `/communities/<sport>` — an interactive US map of all 50 states plus DC,
  shaded by how many events are still to come in each, alongside a ranked
  list of states.
- A **state filter** on discovery, reached by selecting a state. It behaves
  like every other filter: shareable URL, removable pill, survives ticking
  other filters, and narrows the facet counts.

**How the map is built**

State outlines come from the US Census cartographic boundaries, projected
with Albers USA so Alaska and Hawaii sit as insets, and baked into the repo
as plain SVG path data at authoring time. The browser therefore loads no
mapping library and makes no request to any mapping service: about 40 KB
gzipped, served with the page. There is no per-view cost and nothing to go
down.

**How the shading is decided**

Event count is a magnitude, so the map uses a sequential encoding — one
hue, stepped by lightness, anchored for a dark surface. The steps were
checked with a palette validator against the panel surface: monotone
lightness, adjacent gaps above the 0.06 floor, a 2.86:1 low end, and a hue
spread of 1°.

Buckets: 1–2, 3–5, 6–10, 11 or more.

**Two kinds of "no events" are shown differently.** A state that has never
listed anything is left empty. A state that has hosted events but has
nothing on the calendar is drawn in indigo — a different hue, not a dimmer
teal, because "the season ended here" is a different answer from "almost no
events here". Measured separation between the dormant colour and the lowest
teal step is ΔE 17.5 for normal vision and 15.9 under simulated deuteranopia,
both above the required floors.

**Honest limitation.** A choropleth encodes by area, so a big empty state
looks more important than a small busy one. That is why the ranked state
list sits permanently beside the map rather than behind a toggle — it is
the accurate half of the pair, and it doubles as the accessible table view.

**Accessibility.** Every state with data is a real link with a spoken label
("Ohio — 8 upcoming events"), so the map works without JavaScript, is
crawlable, and is fully keyboard navigable. JavaScript only adds the hover
card and the highlight shared between map and list.

**Zoomed state view** (`/communities/<sport>/<state>`). Selecting a state
magnifies it and places a pin at each venue with upcoming events. The frame
is computed from the state's own bounding box, so no state needs manual
tuning and a state works the day it gains its first event. Venue
coordinates are projected on the server through the same Albers USA
projection the outlines were generated with, so a pin lands where the venue
is; `d3-geo` never reaches the browser.

Pin area tracks event count. Venues closer together than about 3% of the
frame are grouped into one pin — Chicago's lakefront venues sit within a
few miles and, drawn separately, the one underneath cannot be hovered or
clicked at all. A pin placed from a postal centroid rather than a street
address is drawn dashed and says "position approximate" rather than
implying precision the data does not have. Neighbouring states are drawn
dimmed behind for orientation, and every venue is reachable from the list
beside the map.

---

## 7. Findings from the launch data

Raised because they affect launch, not because the software is blocked.

**a. Most of the dataset has already happened.** Of 118 approved events,
**23 are still in the future** as of 22 September 2026. The export covers
the 2026 season, which is nearly over. The site works; it will look thin
until the 2027 season is loaded. This is the single biggest thing standing
between the current build and a launch worth promoting.

**b. 38 rows have a blank Status.** They import as `draft` and stay off the
public site until someone approves them. Review them in admin.

**c. 31 rows have a ZIP column that disagrees with the ZIP in the address.**
Chicago events in particular carry a ZIP from a different neighbourhood. The
import trusts the address and reports every disagreement. Worth a pass to
work out which column is right at source.

**d. All 146 flyer images were expiring Airtable links.** Those URLs stop
resolving within hours of an export, so they are deliberately not imported —
storing them would have filled the database with dead links. To show flyers,
the images need re-hosting somewhere permanent.

**e. One event is outside the US** (SSOVA Costa Rica). Held as `draft`, on
the grounds that a domestic discovery product should not surface it in a
"within 50 miles" result.

**f. One event runs two surfaces** (Mother Lode: beach and grass). This is
why surface is many-to-many rather than a single column.

**g. 37 events link to volleyballlife.com as their registration page.**
Linking out to an organizer's registration page is normal. Republishing
another platform's listing data is a different matter — worth confirming
each listing with its organizer, as you planned.

---

## 8. Performance baseline

Measured locally against the full launch dataset (156 events, 44 venues) on
PostgreSQL 16.

| Measurement | Result |
|---|---|
| Radius query, 50 mi of Chicago, planned + executed | **1.5 ms** |
| Discovery page, no filters | **34 ms** avg over 10 requests |
| Discovery page, location + radius | **21 ms** avg |
| Discovery page, location + surface + gender + division | **23 ms** avg |
| Tournament detail page | **17 ms** avg |
| Communities landing page | **10 ms** avg |
| Communities map page | **12 ms** avg |
| Discovery filtered to one state | **21 ms** avg |

These are local figures without network latency. They establish the shape of
the query, not a production SLA. Proposed Phase 1 target, to be confirmed
once the hosting region is chosen: **95% of discovery searches return in
under 500 ms** at up to 5,000 approved events, excluding third-party
outages.

The indexes carrying this: `events (status, starts_on) where approved`,
`venues (latitude, longitude)`, `venues (state, city)`, and indexes on each
join table.

---

## 9. Automated tests

Nineteen end-to-end tests run against the real application and a real database,
covering the Phase 1 acceptance criteria that can be automated:

1. A visitor browses tournaments without signing in
2. Location search narrows results and names the place it matched
3. An unrecognised location is reported, not silently ignored
4. Ticking a filter updates results and shows a removable pill
5. A detail page shows core details, a map link and a calendar link
6. Admin pages are closed to the public
7. A wrong staff password is rejected
8. Staff create a tournament and it appears in public discovery
9. Required fields are enforced
10. Paste-and-parse fills the form from a pasted post, and it saves
11. Parsing nothing useful leaves the form empty rather than guessing
12. Communities lists the sports and links only to the live one
13. The map draws all 51 shapes and links only states with events
14. Choosing a state on the map filters discovery to that state
15. A state filter survives ticking another filter
16. An unknown sport community is a 404, not an empty page
17. The state view zooms in and places events geographically
18. Venues too close to separate are grouped into one pin
19. A state with nothing scheduled says so instead of showing an empty map

A further 13 unit tests cover the parser itself against real post shapes —
terse flyers, chatty paragraphs, per-team pricing, date ranges, numeric
shorthand ("Coed 6s"), registration deadlines, and the cases where it must
refuse rather than guess.

---

## 10. What to approve

- [ ] Tournament, venue and organizer field lists (§2)
- [ ] The closed filter list and radius choices (§3)
- [ ] Mapbox as the geocoding provider, with local-first lookup (§1, §4)
- [ ] Adult-only enforced in the database, with no age filter (§1)
- [ ] The performance target proposed in §8
- [ ] How to handle the data findings in §7 — particularly (a), the 2027 season
- [ ] **§6a Communities and the state map as a priced change order**
