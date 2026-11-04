'use server';

import { revalidatePath } from 'next/cache';
import { sql } from './db';
import { isSignedIn } from './auth';

/**
 * Upgrading the 165 venues that have never had a real pin.
 *
 * Ordered by what is at stake rather than alphabetically: a venue
 * hosting a 2027 event is one a player will try to drive to this season.
 * A venue last used in 2022 is history, and a wrong pin on it costs
 * nobody anything.
 *
 * Deliberately one at a time, with a person confirming each match. An
 * automatic pass over 165 names would be faster and would quietly put
 * some gyms on the wrong street -- and a wrong EXACT pin is worse than
 * an honest approximate one. "Roughly here" is useful. "Precisely here",
 * when it is precisely wrong, sends someone to the wrong building.
 */

export interface BackfillVenue {
  id: string;
  name: string;
  address_line: string | null;
  city: string;
  state: string;
  postal_code: string | null;
  geo_precision: string;
  events: number;
  upcoming: number;
  latest: string | null;
}

export async function venuesNeedingPins(): Promise<BackfillVenue[]> {
  if (!(await isSignedIn())) return [];
  const rows = await sql<BackfillVenue[]>`
    select v.id, v.name, v.address_line, v.city, v.state, v.postal_code,
           v.geo_precision,
           count(e.id)::int                                                    as events,
           count(e.id) filter (where e.starts_on >= current_date)::int         as upcoming,
           max(e.starts_on)::text                                              as latest
      from venues v
      left join events e on e.venue_id = v.id
     where v.geo_precision is distinct from 'exact'
     group by v.id, v.name, v.address_line, v.city, v.state, v.postal_code, v.geo_precision
     order by count(e.id) filter (where e.starts_on >= current_date) desc,
              max(e.starts_on) desc nulls last,
              count(e.id) desc`;
  return [...rows];
}

export async function pinProgress() {
  if (!(await isSignedIn())) return { exact: 0, total: 0 };
  const [row] = await sql<{ exact: number; total: number }[]>`
    select count(*) filter (where geo_precision = 'exact')::int as exact,
           count(*)::int                                        as total
      from venues`;
  return row ?? { exact: 0, total: 0 };
}

/**
 * Write a confirmed match onto one venue.
 *
 * The address is overwritten, not merged. A venue being placed on a real
 * building should carry that building's real address -- keeping the
 * hand-typed one beside exact coordinates from somewhere else is how a
 * record ends up describing two different places at once.
 */
export async function applyPin(input: {
  venueId: string;
  latitude: number;
  longitude: number;
  placeId: string;
  businessStatus: string;
  name: string;
  address_line: string;
  city: string;
  state: string;
  postal_code: string;
}): Promise<{ ok: boolean; message: string }> {
  if (!(await isSignedIn())) return { ok: false, message: 'Sign in first.' };

  const clash = await sql<{ id: string; name: string }[]>`
    select id, name from venues
     where google_place_id = ${input.placeId} and id <> ${input.venueId}
     limit 1`;

  const [row] = await sql<{ name: string }[]>`
    update venues set
      name          = coalesce(nullif(${input.name}, ''), name),
      address_line  = coalesce(nullif(${input.address_line}, ''), address_line),
      city          = coalesce(nullif(${input.city}, ''), city),
      state         = coalesce(nullif(${input.state}, ''), state),
      postal_code   = coalesce(nullif(${input.postal_code}, ''), postal_code),
      latitude      = ${input.latitude},
      longitude     = ${input.longitude},
      geo_precision = 'exact',
      geocoded_at   = now(),
      google_place_id = ${input.placeId || null},
      business_status = ${input.businessStatus || null},
      updated_at    = now()
    where id = ${input.venueId}
    returning name`;

  if (!row) return { ok: false, message: 'That venue no longer exists.' };

  revalidatePath('/admin/venues');
  revalidatePath('/admin/venues/pins');
  revalidatePath('/');

  // Not an error. Two records now provably the same place is the most
  // useful thing this pass produces - a name match could only ever guess
  // at it, and the merge tool can act on it with certainty.
  if (clash.length) {
    return {
      ok: true,
      message: `${row.name} pinned. It shares a Google place with "${clash[0].name}" — the same venue twice. Merge them on the Venues page.`,
    };
  }

  return { ok: true, message: `${row.name} pinned.` };
}
