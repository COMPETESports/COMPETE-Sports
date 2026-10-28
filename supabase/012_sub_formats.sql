-- 012_sub_formats.sql
-- ---------------------------------------------------------------------
-- Sub-formats: Blind Draw, King of the Beach, Queen of the Beach.
--
-- This REVERSES a decision locked on 2 October and recorded in CLAUDE.md
-- as "Blind Draw is a Format". Tom reopened it on 18 October and he is
-- right to.
--
-- The 2 October reasoning was sound given what was known: a format row
-- with a null team_size survives the facet's size-collapsing logic, so
-- Blind Draw appeared as its own choice with no new machinery. What that
-- missed is that it DESTROYS the team size. "Blind Draw" cannot say
-- whether it is doubles or quads, and gender had to be set to 'open'
-- because a format row has nowhere else to put it.
--
-- As a sub-format, "Men's Doubles · Solo Blind Draw" keeps all three.
--
-- Tom's clarification on 18 October gives the axis that actually matters:
-- "King and Queen of the beach is an event you attend registered
-- individually without a partner. Some blind draws you register as an
-- individual and some you register with a partner."
--
-- So the distinguishing property is HOW YOU REGISTER, not what the thing
-- is called. That is stored explicitly as registers_as, because "can I
-- enter on my own?" is a question players ask and no other platform
-- answers.
--
-- Run after 011_division_c_insert.sql.

-- ---------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------
-- A reference table rather than a text column with a check, matching
-- surfaces, formats and divisions. It needs display_order and two
-- visibility rules, and those are data, not code.

create table if not exists sub_formats (
  id            uuid primary key default gen_random_uuid(),
  sport_id      uuid not null references sports(id) on delete cascade,
  slug          text not null,
  name          text not null,

  -- The real axis. 'individual' = you sign up alone and are placed;
  -- 'partner' = you bring someone and the draw is of something else.
  registers_as  text not null check (registers_as in ('individual', 'partner')),

  -- Visibility, as data. KOB only makes sense on sand and only for men;
  -- QOB only on sand and only for women. Null means "always offer it".
  -- Encoding this here rather than in the component means a new
  -- sub-format needs a row, not a deployment.
  requires_surface text,
  requires_gender  text check (requires_gender is null or
                               requires_gender in ('mens','womens','coed','reverse_coed','open')),

  display_order int not null default 0,
  unique (sport_id, slug)
);

comment on column sub_formats.registers_as is
  'Whether a player enters alone or with a partner already chosen. The property Tom identified on 18 Oct as the one that actually separates these.';
comment on column sub_formats.requires_surface is
  'Surface slug this sub-format requires, or null for any. KOB and QOB are beach-only.';
comment on column sub_formats.requires_gender is
  'Gender this sub-format requires, or null for any. King of the Beach is mens; Queen of the Beach is womens.';

alter table sub_formats enable row level security;


-- ---------------------------------------------------------------------
-- The four values, exactly as Tom specified them
-- ---------------------------------------------------------------------

insert into sub_formats (sport_id, slug, name, registers_as, requires_surface, requires_gender, display_order)
select s.id, v.slug, v.name, v.registers_as, v.surface, v.gender, v.ord
from sports s
cross join (values
  ('kob',                'KOB — King of the Beach',  'individual', 'beach', 'mens',   10),
  ('qob',                'QOB — Queen of the Beach', 'individual', 'beach', 'womens', 20),
  ('solo-blind-draw',    'Solo Blind Draw',          'individual', null,    null,     30),
  ('partner-blind-draw', 'Partner Blind Draw',       'partner',    null,    null,     40)
) as v(slug, name, registers_as, surface, gender, ord)
where s.slug = 'volleyball'
on conflict (sport_id, slug) do update
   set name          = excluded.name,
       registers_as  = excluded.registers_as,
       requires_surface = excluded.requires_surface,
       requires_gender  = excluded.requires_gender,
       display_order = excluded.display_order;


-- ---------------------------------------------------------------------
-- On the bracket, not the event
-- ---------------------------------------------------------------------
-- One event can run Men's Doubles and Men's Doubles Blind Draw as two
-- separate brackets, so this belongs beside format_id and division_id.
-- Null is the normal case: most brackets have no sub-format.

alter table event_brackets
  add column if not exists sub_format_id uuid references sub_formats(id) on delete set null;

create index if not exists event_brackets_sub_format_idx
  on event_brackets (sub_format_id) where sub_format_id is not null;


-- ---------------------------------------------------------------------
-- Retiring the two formats this replaces — WITHOUT converting them
-- ---------------------------------------------------------------------
-- 'blind-draw' and 'king-queen-of-the-beach' exist as formats today.
-- They are deliberately NOT auto-migrated into sub-formats.
--
-- Converting would mean inventing. A bracket on the 'blind-draw' format
-- has gender 'open' and team_size null, so the data genuinely does not
-- record whether it was a men's doubles blind draw or a coed quads one,
-- nor whether players registered alone or in pairs. Writing a guess here
-- would be the same mistake as 006's cross-product backfill, which is
-- why all 2,574 of those rows carry confirmed = false.
--
-- So: hide them from new entry, leave existing brackets untouched and
-- correct, and let Tom re-enter the affected events by hand against the
-- real announcements. The query at the bottom lists them.

alter table formats add column if not exists is_active boolean not null default true;

comment on column formats.is_active is
  'False hides a format from new event entry without deleting it or breaking existing brackets. Set for blind-draw and king-queen-of-the-beach in 012, which sub_formats replaces.';

update formats f
   set is_active = false
  from sports s
 where s.id = f.sport_id
   and s.slug = 'volleyball'
   and f.slug in ('blind-draw', 'king-queen-of-the-beach');


-- ---------------------------------------------------------------------
-- Which events need re-entering by hand
-- ---------------------------------------------------------------------
-- Run this separately after the migration. Each row is an event whose
-- brackets reference a retired format and should be rebuilt with a
-- gender, a team size and a sub-format.
--
--   select e.id, e.name, e.starts_on, e.status, f.name as retired_format,
--          count(*) as brackets
--     from event_brackets b
--     join events  e on e.id = b.event_id
--     join formats f on f.id = b.format_id
--    where f.is_active is false
--    group by e.id, e.name, e.starts_on, e.status, f.name
--    order by e.starts_on desc;
