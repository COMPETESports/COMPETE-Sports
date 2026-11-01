-- 015_league_schedule.sql
-- ---------------------------------------------------------------------
-- A league is not a tournament with a longer end date.
--
-- A tournament has one date and a set of brackets that play out that day.
-- A league has a NIGHT -- "Tuesdays" -- a season length in weeks, and a
-- list of actual dates that is almost never a clean run: Thanksgiving,
-- Christmas week and the gym being double-booked all put holes in it.
--
-- So the dates are stored, not computed on the fly. A computed schedule
-- cannot have a hole in it, and the hole is the part players need to know
-- about. The form generates the list from night + weeks + first night,
-- then the director clicks the nights that do not play.
--
-- starts_on and ends_on stay the season's real first and last PLAYING
-- date, derived from this table on save. That keeps every existing query
-- working -- the live/past filter, the date sort, the search -- without
-- any of them having to learn what a league is.

-- Which night(s) of the week it plays. 0 = Sunday through 6 = Saturday,
-- matching both JavaScript's getDay() and Postgres's extract(dow), so no
-- translation layer can drift. An array because a few leagues run two
-- nights; most will hold exactly one value.
alter table events add column if not exists league_days smallint[];

-- Season length as the director states it. Two nights a week for 8 weeks
-- is 8 weeks and 16 dates -- weeks is what goes on the flyer.
alter table events add column if not exists league_weeks int;

-- Whether the season ends in a playoff or end-of-season tournament.
-- Phase 10 generates that bracket from the standings; for now it is a
-- fact players ask about before they register.
alter table events add column if not exists playoffs boolean not null default false;

alter table events drop constraint if exists events_league_weeks_range;
alter table events add constraint events_league_weeks_range check (
  league_weeks is null or league_weeks between 1 and 52
);

-- <@ is array containment. A CHECK cannot hold a subquery, so this is how
-- the 0-6 range gets enforced without one.
alter table events drop constraint if exists events_league_days_range;
alter table events add constraint events_league_days_range check (
  league_days is null
  or (array_length(league_days, 1) between 1 and 7
      and league_days <@ array[0,1,2,3,4,5,6]::smallint[])
);

-- The dates themselves. One row per night the league is scheduled to
-- play, including the ones it does not: a skipped night with a note is
-- more useful to a player than a missing row, because "no play 27 Nov --
-- Thanksgiving" answers the question that a gap only raises.
create table if not exists league_dates (
  id       uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  plays_on date not null,
  skipped  boolean not null default false,
  note     text,
  unique (event_id, plays_on)
);

create index if not exists league_dates_event_idx
  on league_dates (event_id, plays_on);

-- Same posture as the other event child tables: readable, and writable
-- only through the server actions, which hold the service key.
alter table league_dates enable row level security;
drop policy if exists league_dates_public_read on league_dates;
create policy league_dates_public_read on league_dates for select using (true);
