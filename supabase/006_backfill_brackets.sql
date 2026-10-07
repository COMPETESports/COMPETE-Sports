-- COMPETE — file 10 of 10: build the brackets
--
-- A "bracket" is one competition inside an event: Men's Doubles AA is a
-- bracket, Coed Quads BB is another. The same event often runs several.
--
-- This has to run AFTER the events are loaded. File 004 created the table
-- but there was no data to work from at the time, so this fills it in.
-- Without it, searching for a combination — coed AND quads AND BB — would
-- find nothing, because nothing would know which combinations exist.
--
-- Safe to run twice; the second run inserts nothing.

insert into event_brackets (event_id, format_id, division_id, confirmed)
select ef.event_id, ef.format_id, ed.division_id, false
from event_formats ef
left join event_divisions ed on ed.event_id = ef.event_id
on conflict on constraint event_brackets_unique do nothing;

-- Show the result so you can see it worked.
select count(*) as brackets_built,
       count(distinct event_id) as events_covered
  from event_brackets;
