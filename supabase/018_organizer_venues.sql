-- 018_organizer_venues.sql
-- ---------------------------------------------------------------------
-- An organizer and the venues they use, as a fact of its own.
--
-- Until now the only link between the two was an event: COMPETE knew
-- Angry Dragon Volleyball plays at Tsunami because six events said so.
-- That is a good inference and a bad foundation.
--
-- Tom, 4 Nov: Legacy VTC is in the database, their venue is in the
-- database, and nothing connects them -- because no event has yet been
-- entered that names both. The relationship is real before the first
-- event exists, and it is exactly what a conversation produces: "we run
-- everything out of the rec center on Fulton." That belongs in the CRM
-- the moment it is said, not whenever an event finally gets published.
--
-- It also survives what events cannot. Archive every 2022 event and the
-- knowledge that this organizer uses this gym should not disappear with
-- them.

create table if not exists organizer_venues (
  organizer_id uuid not null references organizers(id) on delete cascade,
  venue_id     uuid not null references venues(id)     on delete cascade,

  -- Their main room. Most organizers have one; some have none, running
  -- wherever they can book. Not enforced as unique: an organizer with
  -- two genuine home courts is a real thing, and a constraint would
  -- make that unrecordable rather than unusual.
  is_home      boolean not null default false,

  -- Where the link came from. 'event' means it was inferred from an
  -- event that names both; 'stated' means a person said so. A stated
  -- link outranks an inferred one and should never be overwritten by
  -- the backfill below.
  source       text not null default 'stated'
               check (source in ('stated', 'event')),

  note         text,
  created_at   timestamptz not null default now(),

  primary key (organizer_id, venue_id)
);

create index if not exists organizer_venues_venue_idx
  on organizer_venues (venue_id);

alter table organizer_venues enable row level security;
drop policy if exists organizer_venues_public_read on organizer_venues;
create policy organizer_venues_public_read on organizer_venues for select using (true);

-- ---- backfill from what the events already prove ----
-- Every organizer+venue pair that has co-occurred on a real event
-- becomes a link, marked 'event' so it is clear nobody stated it. This
-- is what connects the existing 555 events' worth of knowledge in one
-- pass. ON CONFLICT DO NOTHING protects any link a person already made.
insert into organizer_venues (organizer_id, venue_id, source)
select distinct e.organizer_id, e.venue_id, 'event'
  from events e
 where e.organizer_id is not null
   and e.venue_id is not null
on conflict (organizer_id, venue_id) do nothing;

-- The venue an organizer has used most becomes their home, unless a
-- person has already said otherwise. A guess, but a good one, and the
-- UI shows where it came from so it can be corrected rather than
-- quietly believed.
with ranked as (
  select e.organizer_id, e.venue_id,
         row_number() over (
           partition by e.organizer_id
           order by count(*) desc, max(e.starts_on) desc
         ) as rank
    from events e
   where e.organizer_id is not null and e.venue_id is not null
   group by e.organizer_id, e.venue_id
)
update organizer_venues ov
   set is_home = true
  from ranked r
 where ov.organizer_id = r.organizer_id
   and ov.venue_id = r.venue_id
   and r.rank = 1
   and ov.source = 'event'
   and not exists (
     select 1 from organizer_venues x
      where x.organizer_id = ov.organizer_id and x.is_home
   );
