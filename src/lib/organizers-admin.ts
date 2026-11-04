'use server';

import { revalidatePath } from 'next/cache';
import { sql } from './db';
import { isSignedIn } from './auth';

/**
 * Organizer records, and putting the duplicates back together.
 *
 * Angry Dragon is four records: "Angry Dragon" (11 events, 2022), "Angry
 * Dragons" (7, 2023), "Angry Dragons Volleyball" (8, 2024) and "Angry
 * Dragon Volleyball" (10, 2026-27). One organization, split four ways,
 * and the split is chronological -- each import era named them slightly
 * differently. So this is systematic, and most multi-season organizers
 * in the database look the same.
 *
 * It matters because the whole partner pitch is "here is your page, it
 * is free, your schedule is already on it." A page showing a quarter of
 * someone's history makes that pitch weaker, not stronger.
 *
 * saveEvent matches an organizer by slug, so it will keep producing
 * these until the form offers the existing record the way the venue
 * picker does. Merging is the repair; the picker is the cure.
 */

export interface OrganizerRow {
  id: string;
  slug: string;
  name: string;
  contact_email: string | null;
  website_url: string | null;
  events: number;
  earliest: string | null;
  latest: string | null;
  venues: number;
  /** Organizers whose names collapse to this once punctuation, case and a
   *  trailing plural are stripped. Used to cluster likely duplicates. */
  match_key: string;
}

/** "Angry Dragons Volleyball" and "Angry Dragon" both reduce to "angrydragon". */
const KEY_SQL = sql`
  regexp_replace(
    regexp_replace(lower(o.name), '[^a-z0-9]', '', 'g'),
    '(volleyball|vb|sports|s)+$', ''
  )`;

export async function listOrganizers(): Promise<OrganizerRow[]> {
  if (!(await isSignedIn())) return [];
  const rows = await sql<OrganizerRow[]>`
    select o.id, o.slug, o.name, o.contact_email, o.website_url,
           count(e.id)::int                           as events,
           min(e.starts_on)::text                     as earliest,
           max(e.starts_on)::text                     as latest,
           count(distinct e.venue_id)::int            as venues,
           ${KEY_SQL}                                 as match_key
      from organizers o
      left join events e on e.organizer_id = o.id
     group by o.id, o.slug, o.name, o.contact_email, o.website_url
     order by ${KEY_SQL}, count(e.id) desc`;
  return [...rows];
}

export interface OrganizerVenue {
  venue_id: string | null;
  venue_name: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  geo_precision: string | null;
  events: {
    id: string;
    name: string;
    slug: string;
    starts_on: string;
    status: string;
    event_type: string;
    brackets: number;
  }[];
}

/** One organizer's whole history, grouped by the venue it happened at. */
export async function organizerProfile(id: string) {
  if (!(await isSignedIn())) return null;

  const [org] = await sql<
    { id: string; slug: string; name: string; contact_email: string | null; website_url: string | null }[]
  >`select id, slug, name, contact_email, website_url from organizers where id = ${id}`;
  if (!org) return null;

  const rows = await sql<
    {
      venue_id: string | null;
      venue_name: string | null;
      address_line: string | null;
      city: string | null;
      state: string | null;
      postal_code: string | null;
      geo_precision: string | null;
      id: string;
      name: string;
      slug: string;
      starts_on: string;
      status: string;
      event_type: string;
      brackets: number;
    }[]
  >`
    select v.id as venue_id, v.name as venue_name, v.address_line, v.city, v.state,
           v.postal_code, v.geo_precision,
           e.id, e.name, e.slug, e.starts_on::text, e.status, e.event_type,
           (select count(*)::int from event_brackets b where b.event_id = e.id) as brackets
      from events e
      left join venues v on v.id = e.venue_id
     where e.organizer_id = ${id}
     order by v.name nulls last, e.starts_on desc`;

  // Group in code rather than SQL: the shape the page wants is a list of
  // venues each holding its events, which json aggregation makes harder
  // to read than it makes fast.
  const byVenue = new Map<string, OrganizerVenue>();
  for (const r of rows) {
    const key = r.venue_id ?? 'none';
    if (!byVenue.has(key)) {
      byVenue.set(key, {
        venue_id: r.venue_id,
        venue_name: r.venue_name,
        address_line: r.address_line,
        city: r.city,
        state: r.state,
        postal_code: r.postal_code,
        geo_precision: r.geo_precision,
        events: [],
      });
    }
    byVenue.get(key)!.events.push({
      id: r.id, name: r.name, slug: r.slug, starts_on: r.starts_on,
      status: r.status, event_type: r.event_type, brackets: r.brackets,
    });
  }

  // Other records that look like the same organization.
  const siblings = await sql<{ id: string; name: string; events: number }[]>`
    with keyed as (
      select o.id, o.name, ${KEY_SQL} as k,
             (select count(*)::int from events e where e.organizer_id = o.id) as events
        from organizers o
    )
    select id, name, events from keyed
     where k = (select k from keyed where id = ${id})
       and id <> ${id}
     order by events desc`;

  return {
    organizer: org,
    venues: [...byVenue.values()],
    total: rows.length,
    siblings: [...siblings],
  };
}

