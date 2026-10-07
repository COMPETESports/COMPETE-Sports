-- ---------------------------------------------------------------------
-- 004_brackets.sql — Tom's taxonomy, and brackets as real rows
--
-- Two changes, both driven by the 2 Oct 2026 review of the Figma frames
-- against the 398 imported historical events.
--
-- 1. VOCABULARY. Tom's own taxonomy, stated verbatim:
--
--      Surface  — grass, beach, indoor, turf
--      Format   — doubles, triples, quads, sixes
--      Gender   — male, female, coed
--      Division — Open (Semi Pro), AAA (High Competitive), AA, A (Low
--                 Competitive), BBB (Advanced Recreational), BB, B (Low
--                 Recreational)
--
--    So "division" means the SKILL TIER, and gender is its own axis.
--    An earlier pass renamed the skill facet to "Skill level" on the
--    reasoning that volleyball players say "division" for the gender
--    bracket. Tom, who has run these events, says otherwise. His
--    vocabulary wins and this migration carries it into the data.
--
--    Note the submission wireframe uses the opposite convention
--    ("Divisions Offered: Men's / Women's / Co-ed", then "Skill Levels").
--    The inconsistency is in the source material. Tom's message is the
--    authority.
--
-- 2. BRACKETS. The submission form models an event as a cascade:
--    divisions -> formats within each -> skill tiers within each. So
--    "Men's Doubles AA" is a bracket, and an event is a SET of brackets.
--
--    The existing model attaches formats and divisions to an event as two
--    flat many-to-many lists. That can say "this event has men's and coed
--    somewhere, and AA and BB somewhere" but cannot say which
--    combinations actually run — which is the only question a player is
--    asking.
--
--    This is not hypothetical. Of the 398 imported events, 109 carry more
--    than one gender AND more than one skill tier, so 27% of the
--    catalogue is ambiguous under the flat model.
--
--    `event_brackets` makes a bracket a row. Because `formats` already
--    carries gender and team_size, a bracket is simply format x division,
--    which reuses the reference data rather than duplicating it.
--
-- Safe to re-run. Requires PostgreSQL 15+ for `nulls not distinct`
-- (every current Supabase project qualifies).
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 1a. Surfaces — add turf
--
-- No imported event uses it (beach 107, grass 64, indoor 15), so this is
-- forward-looking: indoor turf facilities and turf fields are a real and
-- growing venue type for grass-format play.
-- ---------------------------------------------------------------------

insert into surfaces (sport_id, slug, name, display_order)
select s.id, 'turf', 'Turf', 40
from sports s
where s.slug = 'volleyball'
on conflict (sport_id, slug) do nothing;


-- ---------------------------------------------------------------------
-- 1b. Gender — reverse co-ed becomes its own value
--
-- 32 of the imported events run reverse co-ed. It had been stored as
-- gender = 'coed', which means a player filtering for Co-ed was being
-- shown reverse co-ed brackets. Those are materially different games
-- (the format inverts which positions each gender may play), so showing
-- one to someone who asked for the other is a wrong answer, not a
-- near-enough one.
-- ---------------------------------------------------------------------

alter table formats drop constraint if exists formats_gender_check;
alter table formats add constraint formats_gender_check
  check (gender in ('mens','womens','coed','reverse_coed','open'));

update formats
   set gender = 'reverse_coed'
 where slug like 'reverse-coed-%'
   and gender <> 'reverse_coed';

-- Reverse co-ed sixes was missing entirely, so a six-a-side reverse
-- co-ed event could not be recorded. Nothing in 2022-24 needs it; it is
-- one row and it closes the gap.
insert into formats (sport_id, slug, name, gender, team_size, display_order)
select s.id, 'reverse-coed-sixes', 'Reverse Coed Sixes', 'reverse_coed', 6, 165
from sports s
where s.slug = 'volleyball'
on conflict (sport_id, slug) do nothing;


-- ---------------------------------------------------------------------
-- 1c. Blind draw — a format
--
-- Blind draw is not a gender and not a skill tier: you enter alone and
-- are assigned a partner. The submission wireframe filed it under
-- divisions, where it does not belong.
--
-- Tom's call (2 Oct) is to put it under FORMAT, and that lands cleanly
-- with no new machinery. A format row with a null team_size keeps its
-- own name through the facet's size-collapsing logic — the same path
-- that stops "King & Queen of the Beach" and "Mixer" from being
-- flattened into a meaningless number. So Blind Draw simply appears as
-- its own choice in the Format facet.
--
-- gender is 'open' because a blind draw assigns partners across the
-- field; constraining it would be inventing a rule organizers don't use.
--
-- (An earlier draft of this migration made it a boolean column on
-- events. Removed: two mechanisms for one fact is how data drifts.)
-- ---------------------------------------------------------------------

