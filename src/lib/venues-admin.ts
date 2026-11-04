'use server';

import { revalidatePath } from 'next/cache';
import { sql } from './db';
import { isSignedIn } from './auth';

/**
 * Venue records, and putting the duplicates back together.
 *
 * Same disease as organizers, same cause: saveEvent matches a venue on
 * name + city + state exactly, so every spelling of the same gym is its
 * own row, its own map pin, and its own half of the history.
 *
 * Worse here than for organizers, because a venue carries coordinates.
 * Two records for one gym are two pins, and a radius search finds
 * whichever one it finds.
 */

export interface VenueRow {
  id: string;
  name: string;
  address_line: string | null;
  city: string;
  state: string;
  postal_code: string | null;
  geo_precision: string;
  events: number;
  organizers: number;
  match_key: string;
}

/** "Tsunami Volleyball Center" and "Tsunami Volleyball Ctr" both reduce
 *  to roughly the same key, scoped to the city so two gyms called "The
 *  Sandbox" in different states are not proposed as one. */
const KEY_SQL = sql`
  lower(regexp_replace(v.city, '[^a-zA-Z]', '', 'g')) || '|' ||
  regexp_replace(
    regexp_replace(lower(v.name), '[^a-z0-9]', '', 'g'),
    '(center|centre|ctr|complex|club|courts|court|park|the)', '', 'g'
  )`;

export async function listVenues(): Promise<VenueRow[]> {
  if (!(await isSignedIn())) return [];
  const rows = await sql<VenueRow[]>`
    select v.id, v.name, v.address_line, v.city, v.state, v.postal_code,
           v.geo_precision,
           count(e.id)::int                     as events,
           count(distinct e.organizer_id)::int  as organizers,
           ${KEY_SQL}                           as match_key
      from venues v
      left join events e on e.venue_id = v.id
     group by v.id, v.name, v.address_line, v.city, v.state, v.postal_code, v.geo_precision
     order by ${KEY_SQL}, count(e.id) desc`;
  return [...rows];
}

/** Other venue records that look like the same place. */
export async function venueSiblings(id: string) {
  if (!(await isSignedIn())) return [];
  const rows = await sql<
    { id: string; name: string; address_line: string | null; city: string; state: string; events: number }[]
  >`
    with keyed as (
      select v.id, v.name, v.address_line, v.city, v.state, ${KEY_SQL} as k,
             (select count(*)::int from events e where e.venue_id = v.id) as events
        from venues v
    )
    select id, name, address_line, city, state, events from keyed
     where k = (select k from keyed where id = ${id})
       and id <> ${id}
     order by events desc`;
  return [...rows];
}

/**
 * One venue, and who runs events there.
 *
 * The other half of the organizer page. An organizer's page answers
 * "where do they play"; this answers "who plays here" - which is the
 * question worth asking when a venue is the prospect, as it is for every
 * parks department and bar court in the directory.
 */
export async function venueProfile(id: string) {
  if (!(await isSignedIn())) return null;

  const [venue] = await sql<
    {
      id: string; name: string; address_line: string | null; city: string;
      state: string; postal_code: string | null; geo_precision: string;
      latitude: number | null; longitude: number | null;
      google_place_id: string | null; business_status: string | null;
    }[]
  >`select id, name, address_line, city, state, postal_code, geo_precision,
           latitude, longitude, google_place_id, business_status
      from venues where id = ${id}`;
  if (!venue) return null;

  const organizers = await sql<
    {
      id: string | null; name: string | null; events: number;
      earliest: string | null; latest: string | null; upcoming: number;
    }[]
  >`
    select o.id, o.name,
           count(e.id)::int                                             as events,
           min(e.starts_on)::text                                       as earliest,
           max(e.starts_on)::text                                       as latest,
           count(e.id) filter (where e.starts_on >= current_date)::int   as upcoming
      from events e
      left join organizers o on o.id = e.organizer_id
     where e.venue_id = ${id}
     group by o.id, o.name
     order by count(e.id) desc`;

  const events = await sql<
    { id: string; name: string; starts_on: string; status: string; organizer: string | null }[]
  >`
    select e.id, e.name, e.starts_on::text, e.status, o.name as organizer
      from events e
      left join organizers o on o.id = e.organizer_id
     where e.venue_id = ${id}
     order by e.starts_on desc`;

  return { venue, organizers: [...organizers], events: [...events] };
}

/**
 * Fold one venue into another.
 *
 * Events move first, for the same reason as organizers: venue_id is
 * nullable, so deleting first would strand the events with no location
 * and drop them out of every search that uses one.
 *
 * The winner keeps anything it has and inherits anything it lacks. The
 * exception is coordinates, which move as a set with the precision that
 * earned them - taking a latitude from one record and a precision from
 * another would describe a pin that was never actually looked up.
 */
export async function mergeVenues(
  loserId: string,
  winnerId: string,
): Promise<{ ok: boolean; message: string }> {
  if (!(await isSignedIn())) return { ok: false, message: 'Sign in first.' };
  if (loserId === winnerId) return { ok: false, message: 'Those are the same record.' };

  const [winner] = await sql<{ name: string }[]>`select name from venues where id = ${winnerId}`;
  const [loser] = await sql<{ name: string }[]>`select name from venues where id = ${loserId}`;
  if (!winner || !loser) return { ok: false, message: 'One of those records no longer exists.' };

  const moved = await sql`
    update events set venue_id = ${winnerId} where venue_id = ${loserId}`;

  await sql`
    update venues w set
      address_line = coalesce(w.address_line, l.address_line),
      postal_code  = coalesce(w.postal_code,  l.postal_code)
    from venues l
    where w.id = ${winnerId} and l.id = ${loserId}`;

  // Coordinates travel together or not at all, and only to a record that
  // has none - a better pin should never be overwritten by a worse one.
  await sql`
    update venues w set
      latitude      = l.latitude,
      longitude     = l.longitude,
      geo_precision = l.geo_precision,
      geocoded_at   = l.geocoded_at
    from venues l
    where w.id = ${winnerId} and l.id = ${loserId}
      and w.latitude is null and l.latitude is not null`;

  await sql`delete from venues where id = ${loserId}`;

  revalidatePath('/admin/venues');
  revalidatePath('/admin/organizers');
  revalidatePath('/');

  const n = moved.count ?? 0;
  return {
    ok: true,
    message: `Merged "${loser.name}" into "${winner.name}" — ${n} ${n === 1 ? 'event' : 'events'} moved.`,
  };
}
