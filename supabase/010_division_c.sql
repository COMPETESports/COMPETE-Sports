-- 010_division_c.sql
-- ---------------------------------------------------------------------
-- Brings the C division back, at Tom's request on 18 October 2026.
--
-- C was never missing. Migration 004 retired it deliberately — it was not
-- in the taxonomy Tom gave on 2 October, and a first draft of 004 deleted
-- it outright until running that showed real Phase 1 events were using it.
-- So it was kept with is_active = false, skill_rank 90, display_order 900.
--
-- That is why it has been showing at the very bottom of the admin form's
-- division list while being invisible to players: the public filter in
-- queries.ts reads `where d.is_active`, and the admin form does not.
--
-- Reinstating it is therefore a re-rank, not an insert. 'recreational'
-- stays retired; only C comes back.

-- Masters moves from 8 to 9 to make room. Its rank has always sat below
-- the skill tiers on purpose — a masters bracket is an alternative to
-- picking a tier, not a tier itself — so it stays last.
update divisions d set
  skill_rank    = 9,
  display_order = 90
from sports s
where s.slug = 'volleyball' and d.sport_id = s.id and d.slug = 'masters';

update divisions d set
  is_active     = true,
  skill_rank    = 8,
  display_order = 80,
  -- The descriptor completes the ladder: Open (Semi Pro) down through
  -- B (Low Recreational). TOM TO CONFIRM THE WORDING — every other
  -- descriptor in this table came from him directly, and this one did
  -- not, so it should not stay unchecked.
  descriptor    = 'Beginner'
from sports s
where s.slug = 'volleyball' and d.sport_id = s.id and d.slug = 'c';

-- The ladder now reads, strongest to most casual:
--   Open · AAA · AA · A · BBB · BB · B · C, then Masters (55+)
