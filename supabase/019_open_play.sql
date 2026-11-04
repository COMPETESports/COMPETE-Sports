-- 019_open_play.sql
-- ---------------------------------------------------------------------
-- What an open play session needs that nothing else does.
--
-- Drop in & ball. It is not a tournament with one date, and not a league
-- with a fixed number of weeks and a champion at the end. It runs on
-- certain nights, between certain hours, until further notice.
--
-- The two facts missing were the END of the session and the fact that it
-- may have no end date at all.

-- When play stops. A tournament ends when the last match ends and nobody
-- publishes a time for it; open play is advertised as "6 to 9".
alter table events add column if not exists end_time time;

-- An open play session that runs indefinitely. ends_on stays null in
-- that case, and this says the null means "no end planned" rather than
-- "nobody filled it in" - a distinction the live/past filter needs, or
-- a weekly session would vanish from the site the day after it started.
alter table events add column if not exists is_ongoing boolean not null default false;

-- NAMING DEBT, recorded rather than hidden: `league_days` now carries
-- the days of the week for open play too. The column is right, the name
-- is half right. Renaming it to `recurs_on` is a one-line migration and
-- a dozen code changes; it is not worth doing in the same pass that adds
-- the feature, but it should be done.
comment on column events.league_days is
  'Days of the week this event recurs on. 0 = Sunday. Used by BOTH league (which night the season plays) and open play (which nights it runs). Named before open play existed - see 019.';

comment on column events.is_ongoing is
  'Open play with no planned end date. When true, ends_on is null by intention rather than omission.';
