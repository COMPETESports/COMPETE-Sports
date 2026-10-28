-- 013_bracket_surface.sql
-- ---------------------------------------------------------------------
-- Surface moves onto the bracket.
--
-- Tom, 21 October, after ticking all four surfaces on one event and
-- getting no warning: "My gut says no because I have never attended an
-- event with multiple surfaces for the exact same gender and format."
--
-- He is right, and the fix is not to split the event. His own example of
-- a single Saturday:
--
--     Beach · Men's   · Doubles · Open
--     Grass · Women's · Quads   · Open
--     Grass · Men's   · Doubles · Open
--
-- Three brackets, one event card. Splitting by surface would have put the
-- same tournament name in the results twice, which is the objection that
-- killed per-day splitting back on 7 October.
--
-- This is the same flaw the bracket builder fixed on 18 October, one level
-- up: three independent lists with the combinations left implied. Surface
-- was the last axis still sitting on the event.
--
-- Run after 012_sub_formats.sql.

alter table event_brackets
  add column if not exists surface_id uuid references surfaces(id) on delete set null;

comment on column event_brackets.surface_id is
  'The surface this bracket is played on. Null means the source never said - the same meaning null carries on division_id. Set for every bracket entered through the admin form from 21 Oct 2026.';

create index if not exists event_brackets_surface_idx
  on event_brackets (surface_id) where surface_id is not null;


-- ---------------------------------------------------------------------
-- Backfill only where there is no guess to make
-- ---------------------------------------------------------------------
-- An event linked to exactly ONE surface tells us, with certainty, what
-- surface each of its brackets ran on. There is nothing to infer.
--
-- An event linked to several does NOT. Writing a surface onto those
-- brackets would be inventing the combinations all over again - the same
-- mistake as 006's cross-product backfill, whose 2,574 rows all carry
-- confirmed = false for exactly this reason. Those stay null, and null
-- goes on meaning "the source does not say".

-- Written first with min(es.surface_id), which Postgres refuses: uuid has
-- no ordering, so min() is not defined for it. There was never a need to
-- aggregate anyway - the point is to act only where exactly one row
-- exists, so the count belongs in a guard, not in a min().

update event_brackets b
   set surface_id = es.surface_id
  from event_surfaces es
 where es.event_id = b.event_id
   and b.surface_id is null
   and (select count(*) from event_surfaces x where x.event_id = b.event_id) = 1;


-- ---------------------------------------------------------------------
-- How many were left unknown
-- ---------------------------------------------------------------------
-- Run separately. Each row is a multi-surface event whose brackets could
-- not be backfilled and which should be re-entered by hand if its surfaces
-- matter for search.
--
--   select e.name, e.starts_on, e.status,
--          count(distinct es.surface_id) as surfaces,
--          count(distinct b.id)          as brackets
--     from events e
--     join event_surfaces es on es.event_id = e.id
--     left join event_brackets b on b.event_id = e.id and b.surface_id is null
--    group by e.id, e.name, e.starts_on, e.status
--   having count(distinct es.surface_id) > 1
--    order by e.starts_on desc;
