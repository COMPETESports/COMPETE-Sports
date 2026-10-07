-- =====================================================================
--  002 — Featured tournaments
--
--  Featuring is editorial: a staff member flags an event and it leads the
--  homepage. `featured_rank` lets the order be set by hand rather than by
--  whatever the database returns first, and `featured_until` makes a
--  feature expire on its own so a stale event cannot sit at the top of
--  the site forever if nobody remembers to unflag it.
-- =====================================================================

alter table events
  add column if not exists featured       boolean not null default false,
  add column if not exists featured_rank  int,
  add column if not exists featured_until date;

-- Only approved, still-upcoming, currently-featured events need indexing.
create index if not exists events_featured_idx
  on events (featured_rank nulls last, starts_on)
  where featured and status = 'approved';