export interface LinkedVenue {
  venue_id: string;
  name: string;
  address_line: string | null;
  city: string;
  state: string;
  postal_code: string | null;
  geo_precision: string;
  is_home: boolean;
  source: string;
  events: number;
}

/**
 * The venues an organizer uses, as a stated fact rather than an
 * inference from their events. See 018 for why both exist.
 */
export async function organizerVenues(organizerId: string): Promise<LinkedVenue[]> {
  if (!(await isSignedIn())) return [];
  const rows = await sql<LinkedVenue[]>`
    select v.id as venue_id, v.name, v.address_line, v.city, v.state,
           v.postal_code, v.geo_precision, ov.is_home, ov.source,
           (select count(*)::int from events e
             where e.venue_id = v.id and e.organizer_id = ${organizerId}) as events
      from organizer_venues ov
      join venues v on v.id = ov.venue_id
     where ov.organizer_id = ${organizerId}
     order by ov.is_home desc, v.name`;
  return [...rows];
}

/** Record that an organizer uses a venue, because somebody said so. */
export async function linkVenue(
  organizerId: string,
  venueId: string,
): Promise<{ ok: boolean; message: string }> {
  if (!(await isSignedIn())) return { ok: false, message: 'Sign in first.' };
  const [venue] = await sql<{ name: string }[]>`select name from venues where id = ${venueId}`;
  if (!venue) return { ok: false, message: 'That venue no longer exists.' };

  // A stated link outranks one inferred from events, so saying it out
  // loud upgrades the record rather than colliding with it.
  await sql`
    insert into organizer_venues (organizer_id, venue_id, source)
    values (${organizerId}, ${venueId}, 'stated')
    on conflict (organizer_id, venue_id) do update set source = 'stated'`;

  revalidatePath(`/admin/organizers/${organizerId}`);
  return { ok: true, message: `${venue.name} linked.` };
}

export async function unlinkVenue(
  organizerId: string,
  venueId: string,
): Promise<{ ok: boolean; message: string }> {
  if (!(await isSignedIn())) return { ok: false, message: 'Sign in first.' };
  // Events are untouched. Removing a link says "they do not use this
  // place", not "that event never happened".
  await sql`
    delete from organizer_venues
     where organizer_id = ${organizerId} and venue_id = ${venueId}`;
  revalidatePath(`/admin/organizers/${organizerId}`);
  return { ok: true, message: 'Venue unlinked. Events are unchanged.' };
}

/** Mark one venue as this organizer's main room. */
export async function setHomeVenue(
  organizerId: string,
  venueId: string,
): Promise<{ ok: boolean; message: string }> {
  if (!(await isSignedIn())) return { ok: false, message: 'Sign in first.' };
  await sql`
    update organizer_venues set is_home = (venue_id = ${venueId})
     where organizer_id = ${organizerId}`;
  revalidatePath(`/admin/organizers/${organizerId}`);
  return { ok: true, message: 'Home venue set.' };
}

/**
 * Fold one organizer into another: every event repointed, the loser gone.
 *
 * Repointing before deleting matters. events.organizer_id is `on delete
 * set null`, so deleting first would quietly orphan the very history
 * being rescued -- the events would survive with no organizer at all,
 * and nothing would show it had happened.
 */
export async function mergeOrganizers(
  loserId: string,
  winnerId: string,
): Promise<{ ok: boolean; message: string }> {
  if (!(await isSignedIn())) return { ok: false, message: 'Sign in first.' };
  if (loserId === winnerId) return { ok: false, message: 'Those are the same record.' };

  const [winner] = await sql<{ name: string }[]>`select name from organizers where id = ${winnerId}`;
  const [loser] = await sql<{ name: string }[]>`select name from organizers where id = ${loserId}`;
  if (!winner || !loser) return { ok: false, message: 'One of those records no longer exists.' };

  const moved = await sql`
    update events set organizer_id = ${winnerId} where organizer_id = ${loserId}`;

  // Keep any contact detail the loser had and the winner lacked, rather
  // than losing researched information to a tidy-up.
  await sql`
    update organizers w set
      contact_email = coalesce(w.contact_email, l.contact_email),
      website_url   = coalesce(w.website_url,   l.website_url)
    from organizers l
    where w.id = ${winnerId} and l.id = ${loserId}`;

  // Venue links follow as well, or merging would lose the knowledge of
  // where the absorbed record used to play.
  await sql`
    insert into organizer_venues (organizer_id, venue_id, is_home, source, note)
    select ${winnerId}, venue_id, false, source, note
      from organizer_venues where organizer_id = ${loserId}
    on conflict (organizer_id, venue_id) do nothing`;
  await sql`delete from organizer_venues where organizer_id = ${loserId}`;

  // Anything in the CRM pointing at the loser follows the events.
  await sql`
    update partner_prospects set organizer_id = ${winnerId}
     where organizer_id = ${loserId}`;

  await sql`delete from organizers where id = ${loserId}`;

  revalidatePath('/admin/organizers');
  revalidatePath('/admin/events');
  revalidatePath('/');

  const n = moved.count ?? 0;
  return {
    ok: true,
    message: `Merged "${loser.name}" into "${winner.name}" — ${n} ${n === 1 ? 'event' : 'events'} moved.`,
  };
}
