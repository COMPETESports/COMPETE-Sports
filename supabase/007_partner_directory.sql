-- 007_partner_directory.sql
-- ---------------------------------------------------------------------
-- Somewhere for the researched partner directory to land, and somewhere
-- on `organizers` to put a phone number.
--
-- Two changes, and the second one is the reason this migration is not
-- simply "alter table organizers add column phone".
--
-- The research produced ~1,250 venues and organizations across 47 states.
-- `organizers` currently holds 310 rows, every one of which is a real
-- organization with events attached and foreign keys pointing at it from
-- `events`. Importing the directory straight into that table would bury
-- 310 known quantities under a thousand unqualified leads, and there
-- would be no way afterwards to tell which was which.
--
-- So researched leads live in their own table and are *promoted* into
-- `organizers` when they become real — when someone answers the phone and
-- agrees to list an event. That is the pipeline the CRM concept already
-- describes, made concrete.
--
-- Run after 006_backfill_brackets.sql.


-- ---------------------------------------------------------------------
-- 1. Contact details on organizers
-- ---------------------------------------------------------------------
-- 258 of 310 organizations have no contact route at all, which is the
-- single biggest obstacle to getting events onto COMPETE. The columns
-- below are where enrichment results land.
--
-- `contact_source` and `contact_checked_at` are not bookkeeping. A phone
-- number recovered from Google Places six months ago and one a human
-- confirmed last week are different facts, and the difference decides
-- whether you trust it enough to dial. Recording where a value came from,
-- at the time it arrived, is the same rule the bracket model follows.

alter table organizers
  add column if not exists phone              text,
  add column if not exists city               text,
  add column if not exists state              text,  -- two-letter USPS code
  add column if not exists instagram          text,
  add column if not exists facebook           text,
  -- The registration platform they already use. A sales signal as much as
  -- a technical one: an organizer running on paper has more to gain from
  -- COMPETE than one already on LeagueApps.
  add column if not exists booking_platform   text,
  add column if not exists contact_source     text,
  add column if not exists contact_checked_at timestamptz;

-- A state code is two letters or it is wrong. Guarding this at the
-- database means a malformed import fails loudly instead of quietly
-- producing organizations in "Missouri " and "MO" that never match.
alter table organizers
  drop constraint if exists organizers_state_len;
alter table organizers
  add constraint organizers_state_len
  check (state is null or state ~ '^[A-Z]{2}$');

comment on column organizers.contact_source is
  'Where the contact details came from: google_places, research_<pass>, organizer_submitted, phone_call. Null means the row predates enrichment.';
comment on column organizers.contact_checked_at is
  'When those details were last confirmed. Null means never checked, which is different from checked and found empty.';


-- ---------------------------------------------------------------------
-- 2. The researched directory
-- ---------------------------------------------------------------------
-- One row per venue or organization found by research. Most will never
-- become organizers; that is expected and is why they are kept apart.

create table if not exists partner_prospects (
  id              uuid primary key default gen_random_uuid(),

  -- Identity
  name            text not null,
  category        text,                  -- Bar Sand Courts, Municipal Parks & Rec, Social Sports League, ...
  city            text,
  state           text,
  address         text,
  region          text,

  -- What they offer. `sports` is deliberately not a boolean pair: the
  -- honest answer for a venue nobody has asked about pickleball is
  -- neither true nor false.
  sports          text not null default 'unknown'
                  check (sports in ('volleyball','pickleball','both','volleyball?','unknown')),
  -- How the sports value was arrived at — 'stated by researcher',
  -- 'pickleball flag = no', 'volleyball in text; pickleball never checked'.
  -- Carried through from the research files so a reader can tell a
  -- confirmed label from an unchecked one.
  sports_basis    text,
  courts          text,                  -- free text: "7 indoor + 3 sand", counts are rarely clean
  offerings       text,

  -- Contact
  contact_name    text,
  contact_title   text,
  phone           text,
  email           text,
  website         text,
  social          text,
  booking_platform text,

  -- Provenance. Every row carries the page it was confirmed on, or an
  -- honest admission that it has none.
  source_url      text,
  source_file     text,                  -- which research pass produced it
  confidence      text not null default 'inferred'
                  check (confidence in ('verified','partial','inferred','unknown')),
  notes           text,

  -- Pipeline, from the CRM concept. A prospect that is researched but
  -- never contacted sits at 'prospect' forever, which is the point: the
  -- count of untouched rows is the size of the opportunity.
  status          text not null default 'prospect'
                  check (status in ('prospect','contacted','in_conversation',
                                    'committed','active','dormant','not_a_fit')),
  status_note     text,                  -- for 'not_a_fit', why — so the same dead end is not walked twice
  last_contacted_at timestamptz,
  next_action     text,
  next_action_on  date,

  -- Set once a prospect becomes a real organization. Null for everything
  -- that has not been promoted, which is almost all of them.
  organizer_id    uuid references organizers(id) on delete set null,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint partner_prospects_state_len
    check (state is null or state ~ '^[A-Z]{2}$')
);

-- Same venue, same state, imported twice is the failure mode. The merge
-- script already dedupes, but it runs outside the database and a second
-- import should not be able to undo that.
create unique index if not exists partner_prospects_name_state_uniq
  on partner_prospects (lower(name), coalesce(state, ''));

-- The map is the CRM's home screen and it is browsed by territory.
create index if not exists partner_prospects_state_idx  on partner_prospects (state, city);
create index if not exists partner_prospects_status_idx on partner_prospects (status);
create index if not exists partner_prospects_sports_idx on partner_prospects (sports);

comment on table partner_prospects is
  'Researched venues and organizations, pre-qualification. Promoted into organizers when they commit to listing events. Not visible to players.';


-- ---------------------------------------------------------------------
-- 3. Keep updated_at honest
-- ---------------------------------------------------------------------
-- Reuses set_updated_at() from 001, which already does exactly this for
-- organizers, venues and events. A second function with a different name
-- doing identical work is how a schema starts drifting.

drop trigger if exists partner_prospects_set_updated_at on partner_prospects;
create trigger partner_prospects_set_updated_at
  before update on partner_prospects
  for each row execute function set_updated_at();