insert into formats (sport_id, slug, name, gender, team_size, display_order)
select s.id, 'blind-draw', 'Blind Draw', 'open', null, 180
from sports s
where s.slug = 'volleyball'
on conflict (sport_id, slug) do nothing;

alter table events drop column if exists blind_draw;
drop index if exists events_blind_draw_idx;


-- ---------------------------------------------------------------------
-- 1d. Divisions — Tom's seven, with the plain-English descriptors
--
-- The descriptors matter more than they look. "BB" is meaningless to
-- anyone who has not already played in this scene, and a player who
-- cannot tell which tier they belong in does not enter. Tom supplied the
-- translations; they belong next to the data, not hard-coded in a
-- component.
-- ---------------------------------------------------------------------

alter table divisions add column if not exists descriptor text;

-- BBB (Advanced Recreational) sits between A and BB and was missing.
insert into divisions (sport_id, slug, name, skill_rank, display_order)
select s.id, 'bbb', 'BBB', 5, 50
from sports s
where s.slug = 'volleyball'
on conflict (sport_id, slug) do nothing;

-- Masters stays on the division axis, named "Masters (55+)" — Tom's
-- call, 2 Oct. I had flagged it as a modelling error on the grounds that
-- age is not skill, and strictly it isn't; but this is the axis
-- organizers actually print it on, and matching how a flyer reads beats
-- being right in the abstract. Its rank sits below B because a masters
-- bracket is an alternative to picking a tier, not a tier itself.
update divisions set name = 'Masters (55+)' where slug = 'masters';

-- Re-rank to Tom's order and attach the descriptors. AA and BB confirmed
-- by Tom directly; nothing here is inferred any more.
update divisions d set
  skill_rank    = v.rank,
  display_order = v.rank * 10,
  descriptor    = v.descriptor
from (values
  ('open',    1, 'Semi Pro'),
  ('aaa',     2, 'High Competitive'),
  ('aa',      3, 'Competitive'),
  ('a',       4, 'Low Competitive'),
  ('bbb',     5, 'Advanced Recreational'),
  ('bb',      6, 'Recreational'),
  ('b',       7, 'Low Recreational'),
  ('masters', 8, 'Age 55 and over')
) as v(slug, rank, descriptor)
join sports s on s.slug = 'volleyball'
where d.slug = v.slug and d.sport_id = s.id;

-- Retire the three that are not in Tom's taxonomy — WITHOUT deleting.
--
-- A first draft of this migration deleted them. Running it showed why
-- that was wrong: all three are in use by the original Phase 1 events,
-- which the earlier CSV analysis of the 2022-24 import did not cover.
--
--   recreational — 29 events
--   c            —  2 events
--   masters      —  2 events
--
-- Deleting would have cascaded those associations away and silently
-- thrown out skill information a real organizer published. So they are
-- deactivated instead: hidden everywhere a player or organizer chooses
-- a tier, still attached to the events that used them.
--
-- `recreational` is the one safe remap. Tom's descriptor for BB is
-- literally "Recreational", so folding it into BB preserves the meaning
-- rather than guessing at it.
--
-- `c` and `masters` are NOT remapped, because there is no honest target:
--   c       — a real tier below B that some organizers use; Tom's list
--             stops at B. Mapping it to B would promote 2 events into a
--             tier their organizer did not advertise.
--   masters — does not belong on this axis at all. Masters is an AGE
--             bracket, not a skill tier, so keeping it here mixed two
--             independent dimensions. Awaiting Tom's call on whether to
--             model age brackets as their own thing.

-- The column that does the hiding. The remap and deactivation itself
-- happens in section 3, after event_brackets exists — brackets are the
-- source of truth, so a remap has to rewrite them and let the sync
-- trigger carry the change into the flat lists. Doing it here instead
-- was a first-draft mistake: the flat rows were deleted, then the
-- trigger faithfully resurrected them from the un-remapped brackets.
alter table divisions add column if not exists is_active boolean not null default true;


-- ---------------------------------------------------------------------
-- 1e. Times and early-bird pricing
--
-- check_in_time has data waiting for it: the 2024 sheet carries a
-- Check-In column for 186 events, which the import currently parks in
-- `notes` because there was nowhere better to put it. This gives it a
-- home and makes that import lossless.
--
-- meeting_time and the early-bird pair come from the submission form.
-- Early-bird pricing is near-universal in this scene and currently has
-- to be written into free text where nothing can sort or filter on it.
-- ---------------------------------------------------------------------

alter table events add column if not exists check_in_time time;
alter table events add column if not exists meeting_time  time;
alter table events add column if not exists early_bird_fee_cents int
  check (early_bird_fee_cents is null or early_bird_fee_cents >= 0);
