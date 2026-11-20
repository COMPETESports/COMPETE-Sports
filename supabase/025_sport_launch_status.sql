-- 025 · Sports by launch status, and 20 "coming soon" sports
--
-- Tom, 15 and 17 Nov 2026. The player profile shows sports in three
-- groups:
--   Live         volleyball  — full questions, events on the site
--   Next         pickleball  — its own questions, events coming
--   Coming soon  20 more, A to Z — ticking one records demand, nothing else
--
-- A coming-soon sport is is_active = false, so the event form, search,
-- the homepage and the flyer reader never offer it. The Communities page
-- reads launch_status and shows live and next only.
--
-- Softball and Slow pitch softball are two entries on purpose: softball is
-- mostly women's fast pitch, slow pitch is the more popular (Tom, 17 Nov).
--
-- Safe to run twice. Adds rows and one column; changes no existing data
-- except setting volleyball and pickleball's status.
--
-- Paste the whole file into the Supabase SQL editor and run it, THEN push
-- the code.

alter table sports
  add column if not exists launch_status text not null default 'live';

alter table sports drop constraint if exists sports_launch_status_check;
alter table sports add constraint sports_launch_status_check
  check (launch_status in ('live', 'next', 'coming_soon'));

update sports set launch_status = 'live' where slug = 'volleyball';
update sports set launch_status = 'next' where slug = 'pickleball';

insert into sports (slug, name, display_order, is_active, launch_status)
values
  ('archery',          'Archery',             100, false, 'coming_soon'),
  ('baseball',         'Baseball',            100, false, 'coming_soon'),
  ('basketball',       'Basketball',          100, false, 'coming_soon'),
  ('billiards',        'Billiards',           100, false, 'coming_soon'),
  ('cornhole',         'Cornhole',            100, false, 'coming_soon'),
  ('darts',            'Darts',               100, false, 'coming_soon'),
  ('disc-golf',        'Disc golf',           100, false, 'coming_soon'),
  ('dodgeball',        'Dodgeball',           100, false, 'coming_soon'),
  ('flag-football',    'Flag football',       100, false, 'coming_soon'),
  ('golf',             'Golf',                100, false, 'coming_soon'),
  ('hockey',           'Hockey',              100, false, 'coming_soon'),
  ('kickball',         'Kickball',            100, false, 'coming_soon'),
  ('rugby',            'Rugby',               100, false, 'coming_soon'),
  ('slow-pitch-softball', 'Slow pitch softball', 100, false, 'coming_soon'),
  ('soccer',           'Soccer',              100, false, 'coming_soon'),
  ('softball',         'Softball',            100, false, 'coming_soon'),
  ('table-tennis',     'Table tennis',        100, false, 'coming_soon'),
  ('tennis',           'Tennis',              100, false, 'coming_soon'),
  ('ultimate-frisbee', 'Ultimate frisbee',    100, false, 'coming_soon'),
  ('wrestling',        'Wrestling',           100, false, 'coming_soon')
on conflict (slug) do nothing;

-- Check: should list volleyball live, pickleball next, and 20 coming_soon.
select launch_status, count(*) as sports,
       string_agg(name, ', ' order by name) as names
  from sports
 group by launch_status
 order by min(display_order);
