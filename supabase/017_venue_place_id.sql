-- 017_venue_place_id.sql
-- ---------------------------------------------------------------------
-- Google's place ID, and two facts that come free with it.
--
-- Yesterday's merge tools find duplicate venues by comparing names with
-- the punctuation stripped. That works, and it will always be guesswork:
-- "Tsunami Volleyball Center" and "Tsunami VB Ctr" are the same place,
-- and no amount of string cleverness can be certain of it.
--
-- A place ID can. Two venues carrying the same google_place_id are the
-- same place, full stop. That turns duplicate detection from a heuristic
-- into a fact, and it costs nothing: the ID is in Google's cheapest
-- field tier, and we are already paying the tier above it for the
-- display name.
--
-- business_status comes from that same tier we already pay for, and
-- answers a question nobody has been able to ask: has this venue closed?
-- A permanently closed gym hosting a 2027 tournament is bad data that
-- currently has no way of surfacing.

alter table venues add column if not exists google_place_id text;
alter table venues add column if not exists business_status text;
alter table venues add column if not exists place_types     text[];

-- Not a unique constraint. Two records legitimately share a place ID for
-- a moment - while a merge is being confirmed - and a hard constraint
-- would make the duplicate impossible to record rather than impossible
-- to miss. The index makes finding them instant; a person still decides.
create index if not exists venues_google_place_id_idx
  on venues (google_place_id) where google_place_id is not null;

comment on column venues.google_place_id is
  'Google Places ID. Two venues with the same value are certainly the same place - unlike a name match, which is a guess. Null for every venue entered before 4 Nov 2026.';

comment on column venues.business_status is
  'OPERATIONAL, CLOSED_TEMPORARILY or CLOSED_PERMANENTLY, as Google last reported it. Null means never looked up, which is not the same as open.';