alter table events add column if not exists early_bird_deadline date;

-- An early-bird price only means something with a date attached, and a
-- date only means something with a price. Half of either is a bug.
alter table events drop constraint if exists events_early_bird_pair;
alter table events add constraint events_early_bird_pair check (
  (early_bird_fee_cents is null) = (early_bird_deadline is null)
);


-- ---------------------------------------------------------------------
-- 2. event_brackets
--
-- One row per bracket an event actually runs.
--
-- division_id is NULLABLE on purpose: 136 of the imported events (the
-- whole 2022 season) state a gender and a team size but no skill tier,
-- because the source sheet has four columns and none of them is skill.
-- A null here means "the source does not say", which is the truth. The
-- alternative — inventing a tier — would be worse than a gap.
--
-- `confirmed` separates stated fact from derived guess. A row is
-- confirmed when an organizer told us this bracket exists. The backfill
-- below leaves it false, because a cross product of two flat lists is an
-- inference and labelling it otherwise would launder a guess into a
-- fact.
--
-- Per-bracket fee and registration_url: entry fees differ by bracket in
-- the real world (a doubles bracket and a sixes bracket never cost the
-- same), and organizers routinely run a separate registration form per
-- division. Both fall back to the event-level value when null.
--
-- registration_url is also the forward hook. COMPETE is a discovery
-- platform and will not process registrations for the foreseeable
-- future — decided 2 Oct 2026. If that ever changes, this column is
-- where an internal registration record attaches instead of an outbound
-- link, so the long-term vision costs no migration today.
-- ---------------------------------------------------------------------

create table if not exists event_brackets (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references events(id)    on delete cascade,
  format_id        uuid not null references formats(id)   on delete cascade,
  division_id      uuid          references divisions(id) on delete cascade,

  entry_fee_cents  int check (entry_fee_cents >= 0),
  fee_basis        text check (fee_basis in ('per_player','per_team')),
  registration_url text,

  -- "What's filling up" — approved 2 Oct.
  --
  -- COMPETE does not process registrations, so it cannot measure these.
  -- They are ORGANIZER-REPORTED, and the UI has to say so: the display is
  -- "14 of 16 teams — as reported by the organizer, updated Tuesday",
  -- never a bare "14/16" that implies we counted.
  --
  -- capacity_updated_at is therefore not decoration. A stale number
  -- presented as current is worse than no number, so the timestamp is
  -- what lets the page age the claim honestly — or stop showing it.
  teams_registered    int check (teams_registered >= 0),
  max_teams           int check (max_teams > 0),
  capacity_updated_at timestamptz,

  -- A count without a timestamp is an unattributable claim.
  constraint event_brackets_capacity_dated check (
    (teams_registered is null and max_teams is null)
    or capacity_updated_at is not null
  ),

  -- Organizer-stated, as opposed to inferred from the event's flat lists.
  confirmed        boolean not null default false,

  created_at       timestamptz not null default now(),

  -- `nulls not distinct` so two "gender+size, tier unknown" rows for the
  -- same event collide instead of quietly duplicating. Needs PG 15+.
  constraint event_brackets_unique
    unique nulls not distinct (event_id, format_id, division_id)
);

create index if not exists event_brackets_event_idx    on event_brackets (event_id);
create index if not exists event_brackets_format_idx   on event_brackets (format_id);
create index if not exists event_brackets_division_idx on event_brackets (division_id);

-- The filter a player's query actually runs: "is there a bracket here
-- matching this format and this tier?"
create index if not exists event_brackets_lookup_idx
  on event_brackets (format_id, division_id, event_id);

alter table event_brackets enable row level security;


-- ---------------------------------------------------------------------
-- 2b. Backfill
--
-- The best available reading of the existing data: every format the
-- event lists, crossed with every division it lists. For the 289 events
-- with a single gender or a single tier this is exactly right. For the
-- 109 ambiguous ones it over-generates — an event offering Men's and
-- Coed at AA and BB gets four bracket rows when it may have run three.
--
-- That is why every row lands with confirmed = false. The rows are good
-- enough to filter an archived catalogue and honest about what they are;
-- the re-import and organizer submissions will overwrite them with
-- stated brackets.
--
-- Fee and URL are left null so they inherit from the event rather than
-- copying a single event-level number onto brackets that may not share
-- it.
-- ---------------------------------------------------------------------

insert into event_brackets (event_id, format_id, division_id, confirmed)
select ef.event_id, ef.format_id, ed.division_id, false
from event_formats ef
left join event_divisions ed on ed.event_id = ef.event_id
on conflict on constraint event_brackets_unique do nothing;


