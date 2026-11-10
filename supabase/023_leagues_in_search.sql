-- 023_leagues_in_search.sql
-- ---------------------------------------------------------------------
-- Leagues visible to players. 10 Nov 2026.
--
-- Submission has stored a league properly since 31 Oct -- its night, its
-- length, its playoff plan and every date it plays (015). None of that
-- reached the public side, because search reads event_discovery and the
-- view was written on day one, before leagues existed. So a league showed
-- up as a one-date tournament, and the day after its first night it
-- dropped out of search for the rest of its season.
--
-- This adds four columns to the END of the view (start_time, the weekly
-- tip-off, was already in it):
--   league_days    which night(s), 0 = Sunday
--   league_weeks   season length as the director states it
--   playoffs       whether the season ends in a playoff
--   league_nights  the dates it actually plays, skipped nights left out
--
-- Nothing else in the view changes. Every existing column is copied from
-- 001 unchanged and in the same order, because create or replace view
-- refuses any edit except adding columns at the end.
--
-- Safe to run twice. No data is touched.

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
  coalesce(ln.league_nights, '{}') as league_nights
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
) ln on true;
