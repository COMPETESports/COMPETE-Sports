-- 029_sub_format_shorties.sql
-- ---------------------------------------------------------------------
-- New sub-format: Shorties. 22 Nov 2026.
--
-- Tom: "a format where a team and the players on the team must be
-- shorter than 6' tall." A height rule, layered on a real format the
-- same way blind draws are: "Coed Sixes – Shorties" keeps the team size
-- and gender, and the sub-format says who is eligible.
--
-- Teams enter together, so it registers as 'partner' (you bring your own
-- players), not 'individual'. Any surface, any gender.
--
-- Tom also flagged a future "specialty format" section (height rules,
-- age brackets, themed events). Until that exists, Shorties lives here.
--
-- Safe to run twice. Shows up in the bracket builder's sub-format choices
-- straight away; no code change needed to offer it.

insert into sub_formats (sport_id, slug, name, registers_as, requires_surface, requires_gender, display_order)
select s.id, 'shorties', 'Shorties (under 6 ft)', 'partner', null, null, 50
from sports s
where s.slug = 'volleyball'
on conflict (sport_id, slug) do update
   set name             = excluded.name,
       registers_as     = excluded.registers_as,
       requires_surface = excluded.requires_surface,
       requires_gender  = excluded.requires_gender,
       display_order    = excluded.display_order;