-- ---------------------------------------------------------------------
-- 2c. Flat lists stay, derived from brackets
--
-- event_formats and event_divisions are not dropped. Ten read paths in
-- src/lib/queries.ts build facets off them, the event detail page reads
-- them, and the .ics export reads them. Keeping them means brackets can
-- land without a rewrite of every query in the same change.
--
-- They are now DERIVED: brackets are the source of truth, and these two
-- tables are the flattened projection. This trigger keeps them honest so
-- the two representations cannot drift apart — which they would, within
-- a week, if syncing were left to application code.
-- ---------------------------------------------------------------------

create or replace function sync_event_flat_lists() returns trigger as $$
declare
  target uuid := coalesce(new.event_id, old.event_id);
begin
  insert into event_formats (event_id, format_id)
  select distinct target, b.format_id
    from event_brackets b where b.event_id = target
  on conflict do nothing;

  insert into event_divisions (event_id, division_id)
  select distinct target, b.division_id
    from event_brackets b
   where b.event_id = target and b.division_id is not null
  on conflict do nothing;

  delete from event_formats ef
   where ef.event_id = target
     and not exists (
       select 1 from event_brackets b
        where b.event_id = target and b.format_id = ef.format_id);

  delete from event_divisions ed
   where ed.event_id = target
     and not exists (
       select 1 from event_brackets b
        where b.event_id = target and b.division_id = ed.division_id);

  return null;
end;
$$ language plpgsql;

drop trigger if exists event_brackets_sync on event_brackets;
create trigger event_brackets_sync
  after insert or update or delete on event_brackets
  for each row execute function sync_event_flat_lists();


-- ---------------------------------------------------------------------
-- 3. Retire the divisions outside Tom's taxonomy — without deleting
--
-- A first draft deleted these three. Running it revealed why that was
-- wrong: all three are in use by the original Phase 1 events, which the
-- CSV analysis of the 2022-24 import had not covered.
--
--   recreational — 29 events
--   c            —  2 events
--   masters      —  2 events
--
-- Deleting would have cascaded those away and silently discarded skill
-- information a real organizer published. So they are deactivated
-- instead: hidden everywhere a player or organizer picks a tier, still
-- attached to the events that used them.
--
-- This runs last, and rewrites event_brackets rather than the flat
-- lists, because brackets are the source of truth and the sync trigger
-- propagates from there. Remapping the flat tables directly does not
-- work: the trigger rebuilds them from the brackets on the next write.
-- ---------------------------------------------------------------------

-- `recreational` is the one safe remap. Tom's descriptor for BB is
-- literally "Recreational", so folding it in preserves the meaning
-- rather than guessing at it.
insert into event_brackets (event_id, format_id, division_id, entry_fee_cents,
                            fee_basis, registration_url, confirmed)
select b.event_id, b.format_id, bb.id, b.entry_fee_cents,
       b.fee_basis, b.registration_url, b.confirmed
  from event_brackets b
  join divisions old on old.id = b.division_id and old.slug = 'recreational'
  join divisions bb  on bb.sport_id = old.sport_id and bb.slug = 'bb'
on conflict on constraint event_brackets_unique do nothing;

delete from event_brackets b
 using divisions d
 where d.id = b.division_id and d.slug = 'recreational';

-- Only `c` is retired. It is a real tier below B that some organizers
-- use, but Tom's taxonomy stops at B, and mapping it to B would promote
-- 2 events into a tier their organizer never advertised. So it is
-- hidden, not remapped and not deleted: its brackets keep pointing at
-- it, the data survives, and the picker only offers the current list.
--
-- `masters` is NOT retired — see section 1d. Tom's call is to keep it on
-- the division axis as "Masters (55+)", which is where organizers print
-- it.
update divisions d
   set is_active = false, skill_rank = 90, display_order = 900
 where d.slug in ('c','recreational');

-- Masters is explicitly live.
update divisions set is_active = true where slug = 'masters';

-- Force one sync pass so the flat lists reflect the remap even for
-- events whose brackets were not otherwise touched.
update event_brackets set confirmed = confirmed
 where event_id in (
   select distinct b.event_id from event_brackets b
     join divisions d on d.id = b.division_id
    where d.is_active is false
 );

-- Blind draw exists in pickleball too (shuffle / partner-draw play), so
-- the format is not volleyball-only. Added after Tom approved the
-- pickleball taxonomy on 2 Oct; his instruction was "add blind draws to
-- format" with no sport attached.
insert into formats (sport_id, slug, name, gender, team_size, display_order)
select s.id, 'blind-draw', 'Blind Draw', 'open', null, 180
from sports s
where s.slug = 'pickleball'
on conflict (sport_id, slug) do nothing;
