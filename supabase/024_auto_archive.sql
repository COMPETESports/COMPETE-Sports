-- 024 · Finished events archive themselves
--
-- An approved event moves to 'archived' the day after its last day:
-- the end date for multi-day tournaments, leagues and open play, the start
-- date otherwise. Nothing else changes: archived events keep their page
-- (players can still look back at what they played) and stay in players'
-- history; they simply leave the Live list and the search.
--
-- Runs every morning at 11:00 UTC (5 AM Central, 1 AM Hawaii), when the
-- date is the same across every US time zone. Running it once by hand is
-- safe: it only touches approved events that have already finished.
--
-- Paste the whole file into the Supabase SQL editor and run it once.

create or replace function archive_finished_events()
returns integer
language sql
as $$
  with moved as (
    update events
       set status = 'archived',
           updated_at = now()
     where status = 'approved'
       and coalesce(ends_on, starts_on) < current_date
    returning 1
  )
  select count(*)::int from moved;
$$;

create extension if not exists pg_cron;

-- Scheduling under the same name again replaces the job, so re-running
-- this file is harmless.
select cron.schedule(
  'archive-finished-events',
  '0 11 * * *',
  $$select archive_finished_events()$$
);

-- Clear the backlog now. The number shown is how many events were archived.
select archive_finished_events() as archived_now;
