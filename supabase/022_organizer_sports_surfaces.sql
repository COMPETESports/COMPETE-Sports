-- 022_organizer_sports_surfaces.sql
-- ---------------------------------------------------------------------
-- An organization can run more than one sport, on more than one surface.
--
-- Tom, 9 Nov, reviewing Angry Dragons: the Sports field let you pick one
-- answer, and "What they run" was a free-text box. Neither is true to
-- how these organizations actually work -- plenty run indoor leagues in
-- winter and sand tournaments in summer, and some run both sports.
--
-- `sports` held one value from a fixed list, with 'both' bolted on to
-- paper over exactly this. 'both' is a single-select pretending to be a
-- multi-select, and it cannot express "volleyball and pickleball and we
-- have not checked for a third."
--
-- Surfaces already belong to a sport in this schema -- `surfaces` has a
-- sport_id -- so picking volleyball and then choosing from beach, grass,
-- indoor and turf is the taxonomy the events already use. This records
-- the same facts about the organization rather than inventing a second
-- vocabulary that would drift.
-- ---------------------------------------------------------------------

begin;

alter table organizer_private
  add column if not exists sport_slugs   text[],
  add column if not exists surface_slugs text[];

comment on column organizer_private.sport_slugs is
  'Which sports this organization runs, as slugs from the sports table. Null means nobody has checked; an empty array would mean "checked, runs none", which is not a real state, so null is used.';
comment on column organizer_private.surface_slugs is
  'Which surfaces they run on, as slugs from the surfaces table. Surfaces belong to a sport there, so this is read alongside sport_slugs.';

-- Carry the old single value across. 'unknown' stays null rather than
-- becoming an empty array: not knowing is different from knowing there
-- are none, and 1,310 imported rows are mostly the former.
update organizer_private
   set sport_slugs = case sports
     when 'volleyball'  then array['volleyball']
     when 'volleyball?' then array['volleyball']
     when 'pickleball'  then array['pickleball']
     when 'both'        then array['volleyball','pickleball']
     else null
   end
 where sport_slugs is null;

-- `sports` is kept, not dropped. It still carries the distinction
-- between a confirmed 'volleyball' and a researched 'volleyball?' where
-- pickleball was never asked about, and sports_basis explains which.
-- Throwing that away to tidy up would lose the only record of how
-- carefully each of 1,310 rows was checked.
comment on column organizer_private.sports is
  'LEGACY as of 9 Nov. Superseded by sport_slugs for editing and filtering. Kept because the volleyball? value records that pickleball was never checked, which sport_slugs cannot express. Read with sports_basis.';

-- `offerings` likewise. The surface picker replaces it on the form, but
-- the researched prose stays and is shown read-only, because some of it
-- says things a surface list cannot -- "juniors clinics Tuesdays".
comment on column organizer_private.offerings is
  'LEGACY as of 9 Nov. Replaced on the form by surface_slugs, shown read-only beneath it. Free-text research that often carries detail no picker can hold.';

-- GIN, because every query against these asks "does this array contain
-- x" rather than "does it equal x".
create index if not exists organizer_private_sport_slugs_idx
  on organizer_private using gin (sport_slugs);
create index if not exists organizer_private_surface_slugs_idx
  on organizer_private using gin (surface_slugs);

commit;
