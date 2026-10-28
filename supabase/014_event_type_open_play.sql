-- 014_event_type_open_play.sql
-- ---------------------------------------------------------------------
-- Lets an event be open play.
--
-- `event_type` was added outside this migrations folder, so there is no
-- file recording where it came from. Its check constraint allows only
-- 'tournament' and 'league':
--
--   CHECK (event_type = ANY (ARRAY['tournament'::text, 'league'::text]))
--
-- Tom's taxonomy has three. Open play is the drop-in session a venue runs
-- weekly, and it behaves differently from both of the others: surface is
-- the only required bracket field, gender and format are optional, and it
-- recurs rather than happening once.
--
-- Without this, a form offering open play would pass validation in the
-- browser and fail at the database. Caught 28 Oct by reading the
-- constraint before building the picker rather than after.

alter table events drop constraint if exists events_event_type_check;

alter table events
  add constraint events_event_type_check
  check (event_type in ('tournament', 'league', 'open_play'));

comment on column events.event_type is
  'tournament | league | open_play. The first question on the submission form, because it decides every question after it.';
