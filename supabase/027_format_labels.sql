-- 027_format_labels.sql
-- ---------------------------------------------------------------------
-- Show the sub-format on the event page. 21 Nov 2026.
--
-- Tom, reviewing "Sleigh, Set, Spike! Blind Draw": the Formats line read
-- "Coed Quads" with no mention of the blind draw. Sub-formats (012) live
-- on event_brackets.sub_format_id, but the public view builds its format
-- list from event_formats, which only knows the format. So "how you
-- enter" -- the thing 012 said players most want to know -- never
-- reached players.
--
-- This appends one column, format_labels, to the END of event_discovery
-- (create or replace view only allows adding at the end). Every other
-- column is copied from 023 unchanged.
--
-- The app falls back to format_names until this has run, so code and
-- migration can go in either order. Safe to run twice. No data touched.
--
-- NOTE: the player-profile migration planned as 027 becomes 028.

create or replace view event_discovery as
select
  e.id,
  e.slug,
  e.name,
  e.event_type,
  e.starts_on,
  e.ends_on,
  e.start_time,
  e.registration_deadline,
  e.entry_fee_cents,
  e.fee_basis,
  e.payout_text,
  e.event_page_url,
  e.flyer_url,
  e.notes,
  e.status,
  e.featured,
  e.featured_rank,
  e.featured_until,
  sp.slug  as sport_slug,
  sp.name  as sport_name,
  coalesce(su.surface_slugs, '{}') as surface_slugs,
  coalesce(su.surface_names, '{}') as surface_names,
  o.name   as organizer_name,
  o.contact_email as organizer_email,
  v.name   as venue_name,
  v.address_line,
  v.city,
  v.state,
  v.postal_code,
  v.latitude,
  v.longitude,
  v.geo_precision,
  coalesce(f.format_slugs, '{}')    as format_slugs,
  coalesce(f.format_names, '{}')    as format_names,
  coalesce(f.genders, '{}')         as genders,
  coalesce(d.division_slugs, '{}')  as division_slugs,
  coalesce(d.division_names, '{}')  as division_names,
  d.top_skill_rank,
  -- 023: appended, never inserted -- create or replace view can only add
  -- columns at the end of the list.
  e.league_days,
  e.league_weeks,
  e.playoffs,
  coalesce(ln.league_nights, '{}') as league_nights,
  -- 027: appended. Format plus how you enter, e.g. "Coed Quads – Solo
  -- Blind Draw". Empty when the event has no brackets.
  coalesce(fl.format_labels, '{}') as format_labels
from events e
join sports sp       on sp.id = e.sport_id
left join organizers o on o.id = e.organizer_id
left join venues v    on v.id = e.venue_id
left join lateral (
  select array_agg(sf.slug order by sf.display_order) as surface_slugs,
         array_agg(sf.name order by sf.display_order) as surface_names
  from event_surfaces es join surfaces sf on sf.id = es.surface_id
  where es.event_id = e.id
) su on true
left join lateral (
  select array_agg(fm.slug order by fm.display_order) as format_slugs,
         array_agg(fm.name order by fm.display_order) as format_names,
         array_agg(distinct fm.gender)                as genders
  from event_formats ef join formats fm on fm.id = ef.format_id
  where ef.event_id = e.id
) f on true
left join lateral (
  select array_agg(dv.slug order by dv.display_order) as division_slugs,
         array_agg(dv.name order by dv.display_order) as division_names,
         min(dv.skill_rank)                           as top_skill_rank
  from event_divisions ed join divisions dv on dv.id = ed.division_id
  where ed.event_id = e.id
) d on true
left join lateral (
  -- Only the nights that PLAY. A skipped night is a fact for the event
  -- page, where its note ("no play 26 Nov -- Thanksgiving") is shown; for
  -- search it is simply not a night the league is on.
  select array_agg(ld.plays_on order by ld.plays_on) as league_nights
  from league_dates ld
  where ld.event_id = e.id and not ld.skipped
) ln on true
left join lateral (
  -- One label per distinct format + sub-format pair across the brackets.
  -- Brackets that differ only by division collapse to one label.
  select array_agg(label order by ord, label) as format_labels
  from (
    select distinct
           fm.name || coalesce(' – ' || sf.name, '') as label,
           fm.display_order as ord
      from event_brackets b
      join formats fm          on fm.id = b.format_id
      left join sub_formats sf on sf.id = b.sub_format_id
     where b.event_id = e.id
  ) x
) fl on true;
